import pino from 'pino';
import { randomUUID } from 'node:crypto';
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

/** Redact known sensitive patterns in an arbitrary string value. */
function redactString(key: string, value: string): string {
  const lk = key.toLowerCase();
  if (lk.includes('api_key') || lk.includes('apikey') || lk === 'authorization') {
    return maskApiKey(value);
  }
  if (lk === 'email') {
    return maskEmail(value);
  }
  // Provider keys must never appear at all (§12.246)
  if (lk.startsWith('provider_key')) {
    return '[REDACTED]';
  }
  return value;
}

/** Deep-walk an object and redact sensitive fields. */
function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      out[k] = redactString(k, v);
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
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
