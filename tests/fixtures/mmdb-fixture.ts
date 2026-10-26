/**
 * Minimal MMDB writer for tests: IPv4 search tree, 24-bit records, one {country:{iso_code}} record
 * per prefix. Enough for mmdb-lib's Reader; not a general-purpose writer.
 */
const str = (s: string): number[] => [(2 << 5) | s.length, ...Buffer.from(s, 'utf8')];
const uint = (type: number, v: number): number[] => {
  if (v === 0) return [type << 5];
  const bytes: number[] = [];
  for (let x = v; x > 0; x = Math.floor(x / 256)) bytes.unshift(x % 256);
  return [(type << 5) | bytes.length, ...bytes];
};
const map = (n: number): number[] => [(7 << 5) | n];

export function buildCountryMmdb(prefixes: Array<{ cidr: string; country: string }>): Buffer {
  type Slot = { node: number } | { data: number } | null;
  const nodes: Array<[Slot, Slot]> = [[null, null]];
  const data: number[] = [];
  const offsets = new Map<string, number>();
  const record = (cc: string): number => {
    if (!offsets.has(cc)) {
      offsets.set(cc, data.length);
      data.push(...map(1), ...str('country'), ...map(1), ...str('iso_code'), ...str(cc));
    }
    return offsets.get(cc)!;
  };
  for (const { cidr, country } of prefixes) {
    const [addr, bitsStr] = cidr.split('/');
    const bits = Number(bitsStr);
    const ip = addr.split('.').map(Number);
    const bit = (i: number) => (ip[i >> 3] >> (7 - (i & 7))) & 1;
    let cur = 0;
    for (let i = 0; i < bits; i++) {
      const last = i === bits - 1;
      if (last) {
        nodes[cur][bit(i)] = { data: record(country) };
      } else {
        const slot = nodes[cur][bit(i)];
        if (slot && 'node' in slot) {
          cur = slot.node;
        } else {
          nodes.push([null, null]);
          nodes[cur][bit(i)] = { node: nodes.length - 1 };
          cur = nodes.length - 1;
        }
      }
    }
  }
  const count = nodes.length;
  const rec = (s: Slot): number[] => {
    const v = s === null ? count : 'node' in s ? s.node : count + 16 + s.data;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const tree = nodes.flatMap(([l, r]) => [...rec(l), ...rec(r)]);
  const meta = [
    ...map(9),
    ...str('node_count'),
    ...uint(6, count),
    ...str('record_size'),
    ...uint(5, 24),
    ...str('ip_version'),
    ...uint(5, 4),
    ...str('binary_format_major_version'),
    ...uint(5, 2),
    ...str('binary_format_minor_version'),
    ...uint(5, 0),
    ...str('build_epoch'),
    0x01,
    0x02,
    1,
    ...str('database_type'),
    ...str('Test-Country'),
    ...str('languages'),
    0x01,
    0x04,
    ...str('en'),
    ...str('description'),
    ...map(1),
    ...str('en'),
    ...str('fixture'),
  ];
  return Buffer.concat([
    Buffer.from(tree),
    Buffer.alloc(16),
    Buffer.from(data),
    Buffer.from([0xab, 0xcd, 0xef]),
    Buffer.from('MaxMind.com'),
    Buffer.from(meta),
  ]);
}
