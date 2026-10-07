/**
 * Idempotent demo seed. Runs against a LIVE Supabase (needs real credentials in .env —
 * Jai provides them). Re-runnable: uses upsert + tolerates already-registered auth users.
 *
 *   npm run seed
 */
import { supabase } from '../src/config/supabase';
import { env } from '../src/config/env';

function assertRealCredentials() {
  const placeholders = /localhost|your-|xxxxx|placeholder|example/i;
  if (
    placeholders.test(env.SUPABASE_URL) ||
    placeholders.test(env.SUPABASE_ANON_KEY) ||
    placeholders.test(env.SUPABASE_SERVICE_KEY)
  ) {
    console.error(
      '\n❌ Supabase credentials look like placeholders.\n' +
        '   Add real SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_KEY values to .env,\n' +
        '   make sure the schema has been applied, then re-run `npm run seed`.\n',
    );
    process.exit(1);
  }
}

const USERS = [
  { email: 'admin@dqbh.com', password: 'Admin123!', full_name: 'Sarah Admin', role: 'ADMIN' },
  { email: 'ops@dqbh.com', password: 'Ops123!', full_name: 'Mike Operations', role: 'OPS_MANAGER' },
  { email: 'alex.chen@dqbh.com', password: 'Tech123!', full_name: 'Alex Chen', role: 'TECHNICIAN' },
  { email: 'maria.santos@dqbh.com', password: 'Tech123!', full_name: 'Maria Santos', role: 'TECHNICIAN' },
  { email: 'james.wilson@dqbh.com', password: 'Tech123!', full_name: 'James Wilson', role: 'TECHNICIAN' },
  { email: 'customer@dqbh.com', password: 'Cust123!', full_name: 'David Customer', role: 'CUSTOMER' },
];

