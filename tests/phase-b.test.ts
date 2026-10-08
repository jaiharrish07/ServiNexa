import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// DB + AI service are mocked: in-memory Supabase, and the AI client always returns
// the stub path (source:'stub') so feature logic is deterministic without network.
vi.mock('../src/config/supabase', async () => {
  const mock = await import('./_mocks/supabase');
  return { supabase: mock.mockSupabase, supabaseAnonUrl: 'http://x', supabaseAnonKey: 'anon' };
});
vi.mock('../src/services/ai-client', () => ({
  callAIService: async () => ({ data: null, error: 'offline', source: 'stub' }),
}));

import { openBidding, scoreBids, acceptBid } from '../src/services/bidding.service';
import dashboardRoutes from '../src/routes/dashboard.routes';
import bidsRoutes from '../src/routes/bids.routes';
import { resetDb, seedTable, getTable } from './_mocks/supabase';
import { testApp, seedUser } from './_mocks/helpers';

beforeEach(() => resetDb());

function seedBiddingWorld() {
  seedTable('service_requests', [
    { id: 'sr1', request_number: 'SR-1', status: 'APPROVED', priority: 'HIGH', site_id: 'siteA', title: 'Hydraulic leak', requester_id: 'u1', machine_id: 'm1', category: 'HYDRAULIC' },
  ]);
  seedTable('technicians', [
    { id: 't1', user_id: 'tu1', is_available: true, specializations: ['hydraulic'], current_job_count: 0, max_concurrent_jobs: 3, site_id: 'siteA', rating: 4.8, success_rate: 0.9 },
    { id: 't2', user_id: 'tu2', is_available: true, specializations: ['electrical'], current_job_count: 1, max_concurrent_jobs: 3, site_id: 'siteA', rating: 4.2, success_rate: 0.7 },
  ]);
}

describe('bidding flow (service level, stub-backed)', () => {
  it('opens bidding: APPROVED → BIDDING + creates a bid round', async () => {
    seedBiddingWorld();
    const r = await openBidding('sr1', 2, 'ops1', 'OPS_MANAGER');
    expect(r.success).toBe(true);
    expect(getTable('service_requests')[0].status).toBe('BIDDING');
    expect(getTable('bid_rounds').length).toBe(1);
    expect(r.invited?.length).toBeGreaterThan(0);
  });

  it('scores bids: BIDDING → BID_REVIEW + writes ai_score', async () => {
    seedBiddingWorld();
    await openBidding('sr1', 2, 'ops1', 'OPS_MANAGER');
    seedTable('solution_bids', [
      { id: 'b1', service_request_id: 'sr1', technician_id: 't1', proposed_solution: 'seal kit', parts_list: [{ part_number: 'HS-100', quantity: 1 }], labor_hours: 3, total_cost: 4500, status: 'SUBMITTED' },
      { id: 'b2', service_request_id: 'sr1', technician_id: 't2', proposed_solution: 'replace pump', parts_list: [{ part_number: 'HP-900', quantity: 1 }], labor_hours: 8, total_cost: 22000, status: 'SUBMITTED' },
    ]);
    const r = await scoreBids('sr1', 'ops1', 'OPS_MANAGER');
    expect(r.success).toBe(true);
    expect(getTable('service_requests')[0].status).toBe('BID_REVIEW');
    expect(r.ranked_bids?.length).toBe(2);
    expect(getTable('solution_bids').every((b) => b.ai_score)).toBe(true);
  });

  it('accepts a bid: → ASSIGNED, winner ACCEPTED, parts staged, tech job++', async () => {
    seedBiddingWorld();
    await openBidding('sr1', 2, 'ops1', 'OPS_MANAGER');
    const roundId = getTable('bid_rounds')[0].id;
    seedTable('solution_bids', [
      { id: 'b1', bid_round_id: roundId, service_request_id: 'sr1', technician_id: 't1', proposed_solution: 'seal kit', parts_list: [{ part_number: 'HS-100', quantity: 1 }], labor_hours: 3, total_cost: 4500, status: 'SUBMITTED' },
      { id: 'b2', bid_round_id: roundId, service_request_id: 'sr1', technician_id: 't2', proposed_solution: 'pump', parts_list: [], labor_hours: 8, total_cost: 22000, status: 'SUBMITTED' },
    ]);
    await scoreBids('sr1', 'ops1', 'OPS_MANAGER');

    const r = await acceptBid('b1', 'ops1', 'OPS_MANAGER');
    expect(r.success).toBe(true);
    const sr = getTable('service_requests')[0];
    expect(sr.status).toBe('ASSIGNED');
    expect(sr.selected_bid_id).toBe('b1');
    expect(sr.assigned_technician_id).toBe('t1');
    const bids = getTable('solution_bids');
    expect(bids.find((b) => b.id === 'b1')!.status).toBe('ACCEPTED');
    expect(bids.find((b) => b.id === 'b2')!.status).toBe('REJECTED');
    expect(getTable('parts_staging').length).toBe(1); // HS-100 staged
    expect(getTable('technicians').find((t) => t.id === 't1')!.current_job_count).toBe(1);
  });

  it('rejects a stale bid acceptance without changing any bid state', async () => {
    seedBiddingWorld();
    seedTable('solution_bids', [{ id: 'b1', service_request_id: 'sr1', technician_id: 't1', status: 'SUBMITTED' }]);
    const result = await acceptBid('b1', 'ops1', 'OPS_MANAGER');
    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_TRANSITION');
    expect(getTable('solution_bids')[0].status).toBe('SUBMITTED');
    expect(getTable('service_requests')[0].status).toBe('APPROVED');
  });
});

