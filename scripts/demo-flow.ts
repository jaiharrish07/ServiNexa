/**
 * Demo flow — drives the full happy-path through the live API so a judge can
 * watch the whole lifecycle (NLP intake → AI classify → workflow → AI match →
 * assign → AI predict → dashboard → audit verify) in one command.
 *
 * Prereqs: server running on PORT (default 3001) and `npm run seed` already run.
 * Run from the repo root: `npm run demo`
 */
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3001;
const API = `http://localhost:${PORT}/api`;
let token = '';

async function api(method: string, path: string, body?: any): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: `Non-JSON response (${res.status}): ${text.slice(0, 120)}` };
  }
  if (!res.ok) {
    console.warn(`  ⚠ ${method} ${path} → ${res.status}: ${json.error || 'error'}`);
  }
  return json;
}

async function demo() {
  console.log('\n=== DQBH / ServiNexa DEMO FLOW ===\n');

  // 1. Login as customer
  console.log('1. Customer submits an NLP request...');
  const loginRes = await api('POST', '/auth/login', {
    email: 'customer@dqbh.com',
    password: 'Cust123!',
  });
  token = loginRes.token;
  if (!token) throw new Error('Customer login failed — did you run `npm run seed`?');

  const machinesRes = await api('GET', '/machines');
  const m104 = machinesRes.machines?.find((m: any) => m.code === 'M-104');
  if (!m104) throw new Error('Machine M-104 not found — seed the database first.');

  // 2. Create service request with NLP description
  const srRes = await api('POST', '/service-requests', {
    site_id: m104.site_id,
    machine_id: m104.id,
    title: 'Hydraulic leak on CNC Mill',
    description:
      'The hydraulic system on CNC Mill M-104 is leaking fluid near the main cylinder. ' +
      'Pressure is dropping and the machine is making unusual grinding noises during operation.',
    raw_input: 'The hydraulic system on CNC Mill M-104 is leaking fluid near the main cylinder.',
  });
  const sr = srRes.service_request;
  console.log(`   Created: ${sr?.request_number}`);

  // 3. AI classifies the request
  console.log('\n2. AI classifies the request...');
  const classifyRes = await api('POST', '/ai/classify', { description: sr.description });
  console.log(
    `   Category: ${classifyRes.category} | Priority: ${classifyRes.priority} | Source: ${classifyRes.source}`
  );
  await api('PATCH', `/service-requests/${sr.id}`, {
    category: classifyRes.category,
    priority: classifyRes.priority,
    ai_confidence: classifyRes.confidence,
  });

  // 4. Ops manager advances the workflow
  const opsLogin = await api('POST', '/auth/login', { email: 'ops@dqbh.com', password: 'Ops123!' });
  token = opsLogin.token;

  console.log('\n3. Ops manager advances the workflow...');
  for (const status of ['SUBMITTED', 'VALIDATING', 'PENDING_APPROVAL', 'APPROVED']) {
    await api('POST', `/service-requests/${sr.id}/transition`, { status });
    console.log(`   → ${status}`);
  }

  // 5. AI matches the best technician
  console.log('\n4. AI matches the best technician...');
  const matchRes = await api('POST', '/ai/match', { service_request_id: sr.id });
  const topTech = matchRes.ranked_technicians?.[0];
  console.log(
    `   Top match: ${topTech?.technician_id} (score ${topTech?.score}) | Source: ${matchRes.source}`
  );

  // 6. Assign
  if (topTech) {
    await api('POST', `/service-requests/${sr.id}/transition`, {
      status: 'ASSIGNED',
      technician_id: topTech.technician_id,
    });
    console.log('   → ASSIGNED');
  }

  // 7. Predictive maintenance on M-104
  console.log('\n5. AI predicts machine health...');
  const predictRes = await api('POST', '/ai/predict', { machine_id: m104.id });
  console.log(
    `   Risk: ${predictRes.risk_level} (${((predictRes.failure_probability || 0) * 100).toFixed(
      1
    )}%) | Source: ${predictRes.source}`
  );

  // 8. Dashboard stats
  console.log('\n6. Dashboard stats...');
  const dashRes = await api('GET', '/reports/dashboard');
  if (dashRes.dashboard) {
    console.log(`   Active SRs: ${dashRes.dashboard.service_requests?.active}`);
    console.log(`   Machines: ${JSON.stringify(dashRes.dashboard.machines?.by_status)}`);
    console.log(
      `   Technicians available: ${dashRes.dashboard.technicians?.available}/${dashRes.dashboard.technicians?.total}`
    );
  }

  // 9. Verify the audit chain (admin)
  const adminLogin = await api('POST', '/auth/login', {
    email: 'admin@dqbh.com',
    password: 'Admin123!',
  });
  token = adminLogin.token;

  console.log('\n7. Audit chain verification...');
  const auditRes = await api('GET', '/audit/verify');
  console.log(`   ${auditRes.message}`);

  console.log('\n=== DEMO COMPLETE ===\n');
}

demo().catch((err) => {
  console.error('❌ Demo failed:', err?.message || err);
  process.exit(1);
});
