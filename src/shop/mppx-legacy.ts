/**
 * T-0393: mppx >= 0.7 made `tempo.session` the TIP-1034 precompile session and moved the
 * contract-backed session we run to `tempo.sessionLegacy` / `SessionLegacy`. The channel-store
 * factory of that legacy session is not in the package `exports` map any more, so it is loaded by
 * file path. `fromStore` caches per store object, so the store this returns is the very one the
 * `tempo.sessionLegacy({ store })` method uses internally.
 */
import path from 'path';

export interface LegacyChannelStore {
  getChannel(channelId: `0x${string}`): Promise<unknown>;
  updateChannel(channelId: `0x${string}`, fn: (current: unknown) => unknown): Promise<unknown>;
}

export async function legacyChannelStore(store: unknown): Promise<LegacyChannelStore> {
  // `mppx/server` resolves to <pkg>/dist/server/index.js
  const dist = path.dirname(path.dirname(require.resolve('mppx/server')));
  const mod = await import(path.join(dist, 'tempo/session/server/ChannelStore.js'));
  return mod.fromStore(store) as LegacyChannelStore;
}
