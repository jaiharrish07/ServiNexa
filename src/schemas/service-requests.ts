import { z } from 'zod';
import { uuid, categoryEnum, priorityEnum } from './common';

/**
 * Create: the client may ONLY provide these fields. Server-controlled fields
 * (status, request_number, requester_id, approved_by, assigned_technician_id,
 * timestamps) are intentionally absent so z.object strips them — closing the
 * mass-assignment hole in the guide's raw `insert(req.body)`.
 */
export const serviceRequestCreateSchema = z.object({
  site_id: uuid,
  machine_id: uuid.optional(),
  title: z.string().min(3),
  description: z.string().min(5),
  raw_input: z.string().optional(),
  category: categoryEnum.optional(),
  priority: priorityEnum.optional(),
  ai_confidence: z.number().min(0).max(1).optional(),
});

/**
 * Update: deliberately excludes `status` — status changes flow through Dev A's
 * workflow engine (POST /:id/transition), not a raw PATCH.
 */
export const serviceRequestUpdateSchema = z
  .object({
    title: z.string().min(3).optional(),
    description: z.string().min(5).optional(),
    machine_id: uuid.optional(),
    category: categoryEnum.optional(),
    priority: priorityEnum.optional(),
    ai_confidence: z.number().min(0).max(1).optional(),
    resolution_notes: z.string().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

export type ServiceRequestCreate = z.infer<typeof serviceRequestCreateSchema>;
