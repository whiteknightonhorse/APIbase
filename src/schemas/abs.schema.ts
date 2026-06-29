import { z } from 'zod';

export const absSchemas: Record<string, z.ZodTypeAny> = {
  'abs.gdp': z
    .object({
      measure: z
        .enum(['chain_volume', 'current_prices', 'chain_volume_change', 'index'])
        .optional()
        .describe(
          'GDP measure type. chain_volume = seasonally-adjusted volume (AUD millions), current_prices = nominal AUD millions, chain_volume_change = quarter-on-quarter % change, index = volume index. Omit to return both chain_volume and current_prices.',
        ),
      item: z
        .enum([
          'gdp',
          'gdp_per_capita',
          'gdp_per_hour_worked',
          'gva_per_hour_worked',
          'hours_worked',
        ])
        .optional()
        .describe(
          'Economic aggregate to retrieve. gdp = Gross Domestic Product (AUD millions), gdp_per_capita = GDP per person (AUD), gdp_per_hour_worked = GDP per hour worked (AUD), gva_per_hour_worked = Gross value added per hour (market sector), hours_worked = total hours worked (market sector, millions). Defaults to gdp.',
        ),
      adjustment: z
        .enum(['seasonally_adjusted', 'trend', 'original'])
        .optional()
        .describe(
          'Statistical adjustment type. seasonally_adjusted removes seasonal effects for trend analysis, trend is a smoothed version, original is the raw figure. Defaults to seasonally_adjusted.',
        ),
      last_n: z
        .number()
        .int()
        .min(1)
        .max(40)
        .optional()
        .describe(
          'Number of most-recent quarterly observations to return (1–40). Each observation is one quarter (Q1=Jan–Mar, Q2=Apr–Jun, Q3=Jul–Sep, Q4=Oct–Dec). Defaults to 8 (2 years).',
        ),
    })
    .strip(),

  'abs.cpi': z
    .object({
      measure: z
        .enum(['annual_change', 'index', 'period_change'])
        .optional()
        .describe(
          'CPI measure type. annual_change = percentage change from same period previous year (monthly data only, most commonly used), index = CPI index number (base 2011–12 = 100, monthly or quarterly), period_change = percentage change from previous period. Defaults to annual_change.',
        ),
      region: z
        .enum([
          'australia',
          'sydney',
          'melbourne',
          'brisbane',
          'adelaide',
          'perth',
          'hobart',
          'darwin',
          'canberra',
        ])
        .optional()
        .describe(
          'Geographic region. australia = weighted national average across all 8 capital cities, or specify an individual capital city. Defaults to australia.',
        ),
      frequency: z
        .enum(['monthly', 'quarterly'])
        .optional()
        .describe(
          'Data frequency. monthly = released monthly (note: annual_change measure is monthly only), quarterly = released quarterly. Ignored when measure is annual_change (always monthly). Defaults to monthly.',
        ),
      last_n: z
        .number()
        .int()
        .min(1)
        .max(60)
        .optional()
        .describe(
          'Number of most-recent observations to return (1–60). Monthly = up to 5 years; quarterly = up to 15 years. Defaults to 12 (1 year of monthly data).',
        ),
    })
    .strip(),

  'abs.labour_force': z
    .object({
      measure: z
        .enum([
          'unemployment_rate',
          'employed',
          'participation_rate',
          'labour_force',
          'civilian_population',
        ])
        .optional()
        .describe(
          'Labour market indicator. unemployment_rate = % of labour force unemployed, employed = number of employed persons (thousands), participation_rate = % of civilian population in labour force, labour_force = total labour force (thousands), civilian_population = total civilian population aged 15+ (thousands). Defaults to unemployment_rate, employed, and participation_rate combined.',
        ),
      sex: z
        .enum(['persons', 'males', 'females'])
        .optional()
        .describe(
          'Sex breakdown. persons = total (male + female), males or females for gender-disaggregated data. Defaults to persons.',
        ),
      region: z
        .enum(['australia', 'nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'nt', 'act'])
        .optional()
        .describe(
          'Geographic region. australia = national aggregate, or specify an Australian state/territory abbreviation: nsw (New South Wales), vic (Victoria), qld (Queensland), sa (South Australia), wa (Western Australia), tas (Tasmania), nt (Northern Territory), act (Australian Capital Territory). Defaults to australia.',
        ),
      adjustment: z
        .enum(['seasonally_adjusted', 'trend', 'original'])
        .optional()
        .describe(
          'Statistical adjustment. seasonally_adjusted is recommended for comparing months, trend is a smoothed version for long-term analysis, original is the raw survey estimate. Defaults to seasonally_adjusted.',
        ),
      last_n: z
        .number()
        .int()
        .min(1)
        .max(60)
        .optional()
        .describe(
          'Number of most-recent monthly observations to return (1–60, up to 5 years). Defaults to 12 (1 year).',
        ),
    })
    .strip(),

  'abs.population': z
    .object({
      measure: z
        .enum(['estimated_resident_population', 'annual_change', 'annual_pct_change'])
        .optional()
        .describe(
          'Population measure. estimated_resident_population = total ERP count (persons), annual_change = numeric change from same quarter previous year (persons), annual_pct_change = percentage change from same quarter previous year. Defaults to estimated_resident_population.',
        ),
      sex: z
        .enum(['persons', 'males', 'females'])
        .optional()
        .describe(
          'Sex breakdown. persons = total population (default), males or females for gender-disaggregated estimates.',
        ),
      region: z
        .enum(['australia', 'nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'nt', 'act'])
        .optional()
        .describe(
          'Geographic region. australia = national total, or specify a state/territory: nsw (New South Wales), vic (Victoria), qld (Queensland), sa (South Australia), wa (Western Australia), tas (Tasmania), nt (Northern Territory), act (Australian Capital Territory). Defaults to australia.',
        ),
      last_n: z
        .number()
        .int()
        .min(1)
        .max(40)
        .optional()
        .describe(
          'Number of most-recent quarterly observations to return (1–40). Defaults to 8 (2 years of quarterly data).',
        ),
    })
    .strip(),

  'abs.trade': z
    .object({
      items: z
        .array(
          z.enum([
            'current_account',
            'goods_services_credits',
            'goods_services_debits',
            'goods_credits',
            'goods_debits',
            'primary_income_credits',
          ]),
        )
        .optional()
        .describe(
          'Balance of payments items to retrieve. current_account = overall current account balance (AUD millions), goods_services_credits = total exports of goods and services, goods_services_debits = total imports of goods and services, goods_credits = goods exports only, goods_debits = goods imports only, primary_income_credits = income credits (investment income received). Defaults to current_account, goods_services_credits, and goods_services_debits.',
        ),
      measure: z
        .enum(['current_prices', 'chain_volume', 'implicit_price_index', 'terms_of_trade'])
        .optional()
        .describe(
          'Measurement basis. current_prices = nominal AUD millions (recommended), chain_volume = inflation-adjusted volume, implicit_price_index = price deflator index, terms_of_trade = ratio of export to import prices (available for selected items only). Defaults to current_prices.',
        ),
      adjustment: z
        .enum(['seasonally_adjusted', 'trend', 'original'])
        .optional()
        .describe(
          'Statistical adjustment. seasonally_adjusted removes predictable seasonal patterns, trend is a smoothed version, original is the raw quarterly estimate. Defaults to seasonally_adjusted.',
        ),
      last_n: z
        .number()
        .int()
        .min(1)
        .max(40)
        .optional()
        .describe(
          'Number of most-recent quarterly observations to return (1–40). Defaults to 8 (2 years).',
        ),
    })
    .strip(),
};
