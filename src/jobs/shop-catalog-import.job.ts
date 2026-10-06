import { runShopCatalogImport } from '../shop/catalog-import/import.service';
import { defaultShopDeps } from '../shop/merchant-lifecycle.service';

/** F-2 / UC-11: runs queued catalog feed imports (CSV, Google Merchant Center, Shopify). */
export const runShopCatalogImportJob = (): Promise<number> =>
  runShopCatalogImport(defaultShopDeps());
