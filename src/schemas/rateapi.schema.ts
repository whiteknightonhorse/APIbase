import { z } from 'zod';

const mortgageSchema = z.object({
  state: z.string().length(2).optional().describe('Two-letter US state code (e.g. "CA", "NY", "TX")'),
  amount: z.number().min(10000).optional().describe('Loan amount in USD (e.g. 400000 for a $400K mortgage)'),
  term_months: z.number().int().optional().describe('Loan term in months: 180 (15yr), 360 (30yr), or custom'),
  rate_type: z.enum(['fixed', 'adjustable']).optional().describe('Rate type: "fixed" or "adjustable" (ARM)'),
  intent: z.enum(['purchase', 'refinance']).optional().describe('Loan intent: "purchase" for buying or "refinance"'),
  credit_score: z.enum(['excellent', 'good', 'fair', 'poor']).optional().describe('Credit score tier for rate filtering'),
}).strip();

const autoLoanSchema = z.object({
  state: z.string().length(2).optional().describe('Two-letter US state code'),
  amount: z.number().min(1000).optional().describe('Loan amount in USD (e.g. 35000)'),
  term_months: z.enum(['24', '36', '48', '60', '72']).optional().describe('Loan term: 24, 36, 48, 60, or 72 months'),
  vehicle_type: z.enum(['new', 'used']).optional().describe('Vehicle type: "new" or "used"'),
  credit_score: z.enum(['excellent', 'good', 'fair', 'poor']).optional().describe('Credit score tier'),
}).strip();

const helocSchema = z.object({
  state: z.string().length(2).optional().describe('Two-letter US state code'),
  cltv: z.number().min(0).max(95).optional().describe('Combined loan-to-value ratio (0-95)'),
  credit_score: z.enum(['excellent', 'good', 'fair', 'poor']).optional().describe('Credit score tier'),
}).strip();

const personalLoanSchema = z.object({
  amount: z.number().min(1000).optional().describe('Loan amount in USD (e.g. 10000)'),
  term_months: z.enum(['12', '24', '36', '48', '60']).optional().describe('Loan term: 12, 24, 36, 48, or 60 months'),
  credit_score: z.enum(['excellent', 'good', 'fair', 'poor']).optional().describe('Credit score tier'),
}).strip();

export const rateapiSchemas: Record<string, z.ZodSchema> = {
  'rateapi.mortgage': mortgageSchema,
  'rateapi.auto_loan': autoLoanSchema,
  'rateapi.heloc': helocSchema,
  'rateapi.personal_loan': personalLoanSchema,
};
