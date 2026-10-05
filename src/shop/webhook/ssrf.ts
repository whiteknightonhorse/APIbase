import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/** §8.5: a merchant webhook URL is https, public addresses only, resolved once and pinned. */
export type HostResolver = (host: string) => Promise<string[]>;

export const defaultResolver: HostResolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

export function isPublicIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 0) return false;
  return !blocked.check(ip, v === 4 ? 'ipv4' : 'ipv6');
}

export class WebhookUrlError extends Error {}

export interface PinnedTarget {
  url: URL;
  hostname: string;
  /** The resolved, public address the connection must use (DNS pinning). */
  ip: string;
}

/** Throws WebhookUrlError unless `raw` is an https URL whose every address is public. */
export async function resolvePublicTarget(
  raw: unknown,
  resolve: HostResolver = defaultResolver,
): Promise<PinnedTarget> {
  let url: URL;
  try {
    url = new URL(typeof raw === 'string' ? raw : '');
  } catch {
    throw new WebhookUrlError('url must be an absolute https:// URL');
  }
  if (url.protocol !== 'https:') throw new WebhookUrlError('url must use https://');
  if (url.username || url.password) throw new WebhookUrlError('url must not carry credentials');
  if ((raw as string).length > 2000)
    throw new WebhookUrlError('url is longer than 2000 characters');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addrs: string[];
  if (isIP(hostname)) {
    addrs = [hostname];
  } else {
    try {
      addrs = await resolve(hostname);
    } catch {
      throw new WebhookUrlError(`host ${hostname} does not resolve`);
    }
  }
  if (addrs.length === 0) throw new WebhookUrlError(`host ${hostname} does not resolve`);
  if (!addrs.every(isPublicIp)) {
    throw new WebhookUrlError(
      'url resolves to a non-public address (private, loopback, link-local)',
    );
  }
  return { url, hostname, ip: addrs[0] };
}
