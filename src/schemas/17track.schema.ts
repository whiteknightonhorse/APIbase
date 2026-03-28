import { z, type ZodSchema } from 'zod';

const register = z.object({
  tracking_number: z.string().min(3).max(50).describe('Package tracking number (e.g. "1Z999AA10123456784" for UPS, "9400111899560243888780" for USPS). Carrier is auto-detected from 3,200+ supported carriers'),
  tag: z.string().max(50).optional().describe('Optional label for this shipment (e.g. order ID, customer reference). Up to 50 characters'),
}).strip();

const status = z.object({
  tracking_number: z.string().min(3).max(50).describe('Tracking number previously registered with tracking.register. Returns full event timeline, carrier info, milestones, and delivery status'),
}).strip();

const list = z.object({
  page: z.number().int().min(1).optional().default(1).describe('Page number (default 1)'),
  page_size: z.number().int().min(1).max(100).optional().default(20).describe('Results per page (1-100, default 20)'),
  status: z.enum(['NotFound', 'InTransit', 'Delivered', 'Expired', 'Exception']).optional().describe('Filter by package status'),
}).strip();

export const trackingSchemas: Record<string, ZodSchema> = {
  'tracking.register': register,
  'tracking.status': status,
  'tracking.list': list,
};
