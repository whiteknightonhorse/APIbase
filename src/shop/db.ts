/**
 * Minimal raw-SQL handle shared by src/shop/*. A Prisma `TransactionClient` (or the
 * PrismaClient itself) satisfies it structurally; tests can pass their own.
 */
export interface ShopTx {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}
