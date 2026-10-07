import { z } from 'zod';

// ── Shared enums (mirror the SQL CHECK constraints) ──
export const roleEnum = z.enum(['ADMIN', 'OPS_MANAGER', 'TECHNICIAN', 'CUSTOMER']);
export const machineStatusEnum = z.enum(['OPERATIONAL', 'DEGRADED', 'DOWN', 'MAINTENANCE']);
export const criticalityEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export const priorityEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export const categoryEnum = z.enum([
  'MECHANICAL',
  'ELECTRICAL',
  'HYDRAULIC',
  'PNEUMATIC',
  'SOFTWARE',
  'CALIBRATION',
  'SAFETY',
  'PREVENTIVE',
  'OTHER',
]);
export const srStatusEnum = z.enum([
  'DRAFT',
  'SUBMITTED',
  'VALIDATING',
  'PENDING_APPROVAL',
  'APPROVED',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'VERIFIED',
  'CLOSED',
  'EXCEPTION',
]);
export const woStatusEnum = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export const reservationStatusEnum = z.enum(['RESERVED', 'ISSUED', 'RETURNED', 'CANCELLED']);
export const exceptionTypeEnum = z.enum([
  'TECH_DROPOUT',
  'PART_UNAVAILABLE',
  'SLA_BREACH',
  'ESCALATION',
  'OTHER',
]);
export const severityEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export const notificationTypeEnum = z.enum(['INFO', 'WARNING', 'CRITICAL', 'SUCCESS']);

// ── Shared primitives ──
export const uuid = z.string().uuid();
export const idParam = z.object({ id: uuid });

/** Reject empty-object write payloads (a PATCH with no fields is a client error). */
export const nonEmpty = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).strict().refine((o) => Object.keys(o).length > 0, {
    message: 'At least one field is required',
  });
