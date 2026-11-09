/**
 * T-0739: issue a partner key. Prints a `pk_live_` + 32 hex key ONCE and its sha256.
 * The sha256 goes into config/integrator/partners.json (`key_sha256`); the key goes into the
 * partner's own secret store, never into git, a card or a log.
 *
 *   npx tsx scripts/shop/gen-partner-key.ts <partner-id>
 */
import { generateApiKey, hashApiKey } from '../../src/services/api-key.service';

const id = process.argv[2];
if (!id || !/^[a-z0-9-]{2,40}$/.test(id)) {
  process.stderr.write('usage: gen-partner-key.ts <partner-id>\n');
  process.exit(2);
}
const key = generateApiKey('pk_live_');
process.stdout.write(
  `partner: ${id}\nkey (hand to the partner out of band, shown once): ${key}\nkey_sha256 (partners.json): ${hashApiKey(key)}\n`,
);
