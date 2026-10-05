import { createHash } from 'node:crypto';
import { hashApiKey, isValidApiKeyFormat } from '../services/api-key.service';
import type { Buyer } from './quote.service';

/**
 * Buyer identity (§8.4): the agent behind the API key, else a wallet hash, else the IP.
 * It keys the quote rate limit, the moderation-ban counter and X-Idempotency-Key.
 */
export async function resolveBuyer(p: {
  apiKey?: string;
  wallet?: string;
  ip?: string;
}): Promise<Buyer> {
  if (p.apiKey && isValidApiKeyFormat(p.apiKey)) {
    try {
      const { getPrisma } = await import('../services/prisma.service');
      const agent = await getPrisma().agent.findUnique({
        where: { api_key_hash: hashApiKey(p.apiKey) },
        select: { agent_id: true },
      });
      if (agent) return { identity: `agent:${agent.agent_id}` };
    } catch {
      /* fall through to the weaker identities */
    }
  }
  if (p.wallet) {
    return {
      identity: `wallet:${createHash('sha256').update(p.wallet.toLowerCase()).digest('hex')}`,
    };
  }
  return { identity: `ip:${p.ip ?? 'unknown'}` };
}