async function seed() {
  assertRealCredentials();
  console.log('🌱 Seeding DQBH database...\n');

  // 1. Users (auth + profile)
  const profiles: any[] = [];
  for (const u of USERS) {
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });
    if (authErr || !authData?.user) {
      const { data: existing } = await supabase.from('users').select('*').eq('email', u.email).single();
      if (existing) {
        profiles.push(existing);
        console.log(`   • ${u.full_name} (${u.role}) — already existed`);
        continue;
      }
      console.log(`   ⚠ could not create ${u.email}: ${authErr?.message}`);
      continue;
    }
    const { data: profile } = await supabase
      .from('users')
      .upsert({ auth_id: authData.user.id, email: u.email, full_name: u.full_name, role: u.role }, { onConflict: 'email' })
      .select()
      .single();
    if (profile) profiles.push(profile);
    console.log(`   ✓ ${u.full_name} (${u.role})`);
  }

  // 2. Sites
  const { data: sites } = await supabase
    .from('sites')
    .upsert(
      [
        { name: 'Main Manufacturing Plant', code: 'SITE-A', address: '100 Industrial Blvd', city: 'Detroit', state: 'MI', country: 'US', lat: 42.3314, lng: -83.0458 },
        { name: 'Secondary Assembly Facility', code: 'SITE-B', address: '250 Factory Lane', city: 'Toledo', state: 'OH', country: 'US', lat: 41.6528, lng: -83.5379 },
      ],
      { onConflict: 'code' },
    )
    .select();
  const siteA = sites?.find((s: any) => s.code === 'SITE-A');
  const siteB = sites?.find((s: any) => s.code === 'SITE-B');
  console.log(`   ✓ Sites: ${sites?.length ?? 0}`);

  // 3. Machines
  const { data: machines } = await supabase
    .from('machines')
    .upsert(
      [
        { site_id: siteA!.id, name: 'CNC Milling Machine', code: 'M-104', type: 'CNC Mill', manufacturer: 'Haas', model: 'VF-2', status: 'DEGRADED', criticality: 'HIGH', air_temp: 25.5, process_temp: 38.2, rotational_speed: 1480, torque: 55.3, tool_wear: 210 },
        { site_id: siteA!.id, name: 'Hydraulic Press', code: 'M-200', type: 'Press', manufacturer: 'Schuler', model: 'HPX-400', status: 'OPERATIONAL', criticality: 'MEDIUM', air_temp: 23.0, process_temp: 30.1, rotational_speed: 1500, torque: 35.0, tool_wear: 50 },
        { site_id: siteB!.id, name: 'Robotic Welding Arm', code: 'M-300', type: 'Welding Robot', manufacturer: 'FANUC', model: 'ARC Mate 120iD', status: 'OPERATIONAL', criticality: 'HIGH', air_temp: 27.0, process_temp: 45.0, rotational_speed: 2100, torque: 42.0, tool_wear: 120 },
      ],
      { onConflict: 'code' },
    )
    .select();
  console.log(`   ✓ Machines: ${machines?.length ?? 0}`);

  // 3b. Machine model components (3D diagnosis catalog)
  const componentCatalog = [
    // CNC Mill components
    { machine_type: 'CNC Mill', component_id: 'spindle', component_name: 'Main Spindle', coord_x: 0, coord_y: 0.6, coord_z: 0, highlight_color: '#ef4444' },
    { machine_type: 'CNC Mill', component_id: 'motor', component_name: 'Drive Motor', coord_x: -0.9, coord_y: 0, coord_z: 0, highlight_color: '#ef4444' },
    { machine_type: 'CNC Mill', component_id: 'gearbox', component_name: 'Gearbox Assembly', coord_x: -0.4, coord_y: 0, coord_z: 0, highlight_color: '#f97316' },
    { machine_type: 'CNC Mill', component_id: 'bearing', component_name: 'Main Bearing', coord_x: 0, coord_y: 0.3, coord_z: 0.5, highlight_color: '#ef4444' },
    { machine_type: 'CNC Mill', component_id: 'coolant_system', component_name: 'Coolant System', coord_x: 0.8, coord_y: -0.3, coord_z: 0.5, highlight_color: '#3b82f6' },
    { machine_type: 'CNC Mill', component_id: 'control_board', component_name: 'CNC Control Board', coord_x: 0.9, coord_y: 0.5, coord_z: -0.5, highlight_color: '#8b5cf6' },
    { machine_type: 'CNC Mill', component_id: 'sensor_array', component_name: 'Sensor Array', coord_x: 0.4, coord_y: 0.8, coord_z: 0.3, highlight_color: '#06b6d4' },
    { machine_type: 'CNC Mill', component_id: 'belt', component_name: 'Drive Belt', coord_x: -0.6, coord_y: 0.3, coord_z: 0.4, highlight_color: '#f59e0b' },
    // Press components
    { machine_type: 'Press', component_id: 'hydraulic_pump', component_name: 'Hydraulic Pump', coord_x: -0.7, coord_y: -0.3, coord_z: 0, highlight_color: '#ef4444' },
    { machine_type: 'Press', component_id: 'hydraulic_cylinder', component_name: 'Hydraulic Cylinder', coord_x: 0, coord_y: 0.5, coord_z: 0, highlight_color: '#ef4444' },
    { machine_type: 'Press', component_id: 'motor', component_name: 'Electric Motor', coord_x: -0.9, coord_y: 0, coord_z: 0, highlight_color: '#f97316' },
    { machine_type: 'Press', component_id: 'control_board', component_name: 'PLC Controller', coord_x: 0.9, coord_y: 0.4, coord_z: -0.5, highlight_color: '#8b5cf6' },
    { machine_type: 'Press', component_id: 'sensor_array', component_name: 'Pressure Sensors', coord_x: 0.3, coord_y: 0.7, coord_z: 0.3, highlight_color: '#06b6d4' },
    { machine_type: 'Press', component_id: 'bearing', component_name: 'Guide Bearing', coord_x: 0.4, coord_y: 0, coord_z: 0.5, highlight_color: '#ef4444' },
    // Welding Robot components
    { machine_type: 'Welding Robot', component_id: 'motor', component_name: 'Servo Motor', coord_x: 0, coord_y: 0.5, coord_z: 0, highlight_color: '#ef4444' },
    { machine_type: 'Welding Robot', component_id: 'gearbox', component_name: 'Joint Gearbox', coord_x: 0.3, coord_y: 0.3, coord_z: 0.3, highlight_color: '#f97316' },
    { machine_type: 'Welding Robot', component_id: 'wiring_harness', component_name: 'Wiring Harness', coord_x: -0.5, coord_y: 0.2, coord_z: 0.3, highlight_color: '#f59e0b' },
    { machine_type: 'Welding Robot', component_id: 'control_board', component_name: 'Robot Controller', coord_x: -0.8, coord_y: -0.2, coord_z: -0.5, highlight_color: '#8b5cf6' },
    { machine_type: 'Welding Robot', component_id: 'sensor_array', component_name: 'Torch Sensors', coord_x: 0.6, coord_y: 0.6, coord_z: 0, highlight_color: '#06b6d4' },
    { machine_type: 'Welding Robot', component_id: 'bearing', component_name: 'Axis Bearing', coord_x: 0, coord_y: 0, coord_z: 0.5, highlight_color: '#ef4444' },
  ];
  const { data: components } = await supabase
    .from('machine_model_components')
    .upsert(componentCatalog, { onConflict: 'machine_type,component_id' })
    .select();
  console.log(`   ✓ Machine model components: ${components?.length ?? 0}`);

  // 4. Technicians (linked to the 3 technician users)
  const alex = profiles.find((p) => p.full_name === 'Alex Chen');
  const maria = profiles.find((p) => p.full_name === 'Maria Santos');
  const james = profiles.find((p) => p.full_name === 'James Wilson');
  if (alex && maria && james) {
    const { data: techs } = await supabase
      .from('technicians')
      .upsert(
        [
          { user_id: alex.id, site_id: siteA!.id, employee_code: 'T-001', specializations: ['hydraulic', 'mechanical', 'cnc'], certifications: ['hydraulic_systems_cert', 'cnc_advanced'], max_concurrent_jobs: 3, current_job_count: 1, avg_resolution_hours: 3.2, rating: 4.8, is_available: true },
          { user_id: maria.id, site_id: siteA!.id, employee_code: 'T-002', specializations: ['electrical', 'plc', 'calibration'], certifications: ['electrical_systems_cert', 'plc_programming'], max_concurrent_jobs: 3, current_job_count: 2, avg_resolution_hours: 4.1, rating: 4.5, is_available: true },
          { user_id: james.id, site_id: siteB!.id, employee_code: 'T-003', specializations: ['welding', 'mechanical', 'pneumatic'], certifications: ['welding_cert', 'safety_officer'], max_concurrent_jobs: 4, current_job_count: 0, avg_resolution_hours: 5.0, rating: 4.2, is_available: true },
        ],
        { onConflict: 'employee_code' },
      )
      .select();
    console.log(`   ✓ Technicians: ${techs?.length ?? 0}`);
  } else {
    console.log('   ⚠ Skipped technicians (technician user profiles missing)');
  }

  // 5. Spare parts (SITE-B HS-100 deliberately in deficit → parts-rebalance has a suggestion)
  const { data: parts } = await supabase
    .from('spare_parts')
    .upsert(
      [
        { site_id: siteA!.id, name: 'Hydraulic Seal Kit', part_number: 'HS-100', category: 'hydraulic', quantity_available: 15, reorder_level: 5, unit_cost: 45.0 },
        { site_id: siteA!.id, name: 'CNC Tool Insert', part_number: 'CT-200', category: 'tooling', quantity_available: 30, reorder_level: 10, unit_cost: 22.5 },
        { site_id: siteA!.id, name: 'Motor Bearing 6205', part_number: 'MB-300', category: 'mechanical', quantity_available: 8, reorder_level: 5, unit_cost: 35.0 },
        { site_id: siteB!.id, name: 'Hydraulic Seal Kit', part_number: 'HS-100', category: 'hydraulic', quantity_available: 3, reorder_level: 5, unit_cost: 45.0 },
        { site_id: siteB!.id, name: 'Welding Wire Spool', part_number: 'WW-400', category: 'welding', quantity_available: 20, reorder_level: 5, unit_cost: 85.0 },
      ],
      { onConflict: 'site_id,part_number' },
    )
    .select();
  console.log(`   ✓ Spare parts: ${parts?.length ?? 0}`);

  // 6. Service Requests across various statuses (requires machines + profiles)
  const cncMill = machines?.find((m: any) => m.code === 'M-104');
  const press = machines?.find((m: any) => m.code === 'M-200');
  const weldBot = machines?.find((m: any) => m.code === 'M-300');
  const customer = profiles.find((p) => p.full_name === 'David Customer');
  const ops = profiles.find((p) => p.full_name === 'Mike Operations');
  const alexTech = profiles.find((p) => p.full_name === 'Alex Chen');

  if (customer && ops && cncMill && press && weldBot) {
    const { data: techs } = await supabase.from('technicians').select('id, user_id').limit(3);
    const alexT = techs?.find((t: any) => t.user_id === alexTech?.id);

    const srRows = [
      { request_number: 'SR-2024-001', title: 'CNC spindle vibration detected', description: 'Abnormal vibration at 1480 RPM causing surface finish defects on batch P-2024', machine_id: cncMill.id, requester_id: customer.id, category: 'MECHANICAL', priority: 'HIGH', status: 'IN_PROGRESS', assigned_technician_id: alexT?.id ?? null, assigned_at: new Date(Date.now() - 2 * 86400000).toISOString(), started_at: new Date(Date.now() - 86400000).toISOString(), sla_deadline: new Date(Date.now() + 6 * 3600000).toISOString() },
      { request_number: 'SR-2024-002', title: 'Hydraulic press pressure drop', description: 'Gradual pressure loss observed, cycle time increasing by 15%', machine_id: press.id, requester_id: customer.id, category: 'HYDRAULIC', priority: 'MEDIUM', status: 'SUBMITTED', sla_deadline: new Date(Date.now() + 20 * 3600000).toISOString() },
      { request_number: 'SR-2024-003', title: 'Welding robot arc instability', description: 'Intermittent arc breaks during MIG welding cycle, weld bead irregular', machine_id: weldBot.id, requester_id: customer.id, category: 'ELECTRICAL', priority: 'CRITICAL', status: 'APPROVED', approved_by: ops.id, approved_at: new Date(Date.now() - 3600000).toISOString(), sla_deadline: new Date(Date.now() + 2 * 3600000).toISOString() },
      { request_number: 'SR-2024-004', title: 'CNC coolant system maintenance', description: 'Scheduled preventive maintenance for coolant filtration system', machine_id: cncMill.id, requester_id: customer.id, category: 'PREVENTIVE', priority: 'LOW', status: 'CLOSED', assigned_technician_id: alexT?.id ?? null, completed_at: new Date(Date.now() - 5 * 86400000).toISOString(), verified_at: new Date(Date.now() - 4 * 86400000).toISOString(), closed_at: new Date(Date.now() - 3 * 86400000).toISOString(), resolution_notes: 'Replaced coolant filter cartridge, flushed and refilled 40L of cutting fluid. System pressure restored to nominal.' },
      { request_number: 'SR-2024-005', title: 'Press safety sensor calibration', description: 'Light curtain sensors triggering false positives, causing unplanned stops', machine_id: press.id, requester_id: customer.id, category: 'CALIBRATION', priority: 'HIGH', status: 'COMPLETED', assigned_technician_id: alexT?.id ?? null, completed_at: new Date(Date.now() - 86400000).toISOString(), resolution_notes: 'Recalibrated light curtain alignment, cleaned optical sensors, updated safety controller firmware to v3.2.1.' },
    ];
    const { data: srs } = await supabase
      .from('service_requests')
      .upsert(srRows, { onConflict: 'request_number' })
      .select();
    console.log(`   ✓ Service requests: ${srs?.length ?? 0}`);

    // 7. Machine dependencies (for cascading impact analysis)
    const depRows = [
      { machine_id: press.id, depends_on_machine_id: cncMill.id, dependency_type: 'DIRECT', impact_weight: 0.85, throughput_rate: 120, unit_value: 450, buffer_hours: 4, production_line: 'Line A' },
      { machine_id: weldBot.id, depends_on_machine_id: press.id, dependency_type: 'DIRECT', impact_weight: 0.70, throughput_rate: 80, unit_value: 1200, buffer_hours: 2, production_line: 'Line A' },
    ];
    const { data: deps } = await supabase
      .from('machine_dependencies')
      .upsert(depRows, { onConflict: 'machine_id,depends_on_machine_id' })
      .select();
    console.log(`   ✓ Machine dependencies: ${deps?.length ?? 0}`);

    // 8. Production orders (open orders at risk from downtime)
    const prodRows = [
      { order_code: 'PO-2024-A1', machine_id: cncMill.id, quantity: 500, unit_value: 450, deadline: new Date(Date.now() + 3 * 86400000).toISOString(), sla_penalty: 25000, status: 'IN_PROGRESS' },
      { order_code: 'PO-2024-A2', machine_id: press.id, quantity: 200, unit_value: 1200, deadline: new Date(Date.now() + 5 * 86400000).toISOString(), sla_penalty: 50000, status: 'OPEN' },
      { order_code: 'PO-2024-B1', machine_id: weldBot.id, quantity: 100, unit_value: 3500, deadline: new Date(Date.now() + 7 * 86400000).toISOString(), sla_penalty: 75000, status: 'OPEN' },
    ];
    const { data: prods } = await supabase
      .from('production_orders')
      .upsert(prodRows, { onConflict: 'order_code' })
      .select();
    console.log(`   ✓ Production orders: ${prods?.length ?? 0}`);

    // 9. Knowledge base entries (from past resolved cases)
    const kbRows = [
      { machine_type: 'CNC Mill', category: 'MECHANICAL', sub_category: 'bearing_wear', problem_description: 'Excessive vibration at high RPM caused by worn main spindle bearings', solution_applied: 'Replaced main spindle bearings (SKF 7210 BECBP) and realigned spindle assembly. Applied precision torque spec 45Nm.', parts_used: [{ part_number: 'MB-300', quantity: 2 }], resolution_hours: 6.5, cost: 850, effectiveness_rating: 5, success_flag: true, tags: ['vibration', 'spindle', 'bearing', 'cnc'] },
      { machine_type: 'CNC Mill', category: 'MECHANICAL', sub_category: 'belt_wear', problem_description: 'Drive belt slipping under load causing inconsistent feed rate', solution_applied: 'Replaced drive belt and adjusted tensioner. Checked motor alignment with laser tool.', parts_used: [{ part_number: 'CT-200', quantity: 1 }], resolution_hours: 2.0, cost: 180, effectiveness_rating: 4, success_flag: true, tags: ['belt', 'drive', 'feed-rate'] },
      { machine_type: 'Press', category: 'HYDRAULIC', sub_category: 'seal_failure', problem_description: 'Hydraulic cylinder seal degradation causing pressure drop and oil leak', solution_applied: 'Replaced complete seal kit on main cylinder, flushed hydraulic system, refilled with ISO VG 46.', parts_used: [{ part_number: 'HS-100', quantity: 1 }], resolution_hours: 4.0, cost: 520, effectiveness_rating: 5, success_flag: true, tags: ['hydraulic', 'seal', 'pressure', 'leak'] },
      { machine_type: 'Welding Robot', category: 'ELECTRICAL', sub_category: 'wiring_fault', problem_description: 'Intermittent arc breaks during welding cycle traced to damaged torch cable', solution_applied: 'Replaced torch cable assembly and reterminated connectors. Tested arc stability across full range.', parts_used: [{ part_number: 'WW-400', quantity: 1 }], resolution_hours: 3.5, cost: 620, effectiveness_rating: 4, success_flag: true, tags: ['arc', 'welding', 'cable', 'torch'] },
    ];
    const { data: kb } = await supabase
      .from('knowledge_entries')
      .upsert(kbRows, { onConflict: 'id' })
      .select();
    console.log(`   ✓ Knowledge entries: ${kb?.length ?? 0}`);
  } else {
    console.log('   ⚠ Skipped enriched seed data (prerequisite profiles/machines missing)');
  }

  console.log('\n✅ Seed complete.\n\nDemo accounts:');
  console.log('   Admin:      admin@dqbh.com    / Admin123!');
  console.log('   Ops Mgr:    ops@dqbh.com      / Ops123!');
  console.log('   Technician: alex.chen@dqbh.com / Tech123!');
  console.log('   Customer:   customer@dqbh.com / Cust123!\n');
}

seed().catch((e) => {
  console.error('\n❌ Seed failed:', e?.message ?? e);
  process.exit(1);
});