describe('SLA heatmap route', () => {
  const app = testApp((a) => a.use('/api', dashboardRoutes));

  it('computes risk colors and flags elevated (RED + high impact)', async () => {
    const u = seedUser('OPS_MANAGER');
    const now = Date.now();
    seedTable('service_requests', [
      // ~5% time left + impact 80 → RED + elevated.
      { id: 'sr1', request_number: 'SR-1', status: 'ASSIGNED', priority: 'CRITICAL', category: 'HYDRAULIC', created_at: new Date(now - 95 * 60000).toISOString(), sla_deadline: new Date(now + 5 * 60000).toISOString(), cascading_impact_score: 80, impact_inr: 111000 },
      // ~90% time left → GREEN.
      { id: 'sr2', request_number: 'SR-2', status: 'ASSIGNED', priority: 'LOW', category: 'PREVENTIVE', created_at: new Date(now - 10 * 60000).toISOString(), sla_deadline: new Date(now + 90 * 60000).toISOString(), cascading_impact_score: 5 },
    ]);
    const res = await request(app).get('/api/dashboard/sla-heatmap').set('Authorization', u.bearer).expect(200);
    const cards = res.body.heatmap as any[];
    const c1 = cards.find((c) => c.request_number === 'SR-1');
    const c2 = cards.find((c) => c.request_number === 'SR-2');
    expect(c1.sla_status).toBe('RED');
    expect(c1.elevated_alert).toBe(true);
    expect(c2.sla_status).toBe('GREEN');
    expect(c2.elevated_alert).toBe(false);
  });

  it('401 without a token', async () => {
    await request(app).get('/api/dashboard/sla-heatmap').expect(401);
  });
});

describe('blind bidding visibility', () => {
  const app = testApp((a) => a.use('/api', bidsRoutes));
  const requestId = '11111111-1111-4111-8111-111111111111';

  function seedBids() {
    seedTable('bid_rounds', [{ id: 'r1', service_request_id: requestId, status: 'OPEN', opened_at: new Date().toISOString() }]);
    seedTable('solution_bids', [
      { id: 'b1', service_request_id: requestId, technician_id: 't1', proposed_solution: 'a', labor_hours: 3, total_cost: 4500, status: 'SUBMITTED', submitted_at: new Date().toISOString() },
      { id: 'b2', service_request_id: requestId, technician_id: 't2', proposed_solution: 'b', labor_hours: 5, total_cost: 8000, status: 'SUBMITTED', submitted_at: new Date().toISOString() },
    ]);
  }

  it('a technician sees ONLY their own bid', async () => {
    const u = seedUser('TECHNICIAN', { id: 'tu1' });
    seedTable('technicians', [{ id: 't1', user_id: 'tu1', is_available: true }]);
    seedBids();
    const res = await request(app).get(`/api/bids/${requestId}`).set('Authorization', u.bearer).expect(200);
    expect(res.body.visibility).toBe('own');
    expect(res.body.bids.map((b: any) => b.id)).toEqual(['b1']);
  });

  it('an ops manager sees ALL bids', async () => {
    const u = seedUser('OPS_MANAGER');
    seedTable('technicians', [{ id: 't1', user_id: 'tu1' }, { id: 't2', user_id: 'tu2' }]);
    seedBids();
    const res = await request(app).get(`/api/bids/${requestId}`).set('Authorization', u.bearer).expect(200);
    expect(res.body.visibility).toBe('all');
    expect(res.body.bids.length).toBe(2);
  });
});
