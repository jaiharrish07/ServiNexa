import { z } from 'zod';

/** Optional site filter shared by every report endpoint. */
export const reportQuerySchema = z.object({
  site_id: z.string().uuid().optional(),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
