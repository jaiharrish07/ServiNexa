import { z } from 'zod';
import { uuid } from './common';

export const sparePartCreateSchema = z.object({
  site_id: uuid,
  name: z.string().min(1),
  part_number: z.string().min(1),
  category: z.string().optional(),
  quantity_available: z.number().int().min(0).optional(),
  quantity_reserved: z.number().int().min(0).optional(),
  reorder_level: z.number().int().min(0).optional(),
  unit_cost: z.number().optional(),
  location: z.string().optional(),
});

export const sparePartUpdateSchema = sparePartCreateSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

export const reserveSchema = z.object({
  work_order_id: uuid,
  quantity: z.number().int().positive(),
});

export type SparePartCreate = z.infer<typeof sparePartCreateSchema>;
export type ReserveInput = z.infer<typeof reserveSchema>;
