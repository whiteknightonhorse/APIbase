import { z, type ZodSchema } from 'zod';

const networkEnum = z.enum([
  'ethereum',
  'bsc',
  'polygon',
  'arbitrum',
  'solana',
  'base',
  'avalanche',
  'optimism',
]).describe('Blockchain network');

const cryptoGetPrice = z
  .object({
    coins: z.array(z.string().describe('CoinGecko coin ID (e.g. bitcoin, ethereum)')).max(50).describe('List of coin IDs to get prices for'),
    vs_currencies: z.array(z.string().describe('Currency code (e.g. usd, eur, btc)')).optional().describe('Target currencies for price conversion'),
    include_24h_change: z.boolean().optional().describe('Include 24-hour price change percentage'),
    include_market_cap: z.boolean().optional().describe('Include market capitalization'),
    include_volume: z.boolean().optional().describe('Include 24-hour trading volume'),
  })
  .strip();

const coingeckoGetMarket = z
  .object({
    category: z
      .enum([
        'defi',
        'layer-1',
        'layer-2',
        'gaming',
        'ai-big-data',
        'meme-token',
        'stablecoins',
        'nft',
        'exchange-based-tokens',
        'real-world-assets',
      ])
      .optional()
      .describe('Filter by market category'),
    sort_by: z
      .enum([
        'market_cap_desc',
        'market_cap_asc',
        'volume_desc',
        'price_desc',
        'price_change_24h_desc',
      ])
      .optional()
      .describe('Sort order for results'),
    limit: z.number().int().max(250).optional().describe('Max number of results (1-250)'),
    include_sparkline: z.boolean().optional().describe('Include 7-day sparkline price data'),
  })
  .strip();

const cryptoCoinDetail = z
  .object({
    coin_id: z.string().describe('CoinGecko coin ID (e.g. bitcoin, ethereum)'),
    include_description: z.boolean().optional().describe('Include coin description text'),
    include_developer: z.boolean().optional().describe('Include developer/GitHub stats'),
    include_community: z.boolean().optional().describe('Include community/social stats'),
  })
  .strip();

const cryptoPriceHistory = z
  .object({
    coin_id: z.string().describe('CoinGecko coin ID (e.g. bitcoin, ethereum)'),
    days: z.number().int().max(365).optional().describe('Number of days of history (1-365)'),
    interval: z.enum(['5m', 'hourly', 'daily']).optional().describe('Data point interval'),
    format: z.enum(['timeseries', 'ohlcv']).optional().describe('Response format'),
  })
  .strip();

const cryptoTrending = z
  .object({
    include_nfts: z.boolean().optional().describe('Include trending NFT collections'),
    include_categories: z.boolean().optional().describe('Include trending categories'),
  })
  .strip();

const cryptoGlobal = z
  .object({
    include_defi: z.boolean().optional().describe('Include DeFi-specific global stats'),
  })
  .strip();

const cryptoDexPools = z
  .object({
    query: z.string().optional().describe('Search query for pool name or token'),
    network: networkEnum.optional(),
    sort_by: z.enum(['volume_24h', 'liquidity', 'price_change_24h', 'transactions_24h']).optional().describe('Sort order for pool results'),
    limit: z.number().int().max(50).optional().describe('Max number of results (1-50)'),
  })
  .strip();

const cryptoTokenByAddress = z
  .object({
    contract_address: z.string().describe('Token contract address (e.g. 0x...)'),
    network: networkEnum.optional(),
  })
  .strip();

const cryptoSearch = z
  .object({
    query: z.string().describe('Search query for coin name, symbol, or ID'),
  })
  .strip();

export const cryptoSchemas: Record<string, ZodSchema> = {
  'crypto.get_price': cryptoGetPrice,
  'coingecko.get_market': coingeckoGetMarket,
  'crypto.coin_detail': cryptoCoinDetail,
  'crypto.price_history': cryptoPriceHistory,
  'crypto.trending': cryptoTrending,
  'crypto.global': cryptoGlobal,
  'crypto.dex_pools': cryptoDexPools,
  'crypto.token_by_address': cryptoTokenByAddress,
  'crypto.search': cryptoSearch,
};
