/**
 * T-INT-01 SC7 (atomic reservation) and SC8 (cross-tenant isolation + type-level guard).
 */
import { join } from 'path';
import ts from 'typescript';
import {
  convertReservation,
  getOrder,
  listOrders,
  releaseReservation,
  reserveStock,
} from '../../src/shop/repository';
import {
  client,
  dbDescribe,
  migrate,
  mkMerchant,
  mkOrder,
  mkProduct,
  mkQuote,
} from './helpers/shop-db';

dbDescribe('shop repository', () => {
  const db = client();
  beforeAll(() => migrate());
  afterAll(() => db.$disconnect());

  const stock = async (p: string) =>
    (
      await db.$queryRawUnsafe<Array<{ available: number; reserved: number }>>(
        `SELECT available, reserved FROM shop_products WHERE product_id = $1::uuid`,
        p,
      )
    )[0];
  const reserve = (m: string, p: string, qty = 1) =>
    db.$transaction((tx) =>
      reserveStock(
        tx,
        { merchant_id: m },
        {
          product_id: p,
          qty,
          quote_id:
            '11111111-1111-4111-8111-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0'),
          expires_at: new Date(Date.now() + 600_000),
        },
      ),
    );

  it('SC7: available=1, two parallel qty=1 -> exactly one true, reserved=1; release -> 0', async () => {
    const m = await mkMerchant(db);
    const p = await mkProduct(db, m, { available: 1 });
    const results = await Promise.all([reserve(m, p), reserve(m, p)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await stock(p)).toEqual({ available: 1, reserved: 1 });
    const held = await db.$queryRawUnsafe<Array<{ quote_id: string }>>(
      `SELECT quote_id FROM shop_inventory_reservations WHERE product_id = $1::uuid`,
      p,
    );
    expect(held).toHaveLength(1);
    await db.$transaction((tx) => releaseReservation(tx, { merchant_id: m }, held[0].quote_id));
    expect(await stock(p)).toEqual({ available: 1, reserved: 0 });
  });

  it('convertReservation turns the hold into a sale; other merchant cannot reserve my product', async () => {
    const m = await mkMerchant(db);
    const other = await mkMerchant(db);
    const p = await mkProduct(db, m, { available: 3 });
    expect(await reserve(other, p)).toBe(false);
    expect(await reserve(m, p, 2)).toBe(true);
    expect(await reserve(m, p, 2)).toBe(false); // 3 - 2 < 2
    const [{ quote_id }] = await db.$queryRawUnsafe<Array<{ quote_id: string }>>(
      `SELECT quote_id FROM shop_inventory_reservations WHERE product_id = $1::uuid`,
      p,
    );
    await db.$transaction((tx) => convertReservation(tx, { merchant_id: m }, quote_id));
    expect(await stock(p)).toEqual({ available: 1, reserved: 0 });
  });

  it('SC8: listOrders / getOrder only see the caller merchant', async () => {
    const a = await mkMerchant(db);
    const b = await mkMerchant(db);
    const oa = await mkOrder(db, a, await mkQuote(db, a));
    const ob = await mkOrder(db, b, await mkQuote(db, b));
    const listed = await listOrders(db, { merchant_id: a });
    expect(listed.map((o) => o.order_id)).toEqual([oa]);
    expect(await getOrder(db, { merchant_id: a, order_id: ob })).toBeNull();
    expect((await getOrder(db, { merchant_id: b, order_id: ob }))?.order_id).toBe(ob);
  });
});

describe('SC8: the type forbids calling without merchant_id', () => {
  const diagnostics = (file: string) => {
    const program = ts.createProgram([join(__dirname, 'fixtures', file)], {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      types: [],
    });
    return ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  };
  it('negative fixture: each unscoped call carries @ts-expect-error and tsc is clean', () => {
    expect(diagnostics('shop-repository.negative.ts')).toEqual([]);
  });
  it('control: the same calls WITHOUT the directive are type errors', () => {
    const errs = diagnostics('shop-repository.control.ts');
    expect(errs.length).toBeGreaterThanOrEqual(3);
    expect(errs.join('\n')).toMatch(/merchant_id/);
  });
});
