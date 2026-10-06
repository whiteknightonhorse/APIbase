import { z } from 'zod';

/**
 * T-INT-21 (spec 10.2 / F-7): buyer data reaches us ONLY as an end-to-end encrypted envelope.
 * The server never decrypts and never holds a key: it checks the shape, the size, `kid` against the
 * merchant's current key (pii.service.ts) and stores the bytes.
 */
export const PII_KINDS = ['shipping_address', 'passport', 'phone', 'company'] as const;
export type PiiKind = (typeof PII_KINDS)[number];

export const PII_ALGS = ['hpke-x25519-sha256-chacha20', 'sealed-box-x25519'] as const;
export type PiiAlg = (typeof PII_ALGS)[number];

export const MAX_ENVELOPE_BYTES = 16 * 1024;
const MAX_B64_CHARS = Math.ceil(MAX_ENVELOPE_BYTES / 3) * 4;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export const envelopeSchema = z
  .object({
    kid: z.string().min(1).max(64),
    alg: z.enum(PII_ALGS),
    ciphertext_b64: z
      .string()
      .min(1)
      .max(MAX_B64_CHARS)
      .regex(B64_RE)
      .refine((s) => s.length % 4 === 0),
  })
  .strict();

export interface PiiEnvelope {
  kid: string;
  alg: PiiAlg;
  ciphertext: Buffer;
}

export const PII_DOCS_URL = '/integrator#pii';
const PLAINTEXT_MESSAGE = 'encrypt with merchant key, see docs';

/**
 * Carries a code and a fixed message ONLY: the offending value (and zod's `received`) is never kept,
 * so no handler downstream can echo or log it.
 */
export class PiiRejected extends Error {
  constructor(
    readonly code: 'pii_plaintext_rejected' | 'pii_alg_unsupported' | 'pii_unexpected_kind',
    message: string = PLAINTEXT_MESSAGE,
  ) {
    super(message);
    this.name = 'PiiRejected';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * `pii` of shop.order.pay: `{ <kind>: {kid, alg, ciphertext_b64} }` and nothing else. A string, a
 * number, an object carrying readable fields, any extra field, a bad base64 or more than 16 KB
 * decoded -> PiiRejected (400). `undefined` -> no envelopes.
 */
export function parsePiiEnvelopes(raw: unknown): Map<PiiKind, PiiEnvelope> {
  const out = new Map<PiiKind, PiiEnvelope>();
  if (raw === undefined || raw === null) return out;
  if (!isRecord(raw)) throw new PiiRejected('pii_plaintext_rejected');
  for (const [kind, value] of Object.entries(raw)) {
    if (!(PII_KINDS as readonly string[]).includes(kind)) {
      throw new PiiRejected('pii_unexpected_kind', 'pii kind is not supported');
    }
    const parsed = envelopeSchema.safeParse(value);
    if (!parsed.success) {
      if (
        isRecord(value) &&
        Object.keys(value).sort().join() === 'alg,ciphertext_b64,kid' &&
        typeof value.alg === 'string' &&
        !(PII_ALGS as readonly string[]).includes(value.alg)
      ) {
        throw new PiiRejected('pii_alg_unsupported', 'alg must be one of the documented values');
      }
      throw new PiiRejected('pii_plaintext_rejected');
    }
    const ciphertext = Buffer.from(parsed.data.ciphertext_b64, 'base64');
    if (ciphertext.length === 0 || ciphertext.length > MAX_ENVELOPE_BYTES) {
      throw new PiiRejected('pii_plaintext_rejected');
    }
    out.set(kind as PiiKind, { kid: parsed.data.kid, alg: parsed.data.alg, ciphertext });
  }
  return out;
}
