import pino from 'pino';
import { randomUUID, createHash } from 'node:crypto';
import { Writable } from 'node:stream';

// ---------------------------------------------------------------------------
// Constants (§12.246)
// ---------------------------------------------------------------------------
const MAX_LOG_ENTRY_BYTES = 10 * 1024; // 10KB
const MAX_REQUEST_ID_LEN = 128;

// ---------------------------------------------------------------------------
// Redaction helpers (§12.92)
// ---------------------------------------------------------------------------

/** Mask API key: first 12 chars + **** + last 4 chars */
function maskApiKey(key: string): string {
  if (key.length <= 16) return '****';
  return key.slice(0, 12) + '****' + key.slice(-4);
}

/** Mask email: first char + *** + @domain */
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '****';
  return email[0] + '***' + email.slice(at);
}

/** Integrator §8.5: key NAMES whose value (string or structure) is never logged. */
function isSensitiveShopKey(lk: string): boolean {
  return (
    lk === 'pii' ||
    lk === 'encryption_key' ||
    lk === 'webhook_url' ||
    lk.startsWith('passport') ||
    lk.startsWith('address')
  );
}

/** Redact known sensitive patterns in an arbitrary string value. */
function redactString(key: string, value: string): string {
  const lk = key.toLowerCase();
  // Integrator §8.5: by VALUE first, in any field -- only prefix and length survive.
  if (value.startsWith('mk_live_') || value.startsWith('whsec_')) {
    return `${value.startsWith('mk_live_') ? 'mk_live_' : 'whsec_'}…(len=${value.length})`;
  }
  if (lk.startsWith('ciphertext')) {
    return `<ciphertext sha256:${createHash('sha256').update(value).digest('hex').slice(0, 8)} len=${value.length}>`;
  }
  if (isSensitiveShopKey(lk)) return '[REDACTED]';
  // F7: access_token/refresh_token (OAuth tokens, e.g. device-connect's Tuya flow) were
  // going out in plaintext -- only api_key/apikey/authorization were masked. Matched the
  // same way api_key is: partial mask, useful for support/debugging without exposing the
  // live credential.
  if (
    lk.includes('api_key') ||
    lk.includes('apikey') ||
    lk === 'authorization' ||
    lk.includes('token')
  ) {
    return maskApiKey(value);
  }
  if (lk === 'email') {
    return maskEmail(value);
  }
  // F7: client_secret/password/secret were also going out in plaintext. Full redact, same
  // treatment as provider_key -- unlike a token, there is no safe partial mask for a secret
  // or password (support/debugging never needs to see even a fragment of it).
  if (lk.startsWith('provider_key') || lk.includes('secret') || lk.includes('password')) {
    return '[REDACTED]';
  }
  return value;
}

/** Deep-walk an object and redact sensitive fields. */
export function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      out[k] = redactString(k, v);
    } else if (v !== null && typeof v === 'object' && isSensitiveShopKey(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else if (v !== null && typeof v === 'object' && k.toLowerCase().startsWith('ciphertext')) {
      out[k] = '<ciphertext>';
    } else if (Array.isArray(v)) {
      out[k] = v.map((el) =>
        typeof el === 'string'
          ? redactString(k, el)
          : el !== null && typeof el === 'object' && !Array.isArray(el)
            ? redactObject(el as Record<string, unknown>)
            : el,
      );
    } else if (v !== null && typeof v === 'object') {
      out[k] = redactObject(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Size-capped destination stream (§12.246 — 10KB max entry)
// ---------------------------------------------------------------------------

const truncatingStream = new Writable({
  write(chunk: Buffer, _encoding, callback) {
    const line = chunk.toString();
    if (Buffer.byteLength(line, 'utf8') > MAX_LOG_ENTRY_BYTES) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const truncated = JSON.stringify({
          level: parsed.level,
          time: parsed.time,
          msg:
            typeof parsed.msg === 'string' ? parsed.msg.slice(0, 500) + '...truncated' : parsed.msg,
          _truncated: true,
          _original_size: Buffer.byteLength(line, 'utf8'),
        });
        process.stdout.write(truncated + '\n', callback);
      } catch {
        process.stdout.write(line, callback);
      }
      return;
    }
    process.stdout.write(line, callback);
  },
});

// ---------------------------------------------------------------------------
// Pino instance (§12.32, §12.246)
// ---------------------------------------------------------------------------

const level =
  process.env.NODE_ENV === 'production'
    ? 'info'
    : process.env.NODE_ENV === 'test'
      ? 'silent'
      : 'debug';

export const logger = pino(
  {
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    hooks: {
      logMethod(inputArgs, method) {
        // Redact sensitive fields in merge objects
        if (inputArgs.length >= 2 && typeof inputArgs[0] === 'object' && inputArgs[0] !== null) {
          inputArgs[0] = redactObject(inputArgs[0] as Record<string, unknown>);
        }
        return method.apply(this, inputArgs as Parameters<typeof method>);
      },
    },
    serializers: {
      err: pino.stdSerializers.err,
    },
  },
  truncatingStream,
);

// ---------------------------------------------------------------------------
// Request-ID helpers (§12.108, §12.123)
// ---------------------------------------------------------------------------

const REQUEST_ID_RE = /^[\x20-\x7e]+$/; // printable ASCII

/**
 * Validate and normalise an incoming X-Request-ID.
 * Returns the client value (truncated to 128) or a new UUID.
 */
export function resolveRequestId(clientValue: string | undefined): string {
  if (clientValue && clientValue.length > 0 && REQUEST_ID_RE.test(clientValue)) {
    return clientValue.length > MAX_REQUEST_ID_LEN
      ? clientValue.slice(0, MAX_REQUEST_ID_LEN)
      : clientValue;
  }
  return randomUUID();
}

/**
 * Create a child logger bound to a specific request context.
 */
export function createRequestLogger(
  requestId: string,
  extra?: Record<string, unknown>,
): pino.Logger {
  return logger.child({ request_id: requestId, ...extra });
}
