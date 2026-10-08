import { z } from 'zod';
import { categoryEnum, uuid } from './common';

const boundedText = (min = 1, max = 5000) => z.string().trim().min(min).max(max);

export const requestIdParam = z.object({ requestId: uuid });
export const machineIdParam = z.object({ machineId: uuid });
export const siteIdParam = z.object({ siteId: uuid });
export const visualIdParam = z.object({ id: uuid });
export const bidIdParam = z.object({ bidId: uuid });
export const stagingIdParam = z.object({ id: uuid });
export const visualDiagnosisIdParam = z.object({ visualDiagnosisId: uuid });
export const partNumberParam = z.object({ partNumber: boundedText(1, 100) });
export const knowledgeIdParam = z.object({ id: uuid });

export const visualDiagnosisCreateSchema = z.object({ service_request_id: uuid });

export const technicianDiagnosisCreateSchema = z.object({
  visual_diagnosis_id: uuid,
  diagnosis_text: boundedText(3),
  proposed_solution: boundedText(3),
  parts_needed: z.array(z.object({ part_number: boundedText(1, 100), quantity: z.number().int().positive().max(10000) })).max(100).optional(),
  estimated_cost: z.number().finite().nonnegative().optional(),
  estimated_hours: z.number().finite().nonnegative().max(10000).optional(),
  confidence_level: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
});

export const bidRoundOpenSchema = z.object({ top_n: z.number().int().positive().max(100).optional() }).default({});
export const bidSubmitSchema = z.object({
  service_request_id: uuid,
  proposed_solution: boundedText(3),
  parts_list: z.array(z.object({ part_number: boundedText(1, 100), quantity: z.number().int().positive().max(10000) })).max(100).optional(),
  labor_hours: z.number().finite().nonnegative().max(10000),
  total_cost: z.number().finite().nonnegative(),
  approach_description: boundedText(0, 5000).optional(),
});

export const partsSourcingSchema = z.object({
  part_numbers: z.array(boundedText(1, 100)).max(100).optional(),
  quantities: z.record(z.number().int().positive().max(10000)).optional(),
}).default({});

export const stagingStatusSchema = z.object({
  status: z.enum(['IDENTIFIED', 'RESERVED', 'IN_TRANSIT', 'STAGED', 'ISSUED']),
});

export const knowledgeCreateSchema = z.object({
  machine_type: boundedText(1, 150),
  category: categoryEnum,
  sub_category: boundedText(1, 150).optional(),
  problem_description: boundedText(3),
  solution_applied: boundedText(3),
  parts_used: z.array(z.unknown()).max(100).optional(),
  resolution_hours: z.number().finite().nonnegative().max(10000).optional(),
  cost: z.number().finite().nonnegative().optional(),
  effectiveness_rating: z.number().int().min(1).max(5).optional(),
  success_flag: z.boolean().optional(),
  tags: z.array(boundedText(1, 100)).max(100).optional(),
});

export const knowledgeSearchQuerySchema = z.object({
  category: categoryEnum.optional(),
  machine_type: boundedText(1, 150).optional(),
  sub_category: boundedText(1, 150).optional(),
  q: boundedText(1, 1000).optional(),
});

export const workflowTransitionSchema = z.object({
  status: z.enum([
    'DRAFT','SUBMITTED','VALIDATING','PENDING_APPROVAL','APPROVED','BIDDING','BID_REVIEW','BID_ACCEPTED',
    'ASSIGNED','IN_PROGRESS','COMPLETED','VERIFIED','CLOSED','EXCEPTION',
  ]),
  technician_id: uuid.optional(),
  resolution_notes: boundedText(1, 5000).optional(),
});

export const exceptionCreateSchema = z.object({
  type: z.enum(['TECH_DROPOUT','PART_UNAVAILABLE','SLA_BREACH','ESCALATION','OTHER']),
  description: boundedText(3),
  severity: z.enum(['CRITICAL','HIGH','MEDIUM','LOW']).optional(),
});

export const aiClassifySchema = z.object({ description: boundedText(3, 10000) });
export const aiPredictSchema = z.object({ machine_id: uuid });
export const aiMatchSchema = z.object({ service_request_id: uuid });
export const aiAnomaliesSchema = z.object({ site_id: uuid.optional() }).default({});
export const aiDiagnosisSchema = z.object({
  machine_type: boundedText(1, 150),
  sub_category: boundedText(1, 150).optional(),
  sensor_data: z.record(z.union([z.number().finite(), z.string().max(200), z.null()])).optional(),
  machine_history: z.array(z.record(z.unknown())).max(100).optional(),
});
