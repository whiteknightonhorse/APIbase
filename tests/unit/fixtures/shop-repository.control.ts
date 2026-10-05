import { getOrder, listOrders, listProducts } from '../../../src/shop/repository';
import type { ShopTx } from '../../../src/shop/db';

declare const db: ShopTx;

export async function unscoped(): Promise<void> {
  await listOrders(db, {});
  await listProducts(db, { limit: 5 });
  await getOrder(db, { order_id: 'x' });
}
