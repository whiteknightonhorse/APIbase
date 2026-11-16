/**
 * T-ZZ-03-04: `SERVER_INFO` (src/mcp/server.ts) is echoed verbatim into every MCP
 * client's `initialize` response, including registry crawlers (Glama had been showing
 * a frozen "618/191" widget long after the live catalog moved on). Two invariants:
 *   1. `version` is read from package.json at runtime, not a hardcoded literal that
 *      drifts from the shipped build.
 *   2. `description` carries no tool/provider counts — no digit run >= 2 chars.
 *
 * This is a STATIC source-text check, not a runtime import of src/mcp/server.ts:
 * that file pulls in tool-adapter.ts -> the full pipeline import graph (escrow.stage ->
 * x402-server.service -> cdp-jwt.service -> 'jose'), which
 * tests/unit/moderation-stage-corpus.test.ts documents as a reproducible jest hang.
 * Reading the source as text and resolving the exact relative path it declares gets
 * equivalent coverage of the runtime behavior without paying that cost.
 *
 * Following the D-2 lesson (margin-multiplier-single-source.test.ts): a bare substring
 * check like `serverTs.includes('PACKAGE_VERSION')` would pass even if the read path
 * were wrong, so the version test below extracts the literal relative path the code
 * passes to readFileSync(), resolves it exactly the way `join(__dirname, ...)` would
 * from src/mcp/, and asserts the file at that resolved path really has the version
 * we expect -- not just that the right-looking tokens appear somewhere in the file.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const repoRoot = join(__dirname, '../..');
const serverTs = readFileSync(join(repoRoot, 'src/mcp/server.ts'), 'utf8');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
  version: string;
};

describe('SERVER_INFO version + description (T-ZZ-03-04)', () => {
  it('version is assigned from a runtime-read PACKAGE_VERSION, not a hardcoded literal', () => {
    expect(serverTs).toMatch(/version:\s*PACKAGE_VERSION,/);
    // The regression this guards: SERVER_INFO used to hardcode version: '1.0.0'.
    expect(serverTs).not.toMatch(/version:\s*['"]1\.0\.0['"]/);

    const pathMatch = serverTs.match(/readFileSync\(join\(__dirname, '([^']+)'\)/);
    expect(pathMatch).not.toBeNull();
    const declaredRelPath = pathMatch![1];

    // Resolve exactly as `join(__dirname, declaredRelPath)` would from src/mcp/server.ts.
    const resolvedPath = join(repoRoot, 'src/mcp', declaredRelPath);
    expect(existsSync(resolvedPath)).toBe(true);
    expect(resolvedPath).toBe(join(repoRoot, 'package.json'));

    const versionAtResolvedPath = (
      JSON.parse(readFileSync(resolvedPath, 'utf8')) as { version: string }
    ).version;
    expect(versionAtResolvedPath).toBe(pkg.version);
  });

  it('description has no hardcoded tool/provider counts (no digit run >= 2 chars)', () => {
    const match = serverTs.match(/description:\s*'([^']+)'/);
    expect(match).not.toBeNull();
    const description = match![1];

    // The regression this guards: description used to read
    // "Unified MCP gateway to 618 tools across 191 providers."
    expect(description).not.toMatch(/[0-9]{2,}/);
    expect(description.toLowerCase()).not.toContain('618');
    expect(description.toLowerCase()).not.toContain('191');
  });

  it('package.json version was bumped off the stale 1.0.0 baseline (not to be reverted)', () => {
    expect(pkg.version).toBe('2.2.0');
  });
});

/**
 * T-0864: server.json is the record the MCP registry stores. It has no version of its own: the top-level
 * version is package.json's, packages[0].version is the npm client's. A drift is also a red
 * `scripts/sync-counts.sh --check` (STALE_SERVER_JSON_VERSION / STALE_SERVER_JSON_CLIENT_VERSION).
 */
describe('server.json version source and registry URLs (T-0864)', () => {
  const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8');
  const serverJson = JSON.parse(read('server.json')) as {
    version: string;
    packages: Array<{ version: string }>;
    remotes: Array<{ url: string }>;
  };
  const clientPkg = JSON.parse(read('packages/mcp-client/package.json')) as { version: string };
  const mcpJson = JSON.parse(read('static/.well-known/mcp.json')) as { url: string };

  it('server.json version equals package.json version', () => {
    expect(serverJson.version).toBe(pkg.version);
  });

  it('server.json packages[0].version equals the mcp-client package version', () => {
    expect(serverJson.packages[0].version).toBe(clientPkg.version);
  });

  it('the registry-facing URLs end with /mcp?tools=all', () => {
    expect(serverJson.remotes[0].url).toBe('https://apibase.pro/mcp?tools=all');
    expect(mcpJson.url).toBe('https://apibase.pro/mcp?tools=all');
    expect(read('smithery.yaml')).toMatch(
      /^\s*deploymentUrl: https:\/\/apibase\.pro\/mcp\?tools=all\s*$/m,
    );
    expect(read('scripts/gen-discovery.ts')).toContain("url: 'https://apibase.pro/mcp?tools=all',");
  });

  it('registry-version-check.sh selftest passes (mismatch fails with its message, equal passes)', () => {
    const r = spawnSync('bash', ['scripts/registry-version-check.sh', '--selftest'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(r.stdout.trim()).toBe('OK');
    expect(r.status).toBe(0);
  });

  it('registry-version-check.sh reports the tree as consistent', () => {
    const r = spawnSync('bash', ['scripts/registry-version-check.sh', '.'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });
});
