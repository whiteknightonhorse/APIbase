import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Ф5 device-safety gate -- reads config/device-classes.json (calibration
 * data, not code) and enforces it before any command reaches a vendor cloud.
 *
 * Two independent checks, both fail-closed:
 *   1. confirm_required -- a class-level flag; if true, the call MUST carry
 *      `confirm: true` (schema-level z.literal(true) enforces the shape too,
 *      this is the belt to that schema's suspenders so a future schema
 *      change can't silently drop the requirement).
 *   2. bounds -- numeric commands (temperature setpoint, brightness, amps,
 *      portion size, duration) must fall within the class's configured
 *      [min, max]. A command whose value key has no declared bound is
 *      allowed through unchecked (bounds are an allow-list of *known*
 *      numeric commands, not a claim every possible command is covered --
 *      see docs/09-device-mcp-layer.md's disclosed-gap note).
 */

export interface DeviceBound {
  min: number;
  max: number;
}

export interface DeviceClassSafety {
  confirm_required: boolean;
  bounds: Record<string, DeviceBound>;
}

export interface DeviceClassDescriptor {
  class: string;
  tier: string;
  capabilities: string[];
  limits: { rate_cap_per_min: number };
  safety: DeviceClassSafety;
}

interface DeviceClassesConfig {
  classes: DeviceClassDescriptor[];
}

let cached: Map<string, DeviceClassDescriptor> | null = null;

function loadConfig(): Map<string, DeviceClassDescriptor> {
  if (cached) return cached;
  const raw = readFileSync(resolve(__dirname, '../../config/device-classes.json'), 'utf-8');
  const parsed = JSON.parse(raw) as DeviceClassesConfig;
  cached = new Map(parsed.classes.map((c) => [c.class, c]));
  return cached;
}

export function getDeviceClass(className: string): DeviceClassDescriptor | undefined {
  return loadConfig().get(className);
}

export class DeviceSafetyViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceSafetyViolation';
  }
}

/**
 * Enforce confirm_required + numeric bounds for one command.
 * `command` is the DP code (e.g. 'temp_set', 'bright_value'); `value` is
 * whatever the caller passed for it. Throws DeviceSafetyViolation (fail
 * closed) on any violation -- never clamps and proceeds silently.
 */
export function enforceDeviceSafety(
  className: string | undefined,
  command: string,
  value: unknown,
  confirm: boolean | undefined,
): void {
  if (!className) return; // unknown class: nothing to enforce against (disclosed gap, not silent)
  const desc = getDeviceClass(className);
  if (!desc) return;

  if (desc.safety.confirm_required && confirm !== true) {
    throw new DeviceSafetyViolation(
      `Class '${className}' requires confirm:true for any command (got ${JSON.stringify(confirm)})`,
    );
  }

  const bound = desc.safety.bounds[command];
  if (bound && typeof value === 'number') {
    if (value < bound.min || value > bound.max) {
      throw new DeviceSafetyViolation(
        `Class '${className}' command '${command}' value ${value} outside configured bound [${bound.min}, ${bound.max}]`,
      );
    }
  }
}

/** Self-check. Run via `tsx src/services/device-safety.service.ts`. */
export function demo(): void {
  // AC temperature bound is [16, 30] in config/device-classes.json.
  enforceDeviceSafety('thermostat_ac', 'temp_set', 22, undefined); // must pass
  let threw = false;
  try {
    enforceDeviceSafety('thermostat_ac', 'temp_set', 45, undefined);
  } catch (e) {
    threw = e instanceof DeviceSafetyViolation;
  }
  if (!threw) throw new Error('FAIL: out-of-bounds temp was not rejected');

  // Confirm-required class (synthetic: smart_lock in T2).
  threw = false;
  try {
    enforceDeviceSafety('smart_lock', 'unlock', undefined, undefined);
  } catch (e) {
    threw = e instanceof DeviceSafetyViolation;
  }
  if (!threw) throw new Error('FAIL: missing confirm on a confirm_required class was not rejected');

  enforceDeviceSafety('smart_lock', 'unlock', undefined, true); // must pass with confirm

  // Unknown class: no bound configured -- must not throw (documented gap).
  enforceDeviceSafety('nonexistent_class', 'whatever', 999, undefined);

  // eslint-disable-next-line no-console
  console.log('device-safety.service demo: PASS (bounds + confirm_required both fail-closed)');
}

if (require.main === module) {
  demo();
}
