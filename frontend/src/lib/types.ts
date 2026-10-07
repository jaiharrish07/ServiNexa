export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'ADMIN' | 'OPS_MANAGER' | 'TECHNICIAN' | 'CUSTOMER';
  phone?: string;
  avatar_url?: string;
  is_active: boolean;
}

export interface Site {
  id: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  lat?: number;
  lng?: number;
  is_active: boolean;
  created_at: string;
}

export interface Machine {
  id: string;
  code: string;
  name: string;
  type: string;
  site_id: string;
  site?: Site;
  status: 'OPERATIONAL' | 'UNDER_MAINTENANCE' | 'DEGRADED' | 'DECOMMISSIONED';
  air_temp?: number;
  process_temp?: number;
  rotational_speed?: number;
  torque?: number;
  tool_wear?: number;
  manufacturer?: string;
  model?: string;
  created_at: string;
}

export interface Technician {
  id: string;
  user_id: string;
  employee_code: string;
  site_id: string;
  specializations: string[];
  certifications: string[];
  current_job_count: number;
  max_concurrent_jobs: number;
  avg_resolution_hours?: number;
  rating?: number;
  is_available: boolean;
  users?: { full_name: string; email?: string };
}

export interface ServiceRequest {
  id: string;
  request_number: string;
  title: string;
  description: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: string;
  site_id: string;
  machine_id?: string;
  requester_id: string;
  assigned_technician_id?: string;
  sla_deadline?: string;
  approved_at?: string;
  completed_at?: string;
  cascading_impact_score?: number;
  impact_inr?: number;
  selected_bid_id?: string;
  machines?: { code: string; name: string };
  technician?: { employee_code: string; users?: { full_name: string } };
  created_at: string;
  updated_at: string;
}

export interface WorkOrder {
  id: string;
  order_number: string;
  service_request_id: string;
  technician_id: string;
  description?: string;
  estimated_hours?: number;
  status: string;
  notes?: string;
  service_requests?: { title?: string; priority?: string; request_number?: string };
  created_at: string;
  updated_at?: string;
}

export interface SparePart {
  id: string;
  part_number: string;
  name: string;
  category: string;
  site_id: string;
  quantity_available: number;
  quantity_reserved: number;
  unit_cost: number;
  reorder_level: number;
  version?: number;
  sites?: { code?: string; name?: string };
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  related_entity_type?: string;
  related_entity_id?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  performed_by: string;
  field_changed?: string;
  old_value?: string;
  new_value?: string;
  metadata?: Record<string, unknown>;
  hash: string;
  prev_hash?: string;
  chain_position?: number;
  created_at: string;
  performer?: { full_name: string; email: string };
}

export interface DashboardStats {
  total_requests: number;
  open_requests: number;
  in_progress: number;
  completed: number;
  avg_resolution_hours: number;
  by_priority: Record<string, number>;
  by_category: Record<string, number>;
  by_status: Record<string, number>;
}

export interface HeatmapCard {
  service_request_id: string;
  request_number: string;
  machine_code: string | null;
  machine_name: string | null;
  category: string;
  priority: string;
  status: string;
  assigned_technician: string | null;
  sla_status: string;
  pct_elapsed: number;
  time_remaining_mins: number;
  cascading_impact_score: number;
  impact_inr: number;
  elevated_alert: boolean;
}

export interface KnowledgeEntry {
  id: string;
  machine_type: string;
  category: string;
  sub_category?: string;
  problem_description: string;
  solution_applied: string;
  parts_used: string[];
  resolution_hours?: number;
  cost?: number;
  effectiveness_rating?: number;
  success_flag: boolean;
  tags: string[];
  created_at: string;
}

export interface Bid {
  id: string;
  service_request_id: string;
  bid_round_id: string;
  technician_id: string;
  proposed_solution: string;
  parts_list: Array<{ part_number: string; quantity: number }>;
  labor_hours: number;
  total_cost: number;
  approach_description?: string;
  score?: number;
  status: string;
  submitted_at: string;
  technicians?: { employee_code: string; users?: { full_name: string } };
}

export type StatusColor = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'BLACK';
