/** T-0503: /video/ is the narrated Integrator demo (one <video> with captions) and the MP4 is 75-90 s with one video and one audio stream. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';

const STATIC = join(resolve(__dirname, '../..'), 'static');
const MP4 = join(STATIC, 'video/apibase-integrator-demo.mp4');

function serve(): Promise<Server> {
  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    const rel = url.endsWith('/') ? `${url}index.html` : url;
    const file = join(STATIC, rel);
    if (!file.startsWith(STATIC) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

function status(port: number, path: string): Promise<number> {
  return new Promise((ok, fail) => {
    const r = request({ host: '127.0.0.1', port, path, method: 'HEAD' }, (res) => {
      res.resume();
      ok(res.statusCode ?? 0);
    });
    r.on('error', fail);
    r.end();
  });
}

describe('/video/ page (T-0503)', () => {
  const html = readFileSync(join(STATIC, 'video/index.html'), 'utf-8');
  let server: Server;
  let port: number;
  beforeAll(async () => {
    server = await serve();
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise((ok) => server.close(ok)));

  it('returns 200 and has exactly one <video>', async () => {
    expect(await status(port, '/video/')).toBe(200);
    expect(html.match(/<video\b/g)).toHaveLength(1);
  });

  it('video src and poster resolve 200', async () => {
    const tag = /<video\b[^>]*>/.exec(html)?.[0] ?? '';
    const src = /\ssrc="([^"]+)"/.exec(tag)?.[1] ?? '';
    const poster = /\sposter="([^"]+)"/.exec(tag)?.[1] ?? '';
    expect(src).toMatch(/^\/video\/.+\.mp4$/);
    expect(poster).toMatch(/^\/video\/.+\.jpg$/);
    expect(await status(port, src)).toBe(200);
    expect(await status(port, poster)).toBe(200);
  });

  it('has an English captions track that resolves, no autoplay, and links /integrator/connect', async () => {
    const track = /<track\b[^>]*>/.exec(html)?.[0] ?? '';
    expect(track).toMatch(/kind="captions"/);
    expect(track).toMatch(/srclang="en"/);
    const src = /\ssrc="([^"]+)"/.exec(track)?.[1] ?? '';
    expect(await status(port, src)).toBe(200);
    expect(readFileSync(join(STATIC, src.slice(1)), 'utf-8').startsWith('WEBVTT')).toBe(true);
    expect(html).not.toMatch(/\sautoplay\b/);
    expect(html).toContain('href="/integrator/connect"');
    expect(html).toContain('href="/video/LICENSES.txt"');
    expect(await status(port, '/video/LICENSES.txt')).toBe(200);
  });
});

// ffprobe is absent on the GitHub CI runner; a thrown spawn Error would crash the jest worker, so skip with a reason.
function hasFfprobe(): boolean {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
const FFPROBE = hasFfprobe();
if (!FFPROBE) {
  console.warn('demo MP4 assertions skipped: ffprobe is not on PATH');
}

(FFPROBE ? describe : describe.skip)('demo MP4 (T-0503)', () => {
  it('is 75-90 s with one video and one audio stream, <= 40 MB', () => {
    const out = JSON.parse(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration,size:stream=codec_type',
        '-of',
        'json',
        MP4,
      ]).toString(),
    ) as { format: { duration: string; size: string }; streams: { codec_type: string }[] };
    const d = Number(out.format.duration);
    expect(d).toBeGreaterThanOrEqual(75);
    expect(d).toBeLessThanOrEqual(90);
    expect(out.streams.filter((s) => s.codec_type === 'video')).toHaveLength(1);
    expect(out.streams.filter((s) => s.codec_type === 'audio')).toHaveLength(1);
    expect(Number(out.format.size)).toBeLessThanOrEqual(40 * 1024 * 1024);
  });
});
