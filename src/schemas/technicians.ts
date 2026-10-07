import { z } from 'zod';
import { uuid } from './common';

export const technicianCreateSchema = z.object({
  user_id: uuid,
  site_id: uuid,
  employee_code: z.string().min(1),
  specializations: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  max_concurrent_jobs: z.number().int().positive().optional(),
  current_job_count: z.number().int().min(0).optional(),
  avg_resolution_hours: z.number().optional(),
  rating: z.number().min(0).max(5).optional(),
  is_available: z.boolean().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const technicianUpdateSchema = technicianCreateSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

export type TechnicianCreate = z.infer<typeof technicianCreateSchema>;
