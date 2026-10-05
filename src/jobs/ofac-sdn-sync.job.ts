import { getPrisma } from '../services/prisma.service';
import { syncOfacSdn } from '../shop/moderation/sanctions';

/** Daily OFAC SDN -> shop_sanctioned_addresses. Cron wiring in worker/server.ts is a separate step. */
export async function run(): Promise<void> {
  await syncOfacSdn(getPrisma());
}
