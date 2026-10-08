import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/config/supabase', async () => {
  const mock = await import('./_mocks/supabase');
  return { supabase: mock.mockSupabase, supabaseAnonUrl: 'http://x', supabaseAnonKey: 'anon' };
});
vi.mock('../src/services/visual-diagnosis.service', () => ({
  createVisualDiagnosis: vi.fn(async (sr: any) => ({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', service_request_id: sr.id })),
  get3dData: vi.fn(async (id: string) => ({ visual_diagnosis: { id }, components: [], highlight: { component_id: 'c1', component_name: 'Pump' } })),
}));
vi.mock('../src/services/parts.service', () => ({
  sourceParts: vi.fn(async (partNumbers: string[]) => ({ matrix: partNumbers.map((part_number) => ({ part_number })), source: 'stub' })),
}));
vi.mock('../src/services/impact.service', () => ({
  computeImpact: vi.fn(async () => ({ cascading_impact_score: 42, source: 'stub' })),
  getDependencyGraph: vi.fn(async () => [{ upstream: 'm1', downstream: 'm2' }]),
}));
vi.mock('../src/services/knowledge.service', () => ({
  searchSimilar: vi.fn(async () => [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', score: 0.9 }]),
}));
vi.mock('../src/services/bidding.service', () => ({
  openBidding: vi.fn(async () => ({ success: true, bid_round: { id: 'round-1' }, invited: [] })),
  scoreBids: vi.fn(async () => ({ success: true, ranked_bids: [{ bid_id: 'bid-1', score: 90 }] })),
  acceptBid: vi.fn(async () => ({ success: true, service_request: { id: '11111111-1111-4111-8111-111111111111', status: 'ASSIGNED' }, bid: { id: 'bid-1' }, staging: [] })),
}));
vi.mock('../src/services/audit', () => ({ createAuditLog: vi.fn(async () => ({})) }));

import visualRoutes from '../src/routes/visual-diagnoses.routes';
import partsRoutes from '../src/routes/parts.routes';
import impactRoutes from '../src/routes/impact.routes';
import stagingRoutes from '../src/routes/staging.routes';
import knowledgeRoutes from '../src/routes/knowledge.routes';
import bidsRoutes from '../src/routes/bids.routes';
import { createVisualDiagnosis, get3dData } from '../src/services/visual-diagnosis.service';
import { sourceParts } from '../src/services/parts.service';
import { computeImpact, getDependencyGraph } from '../src/services/impact.service';
import { searchSimilar } from '../src/services/knowledge.service';
import { openBidding, scoreBids, acceptBid } from '../src/services/bidding.service';
import { resetDb, seedTable, getTable } from './_mocks/supabase';
import { seedUser, testApp } from './_mocks/helpers';

const srId = '11111111-1111-4111-8111-111111111111';
const siteId = '22222222-2222-4222-8222-222222222222';
const machineId = '33333333-3333-4333-8333-333333333333';
const diagnosisId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const stagingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const bidId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const visualApp = testApp((app) => app.use('/api', visualRoutes));
const partsApp = testApp((app) => app.use('/api', partsRoutes));
const impactApp = testApp((app) => app.use('/api', impactRoutes));
const stagingApp = testApp((app) => app.use('/api', stagingRoutes));
const knowledgeApp = testApp((app) => app.use('/api', knowledgeRoutes));
const bidsApp = testApp((app) => app.use('/api', bidsRoutes));

function seedRequest(over: Record<string, unknown> = {}) {
  seedTable('service_requests', [{
    id: srId,
    request_number: 'SR-TEST-001',
    requester_id: 'customer-user',
    assigned_technician_id: 'tech-1',
    site_id: siteId,
    machine_id: machineId,
    priority: 'HIGH',
    category: 'HYDRAULIC',
    status: 'APPROVED',
    ...over,
  }]);
}

beforeEach(() => resetDb());

describe('visual diagnosis routes', () => {
  it('creates a diagnosis for an accessible request and serves viewer data', async () => {
    const ops = seedUser('OPS_MANAGER');
    seedRequest();
    const created = await request(visualApp).post('/api/visual-diagnoses').set('Authorization', ops.bearer).send({ service_request_id: srId }).expect(201);
    expect(created.body.visual_diagnosis.service_request_id).toBe(srId);
    expect(createVisualDiagnosis).toHaveBeenCalledOnce();
    seedTable('visual_diagnoses', [{ id: diagnosisId, service_request_id: srId, machine_type: 'CNC Mill', affected_component_id: 'c1', component_name: 'Pump' }]);

    const viewer = await request(visualApp).get(`/api/visual-diagnoses/${diagnosisId}/3d-data`).set('Authorization', ops.bearer).expect(200);
    expect(viewer.body.highlight.component_name).toBe('Pump');
    expect(get3dData).toHaveBeenCalledWith(diagnosisId);
  });

  it('blocks customers from creating diagnoses', async () => {
    const customer = seedUser('CUSTOMER');
    seedRequest({ requester_id: customer.id });
    await request(visualApp).post('/api/visual-diagnoses').set('Authorization', customer.bearer).send({ service_request_id: srId }).expect(403);
  });
});

describe('parts sourcing and inventory routes', () => {
  it('sources requested parts and returns site inventory with computed availability', async () => {
    const ops = seedUser('OPS_MANAGER');
    seedRequest();
    seedTable('spare_parts', [{ id: 'part-1', site_id: siteId, part_number: 'HS-100', name: 'Seal kit', quantity_available: 8, quantity_reserved: 3, reorder_level: 4 }]);

    const sourced = await request(partsApp).post(`/api/parts-sourcing/${srId}`).set('Authorization', ops.bearer).send({ part_numbers: ['HS-100'], quantities: { 'HS-100': 2 } }).expect(200);
    expect(sourced.body.sourcing.matrix).toHaveLength(1);
    expect(sourceParts).toHaveBeenCalledWith(['HS-100'], siteId, expect.objectContaining({ quantities: { 'HS-100': 2 } }));

    const inventory = await request(partsApp).get(`/api/inventory/${siteId}`).set('Authorization', ops.bearer).expect(200);
    expect(inventory.body.inventory[0]).toMatchObject({ available: 5, low_stock: false });
  });

  it('returns not found for a request outside the customer scope', async () => {
    const customer = seedUser('CUSTOMER');
    seedRequest({ requester_id: 'someone-else' });
    await request(partsApp).post(`/api/parts-sourcing/${srId}`).set('Authorization', customer.bearer).send({ part_numbers: ['HS-100'] }).expect(404);
  });
});

describe('impact analysis routes', () => {
  it('analyzes request impact and returns a machine dependency graph', async () => {
    const ops = seedUser('OPS_MANAGER');
    seedRequest();
    const analyzed = await request(impactApp).post(`/api/impact-analysis/${srId}`).set('Authorization', ops.bearer).expect(200);
    expect(analyzed.body.impact.cascading_impact_score).toBe(42);
    expect(computeImpact).toHaveBeenCalledWith(machineId, srId);

    const graph = await request(impactApp).get(`/api/dependencies/${machineId}`).set('Authorization', ops.bearer).expect(200);
    expect(graph.body.dependencies).toHaveLength(1);
    expect(getDependencyGraph).toHaveBeenCalledWith(machineId);
  });

  it('rejects a request without a machine', async () => {
    const ops = seedUser('OPS_MANAGER');
    seedRequest({ machine_id: null });
    await request(impactApp).post(`/api/impact-analysis/${srId}`).set('Authorization', ops.bearer).expect(400);
  });
});

describe('staging routes', () => {
  it('lists request staging and rejects unauthenticated dashboard access', async () => {
    const ops = seedUser('OPS_MANAGER');
    seedRequest();
    seedTable('parts_staging', [{ id: stagingId, service_request_id: srId, status: 'RESERVED', part_number: 'HS-100', quantity: 1 }]);
    const rows = await request(stagingApp).get(`/api/staging/${srId}`).set('Authorization', ops.bearer).expect(200);
    expect(rows.body.staging[0].part_number).toBe('HS-100');
    await request(stagingApp).get('/api/staging/dashboard').expect(401);
  });
});

describe('knowledge base routes', () => {
  it('searches, creates, reads, and reports knowledge entries', async () => {
    const ops = seedUser('OPS_MANAGER');
    seedTable('knowledge_entries', [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', machine_type: 'CNC Mill', category: 'HYDRAULIC', success_flag: true }]);
    const found = await request(knowledgeApp).get('/api/knowledge/search?category=HYDRAULIC&q=seal').set('Authorization', ops.bearer).expect(200);
    expect(found.body.results).toHaveLength(1);
    expect(searchSimilar).toHaveBeenCalledWith(expect.objectContaining({ category: 'HYDRAULIC', description: 'seal' }));

    const created = await request(knowledgeApp).post('/api/knowledge').set('Authorization', ops.bearer).send({ machine_type: 'CNC Mill', category: 'HYDRAULIC', problem_description: 'Seal leak', solution_applied: 'Replace seal' }).expect(201);
    const entryId = created.body.entry.id;
    expect(getTable('knowledge_entries')).toHaveLength(2);
    await request(knowledgeApp).get(`/api/knowledge/${entryId}`).set('Authorization', ops.bearer).expect(200);
    const stats = await request(knowledgeApp).get('/api/knowledge/stats').set('Authorization', ops.bearer).expect(200);
    expect(stats.body.stats.total).toBe(2);
  });
});

describe('bidding routes', () => {
  it('opens and scores a round, accepts a bid, and permits a technician submission', async () => {
    const ops = seedUser('OPS_MANAGER');
    const techUser = seedUser('TECHNICIAN');
    seedRequest({ status: 'APPROVED' });
    seedTable('technicians', [{ id: 'tech-1', user_id: techUser.id }]);
    seedTable('bid_rounds', [{ id: 'round-1', service_request_id: srId, status: 'OPEN' }]);

    await request(bidsApp).post(`/api/bid-rounds/${srId}/open`).set('Authorization', ops.bearer).send({ top_n: 2 }).expect(200);
    expect(openBidding).toHaveBeenCalledWith(srId, 2, ops.id, 'OPS_MANAGER');

    const submission = await request(bidsApp).post('/api/bids/submit').set('Authorization', techUser.bearer).send({ service_request_id: srId, proposed_solution: 'Replace hydraulic seal', labor_hours: 3, total_cost: 4500, parts_list: [{ part_number: 'HS-100', quantity: 1 }] }).expect(201);
    expect(submission.body.bid.status).toBe('SUBMITTED');
    expect(getTable('solution_bids')).toHaveLength(1);

    await request(bidsApp).post(`/api/bids/${srId}/score`).set('Authorization', ops.bearer).expect(200);
    expect(scoreBids).toHaveBeenCalledWith(srId, ops.id, 'OPS_MANAGER');
    await request(bidsApp).put(`/api/bids/${bidId}/accept`).set('Authorization', ops.bearer).expect(200);
    expect(acceptBid).toHaveBeenCalledWith(bidId, ops.id, 'OPS_MANAGER');
  });
});
