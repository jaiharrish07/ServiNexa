/**
 * Dev-B endpoint walkthrough against a RUNNING server with a SEEDED database.
 *   1) npm run seed      (needs real Supabase creds)
 *   2) npm run dev       (in another terminal)
 *   3) npm run smoke
 *
 * Base URL from SMOKE_BASE_URL, else http://localhost:3001.
 */
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3001';
let token = '';
let pass = 0;
let fail = 0;

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    console.log(`✅ ${label}${detail ? ' — ' + detail : ''}`);
  } else {
    fail++;
    console.log(`❌ ${label}${detail ? ' — ' + detail : ''}`);
  }
  return ok;
}

async function main() {
  console.log(`\n=== DQBH Dev-B smoke @ ${BASE} ===\n`);

  const health = await api('GET', '/health');
  check('GET /health', health.status === 200, `status ${health.status}`);

  const login = await api('POST', '/api/auth/login', { email: 'ops@dqbh.com', password: 'Ops123!' });
  if (!check('POST /api/auth/login (ops)', login.status === 200 && !!login.json?.token, `status ${login.status}`)) {
    console.log('\n⚠ Login failed — did you run `npm run seed` against a live DB first?\n');
    return finish();
  }
  token = login.json.token;

  const sites = await api('GET', '/api/sites');
  check('GET /api/sites', sites.status === 200 && Array.isArray(sites.json?.sites), `${sites.json?.sites?.length ?? 0} sites`);
  const siteA = sites.json?.sites?.find((s: any) => s.code === 'SITE-A');

  const machines = await api('GET', '/api/machines');
  check('GET /api/machines', machines.status === 200, `${machines.json?.machines?.length ?? 0} machines`);
  const m104 = machines.json?.machines?.find((m: any) => m.code === 'M-104');

  const techs = await api('GET', '/api/technicians?available=true');
  check('GET /api/technicians?available=true', techs.status === 200, `${techs.json?.technicians?.length ?? 0} techs`);

  const sr = await api('POST', '/api/service-requests', {
    site_id: siteA?.id ?? m104?.site_id,
    machine_id: m104?.id,
    title: 'Hydraulic leak on CNC Mill',
    description: 'Hydraulic system on M-104 leaking near the main cylinder; pressure dropping.',
    priority: 'HIGH',
    category: 'HYDRAULIC',
  });
  check('POST /api/service-requests', sr.status === 201 && /^SR-\d{8}-\d{3}$/.test(sr.json?.service_request?.request_number), sr.json?.service_request?.request_number);
  const srId = sr.json?.service_request?.id;

  const assignedTechId = techs.json?.technicians?.[0]?.id;
  let readyForWorkOrder = Boolean(srId && assignedTechId);
  for (const status of ['SUBMITTED', 'VALIDATING', 'PENDING_APPROVAL', 'APPROVED', 'ASSIGNED']) {
    const body = status === 'ASSIGNED' ? { status, technician_id: assignedTechId } : { status };
    const transition = await api('POST', `/api/service-requests/${srId}/transition`, body);
    const passed = transition.status === 200;
    check(`POST /api/service-requests/:id/transition → ${status}`, passed, `status ${transition.status}`);
    readyForWorkOrder = readyForWorkOrder && passed;
    if (!passed) break;
  }

  const list = await api('GET', '/api/service-requests?limit=2&page=1');
  check('GET /api/service-requests (pagination meta)', list.status === 200 && !!list.json?.meta, `total ${list.json?.meta?.total}`);

  const wo = readyForWorkOrder ? await api('POST', '/api/work-orders', {
    service_request_id: srId,
    technician_id: assignedTechId,
    description: 'Replace hydraulic seal kit',
    estimated_hours: 3,
  }) : { status: 424, json: {} };
  check('POST /api/work-orders', wo.status === 201, wo.json?.work_order?.order_number ?? 'requires successful assignment');

  const parts = await api('GET', `/api/spare-parts?site_id=${siteA?.id ?? ''}`);
  const hs = parts.json?.spare_parts?.find((p: any) => p.part_number === 'HS-100');
  if (hs && wo.json?.work_order?.id) {
    const reserve = await api('POST', `/api/spare-parts/${hs.id}/reserve`, { work_order_id: wo.json.work_order.id, quantity: 1 });
    check('POST /api/spare-parts/:id/reserve', reserve.status === 201, `reserved ${reserve.json?.reservation?.quantity}`);
  } else {
    check('POST /api/spare-parts/:id/reserve', false, 'no part/work-order to reserve against');
  }

  for (const r of ['dashboard', 'sla', 'mttr', 'utilization', 'parts-rebalance']) {
    const rep = await api('GET', `/api/reports/${r}`);
    check(`GET /api/reports/${r}`, rep.status === 200);
  }

  const notes = await api('GET', '/api/notifications');
  check('GET /api/notifications', notes.status === 200, `${notes.json?.notifications?.length ?? 0} notifications`);
  const unread = await api('GET', '/api/notifications/unread-count');
  check('GET /api/notifications/unread-count', unread.status === 200, `unread ${unread.json?.unread_count}`);

  finish();
}

function finish() {
  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('\n❌ Smoke crashed:', e?.message ?? e);
  console.error('   Is the server running (`npm run dev`) and the DB seeded (`npm run seed`)?');
  process.exit(1);
});
