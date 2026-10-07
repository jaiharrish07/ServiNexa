import { z } from 'zod';
import { uuid, woStatusEnum } from './common';

export const workOrderCreateSchema = z.object({
  service_request_id: uuid,
  technician_id: uuid,
  description: z.string().optional(),
  estimated_hours: z.number().optional(),
  actual_hours: z.number().optional(),
  notes: z.string().optional(),
});

export const workOrderUpdateSchema = workOrderCreateSchema
  .partial()
  .extend({
    status: woStatusEnum.optional(),
    started_at: z.string().optional(),
    completed_at: z.string().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

export type WorkOrderCreate = z.infer<typeof workOrderCreateSchema>;
