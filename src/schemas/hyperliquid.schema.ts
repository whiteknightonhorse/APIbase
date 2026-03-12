import { z } from 'zod';

export const hyperliquidSchemas: Record<string, z.ZodSchema> = {
  'hyperliquid.market_data': z.object({
    coin: z.string().optional().describe('Specific coin symbol (e.g. BTC, ETH). Omit for all markets.'),
  }).strip(),

  'hyperliquid.order_book': z.object({
    coin: z.string().describe('Coin symbol (e.g. BTC, ETH)'),
    n_sig_figs: z.number().int().min(1).max(10).optional().describe('Number of significant figures for price levels'),
    mantissa: z.number().int().optional().describe('Mantissa for price rounding'),
  }).strip(),

  'hyperliquid.klines': z.object({
    coin: z.string().describe('Coin symbol (e.g. BTC, ETH)'),
    interval: z.enum(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']).optional().describe('Candlestick interval'),
    start_time: z.number().int().optional().describe('Start time in milliseconds since epoch'),
    end_time: z.number().int().optional().describe('End time in milliseconds since epoch'),
  }).strip(),

  'hyperliquid.positions': z.object({
    user: z.string().describe('User wallet address (0x...)'),
  }).strip(),

  'hyperliquid.account': z.object({
    user: z.string().describe('User wallet address (0x...)'),
  }).strip(),

  'hyperliquid.vault': z.object({
    vault_address: z.string().describe('Vault contract address (0x...)'),
  }).strip(),
};
