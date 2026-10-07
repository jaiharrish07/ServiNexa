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
