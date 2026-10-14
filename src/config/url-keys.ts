/**
 * T-0400c: keep provider credentials out of tracked URLs.
 *
 * Config URLs (health probes etc.) carry `${ENV_VAR}` placeholders in
 * credential query parameters; the real value is substituted from the
 * environment at request time and the substituted URL is never logged.
 */

/** Query parameters that carry credentials. */
export const CREDENTIAL_QUERY_PARAMS = [
  'key',
  'api_key',
  'apikey',
  'wskey',
  'token',
  'access_token',
];

const CREDENTIAL_PARAM_RE = new RegExp(
  `([?&](?:${CREDENTIAL_QUERY_PARAMS.join('|')})=)([^&"'\\s]*)`,
  'gi',
);
const PLACEHOLDER_RE = /^\$\{[A-Z][A-Z0-9_]*\}$/;
const SUBST_RE = /\$\{([A-Z][A-Z0-9_]*)\}/g;

/** Replace `${VAR}` with env[VAR] (empty string when unset). */
export function substituteEnvPlaceholders(
  url: string,
  env: Record<string, string | undefined>,
): string {
  return url.replace(SUBST_RE, (_m, name: string) => env[name] ?? '');
}

/** Mask the value of every credential query parameter (for log lines). */
export function maskUrlCredentials(url: string): string {
  return url.replace(CREDENTIAL_PARAM_RE, '$1***');
}

/**
 * Names of credential query parameters in `text` whose value is not a
 * `${VAR}` placeholder. Returns parameter names only, never values.
 */
export function findLiteralUrlCredentials(text: string): string[] {
  const hits: string[] = [];
  for (const m of text.matchAll(CREDENTIAL_PARAM_RE)) {
    if (!PLACEHOLDER_RE.test(m[2])) hits.push(m[1].slice(1, -1));
  }
  return hits;
}
