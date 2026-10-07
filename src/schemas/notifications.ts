import { z } from 'zod';
import { notificationTypeEnum } from './common';

/** Shape consumed by the notifications service (also used by Dev A's workflow on merge). */
export const notificationInputSchema = z.object({
  user_id: z.string().uuid(),
  title: z.string().min(1),
  message: z.string().min(1),
  type: notificationTypeEnum.optional(),
  related_entity_type: z.string().optional(),
  related_entity_id: z.string().uuid().optional(),
});

export type NotificationInput = z.infer<typeof notificationInputSchema>;
