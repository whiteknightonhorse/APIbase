/**
 * Device OAuth code-exchange stage (F3 fix).
 *
 * check-adapter-import-boundary.py blocks any value-import reaching into
 * src/adapters/** from outside src/adapters/**, src/pipeline/**, or
 * tests/** -- device-connect.router.ts was importing `tuyaExchangeCode`
 * straight out of src/adapters/device-tuya, exactly the shape that gate
 * exists to catch (main was promoted and deployed with this gate RED).
 *
 * Deliberately does NOT go through registry.resolveAdapter(): that pulls
 * the FULL adapter registry (all ~370 adapters, including polymarket's
 * ESM-only @polymarket/clob-client, which Jest's CJS transform cannot
 * parse) just to reach one stateless class. DeviceAdapter holds no
 * constructor state (see its own class doc -- "adapters are singletons,
 * stateless, safe to share"), so a fresh instance here behaves identically
 * to the registry's cached one; this is the same class instantiated the
 * same way registry.ts's own 'device' case does.
 */
import { DeviceAdapter } from '../../adapters/device-tuya';
import type { TuyaConfig, TuyaTokenResult } from '../../adapters/device-tuya/tuya-client';

export async function exchangeTuyaCode(cfg: TuyaConfig, code: string): Promise<TuyaTokenResult> {
  return new DeviceAdapter().exchangeTuyaCode(cfg, code);
}
