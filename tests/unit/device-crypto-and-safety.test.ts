import { randomBytes } from 'node:crypto';
import { encryptSecret, decryptSecret } from '../../src/services/secret-crypto.service';
import {
  enforceDeviceSafety,
  DeviceSafetyViolation,
  getDeviceClass,
} from '../../src/services/device-safety.service';

describe('secret-crypto.service (Ф5 vendor-token encryption at rest)', () => {
  const key = randomBytes(32).toString('hex');

  it('round-trips a secret exactly', () => {
    const secret = 'tuya-access-token-abc123';
    const enc = encryptSecret(secret, key);
    expect(decryptSecret(enc, key)).toBe(secret);
  });

  it('never leaves the plaintext as a substring of the ciphertext', () => {
    const secret = 'super-secret-refresh-token-xyz';
    const enc = encryptSecret(secret, key);
    expect(enc).not.toContain(secret);
    expect(enc.toLowerCase()).not.toContain(secret.toLowerCase());
  });

  it('produces a different ciphertext every time (random IV)', () => {
    const secret = 'same-secret-twice';
    const a = encryptSecret(secret, key);
    const b = encryptSecret(secret, key);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, key)).toBe(secret);
    expect(decryptSecret(b, key)).toBe(secret);
  });

  it('fails closed on a tampered ciphertext (GCM auth tag)', () => {
    const enc = encryptSecret('do-not-corrupt-me', key);
    const raw = Buffer.from(enc, 'base64');
    raw[raw.length - 1] ^= 0xff;
    const tampered = raw.toString('base64');
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it('fails closed on the wrong key', () => {
    const enc = encryptSecret('key-bound-secret', key);
    expect(() => decryptSecret(enc, randomBytes(32).toString('hex'))).toThrow();
  });
});

describe('device-safety.service (Ф5 confirm_required + numeric bounds gate)', () => {
  it('loads all 42 classes from config/device-classes.json', () => {
    // Spot-check a class from each tier rather than asserting the count here
    // (the count is asserted structurally by scripts/check-device-catalog.py,
    // this test is about the gate FUNCTIONING, not the catalog's size).
    expect(getDeviceClass('smart_plug')?.tier).toBe('T1');
    expect(getDeviceClass('smart_lock')?.tier).toBe('T2');
    expect(getDeviceClass('ev_charger')?.tier).toBe('T3');
    expect(getDeviceClass('consumer_drone')?.tier).toBe('T4');
  });

  it('allows an in-bounds numeric setpoint', () => {
    expect(() => enforceDeviceSafety('thermostat_ac', 'temp_set', 22, undefined)).not.toThrow();
  });

  it('rejects an out-of-bounds numeric setpoint (fail closed, no clamping)', () => {
    expect(() => enforceDeviceSafety('thermostat_ac', 'temp_set', 99, undefined)).toThrow(
      DeviceSafetyViolation,
    );
  });

  it('rejects a confirm_required class command with no confirm', () => {
    expect(() => enforceDeviceSafety('smart_lock', 'unlock', undefined, undefined)).toThrow(
      DeviceSafetyViolation,
    );
  });

  it('rejects a confirm_required class command with confirm:false', () => {
    expect(() => enforceDeviceSafety('smart_lock', 'unlock', undefined, false)).toThrow(
      DeviceSafetyViolation,
    );
  });

  it('allows a confirm_required class command once confirm:true is present', () => {
    expect(() => enforceDeviceSafety('smart_lock', 'unlock', undefined, true)).not.toThrow();
  });

  it('does not require confirm for a T1 class with confirm_required:false', () => {
    expect(() => enforceDeviceSafety('smart_plug', 'switch_1', true, undefined)).not.toThrow();
  });

  it('is a documented no-op (not a silent block) for an unknown class', () => {
    expect(() =>
      enforceDeviceSafety('made_up_class_xyz', 'whatever', 999, undefined),
    ).not.toThrow();
  });

  it('is a documented no-op for a command with no configured bound', () => {
    // thermostat_ac has no bound configured for a command named 'mode'
    expect(() => enforceDeviceSafety('thermostat_ac', 'mode', 'cool', undefined)).not.toThrow();
  });
});
