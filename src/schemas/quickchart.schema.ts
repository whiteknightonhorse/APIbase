import { z, type ZodSchema } from 'zod';

const dataset = z.object({
  label: z.string().describe('Dataset label (e.g. "Revenue", "Temperature")'),
  data: z.array(z.number()).describe('Array of numeric values'),
});

const chartCreate = z
  .object({
    type: z
      .enum(['bar', 'line', 'pie', 'doughnut', 'radar', 'scatter', 'horizontalBar'])
      .describe('Chart type: bar, line, pie, doughnut, radar, scatter, horizontalBar'),
    labels: z.array(z.string()).describe('X-axis labels (e.g. ["Q1", "Q2", "Q3", "Q4"])'),
    datasets: z.array(dataset).min(1).describe('One or more datasets to plot'),
    title: z.string().optional().describe('Chart title displayed at top'),
    width: z
      .number()
      .int()
      .min(100)
      .max(1000)
      .optional()
      .describe('Image width in pixels (100-1000, default 500)'),
    height: z
      .number()
      .int()
      .min(100)
      .max(1000)
      .optional()
      .describe('Image height in pixels (100-1000, default 300)'),
  })
  .strip();

export const quickchartSchemas: Record<string, ZodSchema> = {
  'chart.create': chartCreate,
};
