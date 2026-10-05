import type Redis from 'ioredis';

/**
 * T-0268: mppx >=0.5.8 replay protection (Charge markHashUsed/markProofUsed)
 * calls store.update(); Store.redis(client) only exposes update when the client
 * itself has one, which ioredis does not. This adapter supplies a CAS update.
 *
 * Values are raw strings (mppx wraps JSON around them). The client is the
 * shared multiplexed one, so no WATCH/MULTI: the write is a single Lua script
 * that applies only if the key still matches what the callback observed.
 */
const MAX_ATTEMPTS = 8;

const CAS_SCRIPT = `
local cur = redis.call('GET', KEYS[1])
if ARGV[1] == '1' then
  if cur then return 0 end
else
  if cur ~= ARGV[2] then return 0 end
end
if ARGV[3] == 'set' then
  redis.call('SET', KEYS[1], ARGV[4])
else
  redis.call('DEL', KEYS[1])
end
return 1
`;

type Change<T> =
  | { op: 'set'; value: string; result: T }
  | { op: 'delete'; result: T }
  | { op: 'noop'; result: T };

export function atomicRedisAdapter(client: Redis) {
  return {
    get: (key: string) => client.get(key),
    set: (key: string, value: string) => client.set(key, value),
    del: (key: string) => client.del(key),
    async update<T>(key: string, fn: (current: string | null) => Change<T>): Promise<T> {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const raw = await client.get(key);
        const change = fn(raw ?? null);
        if (change.op === 'noop') return change.result;
        const applied = await client.eval(
          CAS_SCRIPT,
          1,
          key,
          raw === null ? '1' : '0',
          raw ?? '',
          change.op,
          change.op === 'set' ? change.value : '',
        );
        if (applied === 1) return change.result;
      }
      throw new Error('mppx store update: CAS retries exhausted');
    },
  };
}
