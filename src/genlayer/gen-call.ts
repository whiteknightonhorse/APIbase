/**
 * A-GD-01: the one GenLayer read transport (`gen_call` over the Bradbury RPC), shared by the
 * /attest/ page (scripts/attest/chain.ts) and the dispute verdict worker. It depends on no injected
 * wallet and no browser: the caller hands in a client with `readContract`, so unit tests need no
 * network and no genlayer-js.
 */

export interface GenReadClient {
  readContract(a: {
    address: `0x${string}`;
    functionName: string;
    args: unknown[];
  }): Promise<unknown>;
}

/** Reject after `ms` so a silent network is a failure, not a hang. */
export function withTimeout<T>(call: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`The network did not answer within ${ms / 1000} s.`)),
      ms,
    );
    call.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** One read-only contract call (`gen_call`). */
export function genCall(
  client: GenReadClient,
  address: string,
  functionName: string,
  args: unknown[] = [],
  timeoutMs = 10_000,
): Promise<unknown> {
  return withTimeout(
    client.readContract({ address: address as `0x${string}`, functionName, args }),
    timeoutMs,
  );
}

/**
 * Contract views return JSON text; genlayer-js may hand it back as a string or already decoded.
 * Returns the parsed value, or `undefined` when the text is not JSON.
 */
export function parseViewJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
