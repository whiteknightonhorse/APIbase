#!/usr/bin/env python3
"""check-mount-nginx-parity.py (ШАГ 6 gate, Fable's 4-finding consolidated
verdict, 2026-09-02).

Every Express route this server DECLARES (every literal path a *.router.ts
or the MCP server registers via .get/.post/.put/.patch/.delete) must be
reachable through some nginx `location` block that actually proxies to the
backend -- not just imported and mounted in src/api/app.ts, which is not
the same as being wired through nginx.

This is a machine check specifically because a hand-maintained list goes
stale silently: "declared but not wired" has shipped live THREE times now
(/appeals, the /pricing static-page dead link, and /x402/retrieve/:id --
the last one found only by building this exact gate, before it had ever
been run once). Route paths are extracted from the router source files
themselves every run, never hand-copied.

Usage: python3 scripts/check-mount-nginx-parity.py
Exit 0 = every declared route is covered. Exit 1 = gap found, printed.
"""
import glob
import re
import sys

ROUTER_GLOB = 'src/routes/*.router.ts'
MCP_SERVER_FILE = 'src/mcp/server.ts'
NGINX_CONF = 'nginx/nginx.conf'

# Deliberately excluded: not meant to be reachable through the public
# nginx at all (scraped over the internal docker network for Prometheus).
INTERNAL_ONLY_PREFIXES = ('/metrics',)

ROUTE_CALL_RE = re.compile(
    r"\.(?:get|post|put|patch|delete)\(\s*['\"](/[^'\"]*)['\"]"
)
LOCATION_RE = re.compile(r'location\s+(=\s*)?(\S+)\s*\{([^{}]*)\}', re.S)


def extract_router_paths(path):
    text = open(path, encoding='utf-8').read()
    return sorted(set(ROUTE_CALL_RE.findall(text)))


def extract_nginx_backend_locations(path):
    text = open(path, encoding='utf-8').read()
    locations = []
    for exact_marker, loc_path, body in LOCATION_RE.findall(text):
        if 'proxy_pass' not in body:
            continue  # static-file / return-only blocks don't reach the app
        locations.append((loc_path, bool(exact_marker.strip())))
    return locations


def is_covered(route_path, nginx_locations):
    for loc_path, is_exact in nginx_locations:
        if is_exact:
            if route_path == loc_path:
                return True
        else:
            prefix = loc_path if loc_path.endswith('/') else loc_path + '/'
            if route_path == loc_path or route_path.startswith(prefix):
                return True
    return False


def main():
    nginx_locations = extract_nginx_backend_locations(NGINX_CONF)

    declared = []
    for router_file in sorted(glob.glob(ROUTER_GLOB)) + [MCP_SERVER_FILE]:
        for route_path in extract_router_paths(router_file):
            declared.append((router_file, route_path))

    missing = []
    for router_file, route_path in declared:
        if any(
            route_path == p or route_path.startswith(p + '/')
            for p in INTERNAL_ONLY_PREFIXES
        ):
            continue
        if not is_covered(route_path, nginx_locations):
            missing.append((router_file, route_path))

    if missing:
        print(
            'MOUNT-NGINX PARITY FAILED -- these routes are declared and '
            'mounted in the app but have no nginx location proxying to the '
            'backend (they would 404 straight from nginx, never reaching '
            'the app):'
        )
        for router_file, route_path in missing:
            print(f'  {route_path}   (declared in {router_file})')
        sys.exit(1)

    print(
        f'OK -- {len(declared)} declared routes across '
        f'{len(sorted(glob.glob(ROUTER_GLOB))) + 1} router files, all '
        f'covered by an nginx backend location.'
    )


if __name__ == '__main__':
    main()
