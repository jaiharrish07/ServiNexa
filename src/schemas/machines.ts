import { z } from 'zod';
import { uuid, machineStatusEnum, criticalityEnum } from './common';

export const machineCreateSchema = z.object({
  site_id: uuid,
  name: z.string().min(1),
  code: z.string().min(1),
  type: z.string().min(1),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serial_number: z.string().optional(),
  install_date: z.string().optional(),
  status: machineStatusEnum.optional(),
  criticality: criticalityEnum.optional(),
  air_temp: z.number().optional(),
  process_temp: z.number().optional(),
  rotational_speed: z.number().int().optional(),
  torque: z.number().optional(),
  tool_wear: z.number().int().optional(),
  last_maintenance_date: z.string().optional(),
  next_maintenance_date: z.string().optional(),
});

export const machineUpdateSchema = machineCreateSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

export type MachineCreate = z.infer<typeof machineCreateSchema>;
