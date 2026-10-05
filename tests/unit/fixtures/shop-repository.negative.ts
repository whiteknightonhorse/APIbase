import { getOrder, listOrders, listProducts } from '../../../src/shop/repository';
import type { ShopTx } from '../../../src/shop/db';

declare const db: ShopTx;

export async function unscoped(): Promise<void> {
  // @ts-expect-error merchant_id is mandatory
  await listOrders(db, {});
  // @ts-expect-error merchant_id is mandatory
  await listProducts(db, { limit: 5 });
  // @ts-expect-error merchant_id is mandatory
  await getOrder(db, { order_id: 'x' });
}
