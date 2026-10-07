import { z } from 'zod';

export const siteCreateSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  timezone: z.string().optional(),
  is_active: z.boolean().optional(),
});

export const siteUpdateSchema = siteCreateSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

export type SiteCreate = z.infer<typeof siteCreateSchema>;
