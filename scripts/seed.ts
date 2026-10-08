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
  { email: 'admin@servinexa.in', password: 'Admin123!', full_name: 'Rajesh Kumar', role: 'ADMIN' },
  { email: 'ops@servinexa.in', password: 'Ops123!', full_name: 'Priya Sharma', role: 'OPS_MANAGER' },
  { email: 'vikram.singh@servinexa.in', password: 'Tech123!', full_name: 'Vikram Singh', role: 'TECHNICIAN' },
  { email: 'ananya.patel@servinexa.in', password: 'Tech123!', full_name: 'Ananya Patel', role: 'TECHNICIAN' },
  { email: 'suresh.reddy@servinexa.in', password: 'Tech123!', full_name: 'Suresh Reddy', role: 'TECHNICIAN' },
  { email: 'deepak.nair@servinexa.in', password: 'Tech123!', full_name: 'Deepak Nair', role: 'TECHNICIAN' },
  { email: 'customer@servinexa.in', password: 'Cust123!', full_name: 'Arjun Mehta', role: 'CUSTOMER' },
  { email: 'kavitha.iyer@servinexa.in', password: 'Cust123!', full_name: 'Kavitha Iyer', role: 'CUSTOMER' },
];

async function seed() {
  assertRealCredentials();
  console.log('🌱 Seeding ServiNexa database (India)...\n');

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

  // 2. Sites — Indian manufacturing hubs
  const { data: sites } = await supabase
    .from('sites')
    .upsert(
      [
        { name: 'Chennai Manufacturing Hub', code: 'SITE-CHN', address: '42 SIPCOT Industrial Park, Sriperumbudur', city: 'Chennai', state: 'Tamil Nadu', country: 'IN', lat: 12.9716, lng: 80.1514, timezone: 'Asia/Kolkata' },
        { name: 'Pune Precision Works', code: 'SITE-PUN', address: '18 Hinjewadi IT Park Phase III', city: 'Pune', state: 'Maharashtra', country: 'IN', lat: 18.5204, lng: 73.8567, timezone: 'Asia/Kolkata' },
        { name: 'Bengaluru Automation Centre', code: 'SITE-BLR', address: '7 Peenya Industrial Area, 2nd Stage', city: 'Bengaluru', state: 'Karnataka', country: 'IN', lat: 13.0299, lng: 77.5182, timezone: 'Asia/Kolkata' },
      ],
      { onConflict: 'code' },
    )
    .select();
  const siteCHN = sites?.find((s: any) => s.code === 'SITE-CHN');
  const sitePUN = sites?.find((s: any) => s.code === 'SITE-PUN');
  const siteBLR = sites?.find((s: any) => s.code === 'SITE-BLR');
  console.log(`   ✓ Sites: ${sites?.length ?? 0}`);

  // 3. Machines — 6 machines across 3 sites
  const { data: machines } = await supabase
    .from('machines')
    .upsert(
      [
        { site_id: siteCHN!.id, name: 'CNC Milling Machine', code: 'M-101', type: 'CNC Mill', manufacturer: 'BFW', model: 'BMV 45 T20', status: 'DEGRADED', criticality: 'HIGH', air_temp: 30.5, process_temp: 42.1, rotational_speed: 1480, torque: 55.3, tool_wear: 210 },
        { site_id: siteCHN!.id, name: 'Hydraulic Press 200T', code: 'M-102', type: 'Press', manufacturer: 'Jaya Hind', model: 'JH-200T', status: 'OPERATIONAL', criticality: 'MEDIUM', air_temp: 29.0, process_temp: 35.6, rotational_speed: 1500, torque: 35.0, tool_wear: 50 },
        { site_id: sitePUN!.id, name: 'Robotic Welding Arm', code: 'M-201', type: 'Welding Robot', manufacturer: 'FANUC', model: 'ARC Mate 120iD', status: 'OPERATIONAL', criticality: 'HIGH', air_temp: 28.0, process_temp: 45.0, rotational_speed: 2100, torque: 42.0, tool_wear: 120 },
        { site_id: sitePUN!.id, name: 'CNC Lathe', code: 'M-202', type: 'CNC Lathe', manufacturer: 'Ace Designers', model: 'Jobber XL', status: 'OPERATIONAL', criticality: 'MEDIUM', air_temp: 27.5, process_temp: 38.0, rotational_speed: 2200, torque: 30.0, tool_wear: 80 },
        { site_id: siteBLR!.id, name: 'Injection Moulding Machine', code: 'M-301', type: 'Injection Moulder', manufacturer: 'L&T Plastics', model: 'eN-180', status: 'DOWN', criticality: 'CRITICAL', air_temp: 31.0, process_temp: 220.0, rotational_speed: 450, torque: 60.0, tool_wear: 300 },
        { site_id: siteBLR!.id, name: 'Conveyor Assembly Line', code: 'M-302', type: 'Conveyor', manufacturer: 'Rexnord', model: 'FlatTop 7705', status: 'OPERATIONAL', criticality: 'LOW', air_temp: 26.5, process_temp: 28.0, rotational_speed: 60, torque: 12.0, tool_wear: 15 },
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
    // CNC Lathe components
    { machine_type: 'CNC Lathe', component_id: 'spindle', component_name: 'Lathe Spindle', coord_x: 0, coord_y: 0.5, coord_z: 0, highlight_color: '#ef4444' },
    { machine_type: 'CNC Lathe', component_id: 'motor', component_name: 'Spindle Motor', coord_x: -0.8, coord_y: 0, coord_z: 0, highlight_color: '#ef4444' },
    { machine_type: 'CNC Lathe', component_id: 'chuck', component_name: 'Chuck Assembly', coord_x: 0, coord_y: 0.7, coord_z: 0, highlight_color: '#f97316' },
    { machine_type: 'CNC Lathe', component_id: 'turret', component_name: 'Tool Turret', coord_x: 0.5, coord_y: 0.3, coord_z: 0.3, highlight_color: '#3b82f6' },
    { machine_type: 'CNC Lathe', component_id: 'coolant_system', component_name: 'Coolant System', coord_x: 0.7, coord_y: -0.3, coord_z: 0.4, highlight_color: '#3b82f6' },
    { machine_type: 'CNC Lathe', component_id: 'control_board', component_name: 'CNC Controller', coord_x: 0.9, coord_y: 0.5, coord_z: -0.5, highlight_color: '#8b5cf6' },
    // Injection Moulder components
    { machine_type: 'Injection Moulder', component_id: 'barrel', component_name: 'Injection Barrel', coord_x: -0.6, coord_y: 0.2, coord_z: 0, highlight_color: '#ef4444' },
    { machine_type: 'Injection Moulder', component_id: 'screw', component_name: 'Injection Screw', coord_x: -0.3, coord_y: 0.2, coord_z: 0, highlight_color: '#f97316' },
    { machine_type: 'Injection Moulder', component_id: 'heater', component_name: 'Barrel Heater Bands', coord_x: -0.5, coord_y: 0.4, coord_z: 0.3, highlight_color: '#ef4444' },
    { machine_type: 'Injection Moulder', component_id: 'hydraulic_pump', component_name: 'Hydraulic Unit', coord_x: 0.7, coord_y: -0.3, coord_z: 0, highlight_color: '#3b82f6' },
    { machine_type: 'Injection Moulder', component_id: 'control_board', component_name: 'HMI Panel', coord_x: 0.9, coord_y: 0.5, coord_z: -0.5, highlight_color: '#8b5cf6' },
    { machine_type: 'Injection Moulder', component_id: 'mould_clamp', component_name: 'Mould Clamping Unit', coord_x: 0.3, coord_y: 0.5, coord_z: 0, highlight_color: '#f59e0b' },
    // Conveyor components
    { machine_type: 'Conveyor', component_id: 'motor', component_name: 'Drive Motor', coord_x: -0.8, coord_y: 0, coord_z: 0, highlight_color: '#ef4444' },
    { machine_type: 'Conveyor', component_id: 'belt', component_name: 'Conveyor Belt', coord_x: 0, coord_y: 0.1, coord_z: 0, highlight_color: '#f59e0b' },
    { machine_type: 'Conveyor', component_id: 'bearing', component_name: 'Roller Bearing', coord_x: 0.5, coord_y: 0, coord_z: 0.4, highlight_color: '#ef4444' },
    { machine_type: 'Conveyor', component_id: 'sensor_array', component_name: 'Proximity Sensors', coord_x: 0.3, coord_y: 0.3, coord_z: 0.2, highlight_color: '#06b6d4' },
    { machine_type: 'Conveyor', component_id: 'control_board', component_name: 'VFD Controller', coord_x: 0.9, coord_y: 0.4, coord_z: -0.5, highlight_color: '#8b5cf6' },
  ];
  const { data: components } = await supabase
    .from('machine_model_components')
    .upsert(componentCatalog, { onConflict: 'machine_type,component_id' })
    .select();
  console.log(`   ✓ Machine model components: ${components?.length ?? 0}`);

  // 4. Technicians (linked to technician users)
  const vikram = profiles.find((p) => p.full_name === 'Vikram Singh');
  const ananya = profiles.find((p) => p.full_name === 'Ananya Patel');
  const suresh = profiles.find((p) => p.full_name === 'Suresh Reddy');
  const deepak = profiles.find((p) => p.full_name === 'Deepak Nair');
  if (vikram && ananya && suresh && deepak) {
    const { data: techs } = await supabase
      .from('technicians')
      .upsert(
        [
          { user_id: vikram.id, site_id: siteCHN!.id, employee_code: 'T-001', specializations: ['hydraulic', 'mechanical', 'cnc'], certifications: ['hydraulic_systems_cert', 'cnc_advanced', 'iso_9001_auditor'], max_concurrent_jobs: 3, current_job_count: 1, avg_resolution_hours: 3.2, rating: 4.8, is_available: true },
          { user_id: ananya.id, site_id: siteCHN!.id, employee_code: 'T-002', specializations: ['electrical', 'plc', 'calibration', 'instrumentation'], certifications: ['electrical_systems_cert', 'plc_programming', 'scada_certified'], max_concurrent_jobs: 3, current_job_count: 2, avg_resolution_hours: 4.1, rating: 4.5, is_available: true },
          { user_id: suresh.id, site_id: sitePUN!.id, employee_code: 'T-003', specializations: ['welding', 'mechanical', 'pneumatic', 'robotics'], certifications: ['welding_cert', 'safety_officer', 'fanuc_robot_programming'], max_concurrent_jobs: 4, current_job_count: 0, avg_resolution_hours: 5.0, rating: 4.2, is_available: true },
          { user_id: deepak.id, site_id: siteBLR!.id, employee_code: 'T-004', specializations: ['injection_moulding', 'hydraulic', 'electrical'], certifications: ['injection_moulding_cert', 'electrical_systems_cert'], max_concurrent_jobs: 3, current_job_count: 1, avg_resolution_hours: 3.8, rating: 4.6, is_available: true },
        ],
        { onConflict: 'employee_code' },
      )
      .select();
    console.log(`   ✓ Technicians: ${techs?.length ?? 0}`);
  } else {
    console.log('   ⚠ Skipped technicians (technician user profiles missing)');
  }

  // 5. Spare parts — INR pricing across 3 sites
  const { data: parts } = await supabase
    .from('spare_parts')
    .upsert(
      [
        { site_id: siteCHN!.id, name: 'Hydraulic Seal Kit', part_number: 'HS-100', category: 'hydraulic', quantity_available: 15, reorder_level: 5, unit_cost: 3750 },
        { site_id: siteCHN!.id, name: 'CNC Tool Insert (CNMG)', part_number: 'CT-200', category: 'tooling', quantity_available: 30, reorder_level: 10, unit_cost: 1875 },
        { site_id: siteCHN!.id, name: 'Motor Bearing SKF 6205', part_number: 'MB-300', category: 'mechanical', quantity_available: 8, reorder_level: 5, unit_cost: 2920 },
        { site_id: siteCHN!.id, name: 'Coolant Filter Cartridge', part_number: 'CF-110', category: 'consumable', quantity_available: 12, reorder_level: 4, unit_cost: 850 },
        { site_id: sitePUN!.id, name: 'Hydraulic Seal Kit', part_number: 'HS-100', category: 'hydraulic', quantity_available: 3, reorder_level: 5, unit_cost: 3750 },
        { site_id: sitePUN!.id, name: 'Welding Wire Spool (1.2mm)', part_number: 'WW-400', category: 'welding', quantity_available: 20, reorder_level: 5, unit_cost: 7080 },
        { site_id: sitePUN!.id, name: 'Lathe Chuck Jaw Set', part_number: 'LJ-210', category: 'tooling', quantity_available: 6, reorder_level: 3, unit_cost: 4500 },
        { site_id: siteBLR!.id, name: 'Injection Screw Tip', part_number: 'IS-500', category: 'injection_moulding', quantity_available: 4, reorder_level: 2, unit_cost: 18500 },
        { site_id: siteBLR!.id, name: 'Heater Band 40mm', part_number: 'HB-510', category: 'heating', quantity_available: 10, reorder_level: 4, unit_cost: 2200 },
        { site_id: siteBLR!.id, name: 'Conveyor Belt Segment (1m)', part_number: 'CB-600', category: 'conveyor', quantity_available: 8, reorder_level: 3, unit_cost: 5600 },
        { site_id: siteBLR!.id, name: 'Proximity Sensor (Inductive)', part_number: 'PS-610', category: 'electrical', quantity_available: 15, reorder_level: 5, unit_cost: 1450 },
      ],
      { onConflict: 'site_id,part_number' },
    )
    .select();
  console.log(`   ✓ Spare parts: ${parts?.length ?? 0}`);

  // 6. Service Requests — 10 SRs across various statuses and machines
  const cncMill = machines?.find((m: any) => m.code === 'M-101');
  const press = machines?.find((m: any) => m.code === 'M-102');
  const weldBot = machines?.find((m: any) => m.code === 'M-201');
  const lathe = machines?.find((m: any) => m.code === 'M-202');
  const moulder = machines?.find((m: any) => m.code === 'M-301');
  const conveyor = machines?.find((m: any) => m.code === 'M-302');
  const customer1 = profiles.find((p) => p.full_name === 'Arjun Mehta');
  const customer2 = profiles.find((p) => p.full_name === 'Kavitha Iyer');
  const ops = profiles.find((p) => p.full_name === 'Priya Sharma');
  const vikramProfile = profiles.find((p) => p.full_name === 'Vikram Singh');

  if (customer1 && ops && cncMill && press && weldBot && lathe && moulder && conveyor) {
    const { data: techs } = await supabase.from('technicians').select('id, user_id').limit(4);
    const vikramT = techs?.find((t: any) => t.user_id === vikramProfile?.id);
    const deepakT = techs?.find((t: any) => t.user_id === deepak?.id);

    const srRows = [
      { request_number: 'SR-2026-001', title: 'CNC spindle vibration at high RPM', description: 'Abnormal vibration detected at 1480 RPM on BFW BMV 45 causing surface finish defects on batch P-2026-CHN. Chatter marks visible on aluminium housing components.', machine_id: cncMill.id, requester_id: customer1.id, category: 'MECHANICAL', priority: 'HIGH', status: 'IN_PROGRESS', assigned_technician_id: vikramT?.id ?? null, assigned_at: new Date(Date.now() - 2 * 86400000).toISOString(), started_at: new Date(Date.now() - 86400000).toISOString(), sla_deadline: new Date(Date.now() + 6 * 3600000).toISOString() },
      { request_number: 'SR-2026-002', title: 'Hydraulic press pressure loss', description: 'Gradual pressure drop from 180 bar to 145 bar observed on JH-200T. Cycle time increasing by 15%. Oil traces found near main cylinder base.', machine_id: press.id, requester_id: customer1.id, category: 'HYDRAULIC', priority: 'MEDIUM', status: 'SUBMITTED', sla_deadline: new Date(Date.now() + 20 * 3600000).toISOString() },
      { request_number: 'SR-2026-003', title: 'Welding robot arc instability', description: 'Intermittent arc breaks during MIG welding on chassis sub-assembly. Weld bead irregular, affecting joint strength on load-bearing brackets.', machine_id: weldBot.id, requester_id: customer1.id, category: 'ELECTRICAL', priority: 'CRITICAL', status: 'APPROVED', approved_by: ops.id, approved_at: new Date(Date.now() - 3600000).toISOString(), sla_deadline: new Date(Date.now() + 2 * 3600000).toISOString() },
      { request_number: 'SR-2026-004', title: 'CNC coolant system PM', description: 'Scheduled preventive maintenance for BFW coolant filtration system. Quarterly filter replacement and fluid check per SOP-CHN-044.', machine_id: cncMill.id, requester_id: customer1.id, category: 'PREVENTIVE', priority: 'LOW', status: 'CLOSED', assigned_technician_id: vikramT?.id ?? null, completed_at: new Date(Date.now() - 5 * 86400000).toISOString(), verified_at: new Date(Date.now() - 4 * 86400000).toISOString(), closed_at: new Date(Date.now() - 3 * 86400000).toISOString(), resolution_notes: 'Replaced coolant filter cartridge, flushed and refilled 40L of Castrol Alusol cutting fluid. System pressure restored to nominal 4.2 bar.' },
      { request_number: 'SR-2026-005', title: 'Press safety sensor calibration', description: 'Light curtain sensors on Jaya Hind 200T triggering false positives during stamping cycle, causing 3-4 unplanned stops per shift.', machine_id: press.id, requester_id: (customer2 ?? customer1).id, category: 'CALIBRATION', priority: 'HIGH', status: 'COMPLETED', assigned_technician_id: vikramT?.id ?? null, completed_at: new Date(Date.now() - 86400000).toISOString(), resolution_notes: 'Recalibrated light curtain alignment using laser jig, cleaned optical sensors, updated safety controller firmware to v3.2.1. False positive rate reduced to zero over 200 test cycles.' },
      { request_number: 'SR-2026-006', title: 'Injection moulder barrel overheating', description: 'Zone 3 heater band on eN-180 showing 248°C against setpoint of 220°C. Material degradation risk — burn marks visible on moulded parts from cavity 2.', machine_id: moulder.id, requester_id: (customer2 ?? customer1).id, category: 'ELECTRICAL', priority: 'CRITICAL', status: 'IN_PROGRESS', assigned_technician_id: deepakT?.id ?? null, assigned_at: new Date(Date.now() - 4 * 3600000).toISOString(), started_at: new Date(Date.now() - 2 * 3600000).toISOString(), sla_deadline: new Date(Date.now() + 3 * 3600000).toISOString() },
      { request_number: 'SR-2026-007', title: 'CNC lathe tool turret indexing failure', description: 'Ace Designers Jobber XL tool turret failing to index to position T04. Turret motor drawing 12A versus normal 6A. Suspected gear tooth damage.', machine_id: lathe.id, requester_id: customer1.id, category: 'MECHANICAL', priority: 'HIGH', status: 'SUBMITTED', sla_deadline: new Date(Date.now() + 12 * 3600000).toISOString() },
      { request_number: 'SR-2026-008', title: 'Conveyor belt tracking issue', description: 'FlatTop 7705 belt drifting 15mm to left side. Product falling off at transfer point. Belt tension appears uneven — left side tighter than right.', machine_id: conveyor.id, requester_id: (customer2 ?? customer1).id, category: 'MECHANICAL', priority: 'MEDIUM', status: 'APPROVED', approved_by: ops.id, approved_at: new Date(Date.now() - 7200000).toISOString(), sla_deadline: new Date(Date.now() + 18 * 3600000).toISOString() },
      { request_number: 'SR-2026-009', title: 'Welding robot teach pendant unresponsive', description: 'FANUC teach pendant screen freezing intermittently during program editing. Hard reset required 2-3 times per shift. Production programs still execute normally.', machine_id: weldBot.id, requester_id: customer1.id, category: 'ELECTRICAL', priority: 'MEDIUM', status: 'SUBMITTED', sla_deadline: new Date(Date.now() + 24 * 3600000).toISOString() },
      { request_number: 'SR-2026-010', title: 'Injection moulder hydraulic unit noise', description: 'Abnormal whining noise from hydraulic power unit on eN-180 during clamping phase. Oil temperature rising to 62°C (normal 45-50°C). Possible pump cavitation.', machine_id: moulder.id, requester_id: (customer2 ?? customer1).id, category: 'HYDRAULIC', priority: 'HIGH', status: 'SUBMITTED', sla_deadline: new Date(Date.now() + 8 * 3600000).toISOString() },
    ];
    const { data: srs } = await supabase
      .from('service_requests')
      .upsert(srRows, { onConflict: 'request_number' })
      .select();
    console.log(`   ✓ Service requests: ${srs?.length ?? 0}`);

    // 7. Machine dependencies (cascading impact analysis)
    const depRows = [
      { machine_id: press.id, depends_on_machine_id: cncMill.id, dependency_type: 'DIRECT', impact_weight: 0.85, throughput_rate: 120, unit_value: 37500, buffer_hours: 4, production_line: 'Line A - Chennai' },
      { machine_id: weldBot.id, depends_on_machine_id: lathe.id, dependency_type: 'DIRECT', impact_weight: 0.70, throughput_rate: 80, unit_value: 95000, buffer_hours: 2, production_line: 'Line B - Pune' },
      { machine_id: conveyor.id, depends_on_machine_id: moulder.id, dependency_type: 'DIRECT', impact_weight: 0.90, throughput_rate: 200, unit_value: 1200, buffer_hours: 1, production_line: 'Line C - Bengaluru' },
    ];
    const { data: deps } = await supabase
      .from('machine_dependencies')
      .upsert(depRows, { onConflict: 'machine_id,depends_on_machine_id' })
      .select();
    console.log(`   ✓ Machine dependencies: ${deps?.length ?? 0}`);

    // 8. Production orders (open orders at risk from downtime) — INR values
    const prodRows = [
      { order_code: 'PO-2026-A1', machine_id: cncMill.id, quantity: 500, unit_value: 37500, deadline: new Date(Date.now() + 3 * 86400000).toISOString(), sla_penalty: 2100000, status: 'IN_PROGRESS' },
      { order_code: 'PO-2026-A2', machine_id: press.id, quantity: 200, unit_value: 95000, deadline: new Date(Date.now() + 5 * 86400000).toISOString(), sla_penalty: 4200000, status: 'OPEN' },
      { order_code: 'PO-2026-B1', machine_id: weldBot.id, quantity: 100, unit_value: 285000, deadline: new Date(Date.now() + 7 * 86400000).toISOString(), sla_penalty: 6250000, status: 'OPEN' },
      { order_code: 'PO-2026-C1', machine_id: moulder.id, quantity: 5000, unit_value: 1200, deadline: new Date(Date.now() + 2 * 86400000).toISOString(), sla_penalty: 1500000, status: 'IN_PROGRESS' },
      { order_code: 'PO-2026-C2', machine_id: conveyor.id, quantity: 8000, unit_value: 450, deadline: new Date(Date.now() + 4 * 86400000).toISOString(), sla_penalty: 800000, status: 'OPEN' },
    ];
    const { data: prods } = await supabase
      .from('production_orders')
      .upsert(prodRows, { onConflict: 'order_code' })
      .select();
    console.log(`   ✓ Production orders: ${prods?.length ?? 0}`);

    // 9. Knowledge base entries (from past resolved cases)
    const kbRows = [
      { machine_type: 'CNC Mill', category: 'MECHANICAL', sub_category: 'bearing_wear', problem_description: 'Excessive vibration at high RPM caused by worn main spindle bearings on BFW BMV 45', solution_applied: 'Replaced main spindle bearings (SKF 7210 BECBP) and realigned spindle assembly. Applied precision torque spec 45Nm. Verified with FFT vibration analysis — peak amplitude dropped from 8.2mm/s to 1.1mm/s.', parts_used: [{ part_number: 'MB-300', quantity: 2 }], resolution_hours: 6.5, cost: 70800, effectiveness_rating: 5, success_flag: true, tags: ['vibration', 'spindle', 'bearing', 'cnc', 'bfw'] },
      { machine_type: 'CNC Mill', category: 'MECHANICAL', sub_category: 'belt_wear', problem_description: 'Drive belt slipping under load causing inconsistent feed rate on CNC mill', solution_applied: 'Replaced drive belt (Gates PowerGrip HTD 8M) and adjusted tensioner to 45N. Checked motor alignment with laser tool — 0.02mm offset corrected.', parts_used: [{ part_number: 'CT-200', quantity: 1 }], resolution_hours: 2.0, cost: 15000, effectiveness_rating: 4, success_flag: true, tags: ['belt', 'drive', 'feed-rate'] },
      { machine_type: 'Press', category: 'HYDRAULIC', sub_category: 'seal_failure', problem_description: 'Hydraulic cylinder seal degradation causing pressure drop and oil leak on Jaya Hind 200T', solution_applied: 'Replaced complete seal kit on main cylinder (Parker PK series), flushed hydraulic system, refilled with Indian Oil Servosystem HLP 46.', parts_used: [{ part_number: 'HS-100', quantity: 1 }], resolution_hours: 4.0, cost: 43300, effectiveness_rating: 5, success_flag: true, tags: ['hydraulic', 'seal', 'pressure', 'leak'] },
      { machine_type: 'Welding Robot', category: 'ELECTRICAL', sub_category: 'wiring_fault', problem_description: 'Intermittent arc breaks during welding cycle traced to damaged torch cable on FANUC ARC Mate', solution_applied: 'Replaced torch cable assembly (FANUC OEM A660-8014-T) and reterminated connectors. Tested arc stability across 50A-300A range — zero breaks in 200 test welds.', parts_used: [{ part_number: 'WW-400', quantity: 1 }], resolution_hours: 3.5, cost: 51700, effectiveness_rating: 4, success_flag: true, tags: ['arc', 'welding', 'cable', 'torch', 'fanuc'] },
      { machine_type: 'Injection Moulder', category: 'ELECTRICAL', sub_category: 'heater_failure', problem_description: 'Zone 3 heater band failure on L&T eN-180 causing temperature overshoot and material degradation', solution_applied: 'Replaced ceramic band heater (40mm x 60mm, 800W) and recalibrated PID loop. Verified temperature stability ±2°C across all 5 zones over 4-hour test run.', parts_used: [{ part_number: 'HB-510', quantity: 2 }], resolution_hours: 4.5, cost: 18900, effectiveness_rating: 5, success_flag: true, tags: ['heater', 'temperature', 'injection', 'pid'] },
      { machine_type: 'Injection Moulder', category: 'HYDRAULIC', sub_category: 'pump_cavitation', problem_description: 'Hydraulic pump cavitation noise on injection moulder, elevated oil temperature reaching 65°C', solution_applied: 'Replaced suction filter (blocked 80%), topped up hydraulic oil (Servo 46), replaced pump shaft seal. Oil temp stabilized at 48°C under full load.', parts_used: [{ part_number: 'HS-100', quantity: 1 }], resolution_hours: 5.0, cost: 35200, effectiveness_rating: 4, success_flag: true, tags: ['hydraulic', 'pump', 'cavitation', 'temperature'] },
      { machine_type: 'Conveyor', category: 'MECHANICAL', sub_category: 'belt_tracking', problem_description: 'Conveyor belt drifting to one side causing product falloff at transfer point', solution_applied: 'Adjusted tracking rollers using laser alignment tool. Replaced worn tail pulley lagging. Belt tension set to 2.5kN per manufacturer spec. Verified tracking stable over 500 cycles.', parts_used: [{ part_number: 'CB-600', quantity: 1 }], resolution_hours: 2.5, cost: 9800, effectiveness_rating: 5, success_flag: true, tags: ['conveyor', 'belt', 'tracking', 'alignment'] },
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
  console.log('   Admin:      admin@servinexa.in          / Admin123!');
  console.log('   Ops Mgr:    ops@servinexa.in            / Ops123!');
  console.log('   Technician: vikram.singh@servinexa.in   / Tech123!');
  console.log('   Technician: ananya.patel@servinexa.in   / Tech123!');
  console.log('   Technician: suresh.reddy@servinexa.in   / Tech123!');
  console.log('   Technician: deepak.nair@servinexa.in    / Tech123!');
  console.log('   Customer:   customer@servinexa.in       / Cust123!');
  console.log('   Customer:   kavitha.iyer@servinexa.in   / Cust123!\n');
}

seed().catch((e) => {
  console.error('\n❌ Seed failed:', e?.message ?? e);
  process.exit(1);
});
