import { z } from 'zod';

export const cernopendataSchemas: Record<string, z.ZodTypeAny> = {
  'cernopendata.search': z
    .object({
      q: z
        .string()
        .optional()
        .describe('Full-text search query (e.g. "higgs boson", "dark matter", "Z boson decay")'),
      type: z
        .enum([
          'Dataset',
          'Documentation',
          'Software',
          'Supplementaries',
          'Environment',
          'Glossary',
          'News',
        ])
        .optional()
        .describe(
          'Filter by record type: Dataset (collision/simulated data), Documentation, Software, Supplementaries, Environment, Glossary, News',
        ),
      experiment: z
        .enum(['CMS', 'ATLAS', 'ALICE', 'LHCb', 'DELPHI', 'JADE', 'OPERA', 'TOTEM', 'PHENIX'])
        .optional()
        .describe(
          'Filter by CERN experiment (e.g. CMS, ATLAS, ALICE, LHCb). CMS has the most open data.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe('Number of results to return (1–25, default 10)'),
      page: z.number().int().min(1).optional().describe('Page number for pagination (default 1)'),
    })
    .strip(),

  'cernopendata.detail': z
    .object({
      id: z
        .string()
        .describe(
          'Record ID from CERN Open Data portal (e.g. "5209", "50", "AOD"). Numeric for datasets/docs, string anchors for glossary terms.',
        ),
    })
    .strip(),

  'cernopendata.datasets': z
    .object({
      experiment: z
        .enum(['CMS', 'ATLAS', 'ALICE', 'LHCb', 'DELPHI', 'JADE', 'OPERA', 'TOTEM', 'PHENIX'])
        .optional()
        .describe(
          'Filter by CERN experiment. CMS has 57K+ datasets, LHCb has 7K+, DELPHI has 12K+.',
        ),
      year: z
        .string()
        .optional()
        .describe(
          'Filter by publication year (e.g. "2015", "2016", "2012"). LHC Run 1: 2010–2013, Run 2: 2015–2016.',
        ),
      collision_energy: z
        .string()
        .optional()
        .describe(
          'Filter by collision energy (e.g. "13TeV", "8TeV", "7TeV"). Run 2 used 13 TeV, Run 1 used 7–8 TeV.',
        ),
      q: z
        .string()
        .optional()
        .describe('Keyword filter within datasets (e.g. "NanoAOD", "MiniAOD", "Higgs")'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe('Number of datasets to return (1–25, default 10)'),
      page: z.number().int().min(1).optional().describe('Page number for pagination (default 1)'),
    })
    .strip(),

  'cernopendata.glossary': z
    .object({
      term: z
        .string()
        .describe(
          'Physics term to look up in the HEP glossary (e.g. "quark", "hadron", "luminosity", "jet", "muon")',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe('Maximum number of matching terms to return (1–25, default 10)'),
    })
    .strip(),
};
