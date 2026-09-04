#!/usr/bin/env python3
"""check-deploy-sync.py (T-02 gate, 2026-09-04).

Why this exists: /api/v1/incidents 404'd on production even though
scripts/check-mount-nginx-parity.py reported OK on every attempt of
T-816..T-820 (AP-7..AP-11) -- because that gate only checks internal
consistency of a WORKING TREE (routes vs nginx.conf, both read from the
same checkout). It has no opinion on whether that checkout is the one
actually running in production. The real defect: 14 commits (including
the incidents router itself, its nginx-adjacent comment, and the AP-10
dashboard UI) landed on `ci-staging` and were reviewed/accepted there,
but nobody ever ran the gated `/push` flow to land them on `main` --
so the GHCR image built and deployed by .github/workflows/deploy.yml's
`deploy` job (which only fires `if: github.ref == 'refs/heads/main'`)
never contained any of it. Every local check (tsc, jest, the mount-parity
gate, disposable-postgres selftests) was run against the ci-staging
working tree and correctly reported green -- there is nothing wrong
with any of them. "Committed and reviewed" was mistaken for "shipped".

This gate closes that blind spot: it diffs `origin/main` against a given
ref (default: HEAD) and fails if any commit reachable from the ref but
not from origin/main touches an externally-visible surface (a route
users/agents can hit, or the edge config that reaches it). A route, a
static page, or an nginx location that exists only on a branch is not
"wired" from a user's perspective no matter how green its own tests are.

Usage: python3 scripts/check-deploy-sync.py [--ref REF] [--base REF]
Exit 0 = every visible-surface commit on --ref is already reachable from
--base (default origin/main) -- nothing is stuck undeployed.
Exit 1 = gap found, printed (commit list + touched paths).
Exit 2 = git/setup error (e.g. --base ref doesn't exist locally -- run
`git fetch origin` first).
"""
import argparse
import subprocess
import sys

# Paths a user or agent can actually reach: HTTP routes, the MCP surface,
# the edge (nginx) config that has to forward to them, and the static
# pages nginx serves directly. Deliberately narrower than "everything
# under src/" -- src/services/, src/jobs/, scripts/ etc. change behavior
# behind an already-deployed route, not whether the route exists at all;
# scoping wide would make this gate fire on every routine change and
# train people to ignore it.
VISIBLE_SURFACE_PREFIXES = (
    'src/routes/',
    'src/api/',
    'src/mcp/',
    'nginx/',
    'static/',
)


def run(*args):
    return subprocess.run(
        ['git', *args], capture_output=True, text=True, check=True
    ).stdout


def touches_visible_surface(sha):
    files = run('show', '--name-only', '--format=', sha).splitlines()
    return [f for f in files if f.startswith(VISIBLE_SURFACE_PREFIXES)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ref', default='HEAD', help='branch/commit to check (default HEAD)')
    ap.add_argument('--base', default='origin/main', help='what "deployed" means (default origin/main)')
    args = ap.parse_args()

    try:
        run('rev-parse', '--verify', args.base)
        run('rev-parse', '--verify', args.ref)
    except subprocess.CalledProcessError as e:
        print(f'ERROR: {e.stderr.strip()} -- run `git fetch origin` first?', file=sys.stderr)
        sys.exit(2)

    shas = run('log', '--format=%H', f'{args.base}..{args.ref}').splitlines()

    gaps = []
    for sha in shas:
        touched = touches_visible_surface(sha)
        if touched:
            subject = run('log', '-1', '--format=%s', sha).strip()
            gaps.append((sha[:9], subject, touched))

    if gaps:
        print(
            f'DEPLOY-SYNC FAILED -- {len(gaps)} commit(s) on {args.ref} touch a '
            f'user/agent-visible surface (route, nginx, or static page) but are '
            f'NOT reachable from {args.base}. Anything they add or change 404s '
            f'or serves stale content in production no matter how green their '
            f'own tests are -- land them on {args.base} via the gated `/push` '
            f'flow before calling a task that touches these paths done:'
        )
        for short_sha, subject, touched in gaps:
            print(f'  {short_sha}  {subject}')
            for f in touched:
                print(f'      {f}')
        sys.exit(1)

    print(f'OK -- no undeployed visible-surface commits between {args.base} and {args.ref}.')


if __name__ == '__main__':
    main()
