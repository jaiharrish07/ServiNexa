/**
 * Seed script — populates the database with a demo-ready dataset that aligns
 * with the AI/ML guide's test data so the end-to-end demo flows cleanly.
 *
 * Run from the repo root: `npm run seed`
 * Requires SUPABASE_URL + SUPABASE_SERVICE_KEY in .env (service role bypasses RLS).
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface SeedUser {
  email: string;
  password: string;
  full_name: string;
  role: string;
}

async function seed() {
  console.log('🌱 Seeding database...\n');

  // 1. Users (auth + profile)
  const users: SeedUser[] = [
    { email: 'admin@dqbh.com', password: 'Admin123!', full_name: 'Sarah Admin', role: 'ADMIN' },
    { email: 'ops@dqbh.com', password: 'Ops123!', full_name: 'Mike Operations', role: 'OPS_MANAGER' },
    { email: 'alex.chen@dqbh.com', password: 'Tech123!', full_name: 'Alex Chen', role: 'TECHNICIAN' },
    { email: 'maria.santos@dqbh.com', password: 'Tech123!', full_name: 'Maria Santos', role: 'TECHNICIAN' },
    { email: 'james.wilson@dqbh.com', password: 'Tech123!', full_name: 'James Wilson', role: 'TECHNICIAN' },
    { email: 'customer@dqbh.com', password: 'Cust123!', full_name: 'David Customer', role: 'CUSTOMER' },
  ];

  const userProfiles: any[] = [];
  for (const u of users) {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });

    if (authError || !authData?.user) {
      console.log(`  • ${u.email} may already exist: ${authError?.message || 'no user returned'}`);
      const { data: existing } = await supabase
        .from('users')
        .select('*')
        .eq('email', u.email)
        .maybeSingle();
      if (existing) userProfiles.push(existing);
      continue;
    }

    const { data: profile } = await supabase
      .from('users')
      .upsert(
        {
          auth_id: authData.user.id,
          email: u.email,
          full_name: u.full_name,
          role: u.role,
        },
        { onConflict: 'email' }
      )
      .select()
      .single();

    if (profile) userProfiles.push(profile);
    console.log(`  ✓ User: ${u.full_name} (${u.role})`);
  }

  // 2. Sites
  const { data: sites } = await supabase
    .from('sites')
    .upsert(
      [
        {
          name: 'Main Manufacturing Plant',
          code: 'SITE-A',
          address: '100 Industrial Blvd',
          city: 'Detroit',
          state: 'MI',
          country: 'US',
          lat: 42.3314,
          lng: -83.0458,
        },
        {
          name: 'Secondary Assembly Facility',
          code: 'SITE-B',
          address: '250 Factory Lane',
          city: 'Toledo',
          state: 'OH',
          country: 'US',
          lat: 41.6528,
          lng: -83.5379,
        },
      ],
      { onConflict: 'code' }
    )
    .select();

  console.log(`  ✓ Sites: ${sites?.length}`);
  const siteA = sites?.find((s) => s.code === 'SITE-A');
  const siteB = sites?.find((s) => s.code === 'SITE-B');
  if (!siteA || !siteB) throw new Error('Sites failed to seed');

  // 3. Machines (matching AI/ML guide test data)
  const { data: machines } = await supabase
    .from('machines')
    .upsert(
      [
        {
          site_id: siteA.id,
          name: 'CNC Milling Machine',
          code: 'M-104',
          type: 'CNC Mill',
          manufacturer: 'Haas',
          model: 'VF-2',
          status: 'DEGRADED',
          criticality: 'HIGH',
          air_temp: 25.5,
          process_temp: 38.2,
          rotational_speed: 1480,
          torque: 55.3,
          tool_wear: 210, // HIGH risk — demo scenario
        },
        {
          site_id: siteA.id,
          name: 'Hydraulic Press',
          code: 'M-200',
          type: 'Press',
          manufacturer: 'Schuler',
          model: 'HPX-400',
          status: 'OPERATIONAL',
          criticality: 'MEDIUM',
          air_temp: 23.0,
          process_temp: 30.1,
          rotational_speed: 1500,
          torque: 35.0,
          tool_wear: 50, // LOW risk
        },
        {
          site_id: siteB.id,
          name: 'Robotic Welding Arm',
          code: 'M-300',
          type: 'Welding Robot',
          manufacturer: 'FANUC',
          model: 'ARC Mate 120iD',
          status: 'OPERATIONAL',
          criticality: 'HIGH',
          air_temp: 27.0,
          process_temp: 45.0,
          rotational_speed: 2100,
          torque: 42.0,
          tool_wear: 120,
        },
      ],
      { onConflict: 'code' }
    )
    .select();

  console.log(`  ✓ Machines: ${machines?.length}`);

  // 4. Technicians (matching AI/ML guide)
  const alexUser = userProfiles.find((u) => u.full_name === 'Alex Chen');
  const mariaUser = userProfiles.find((u) => u.full_name === 'Maria Santos');
  const jamesUser = userProfiles.find((u) => u.full_name === 'James Wilson');

  if (alexUser && mariaUser && jamesUser) {
    const { data: technicians } = await supabase
      .from('technicians')
      .upsert(
        [
          {
            user_id: alexUser.id,
            site_id: siteA.id,
            employee_code: 'T-001',
            specializations: ['hydraulic', 'mechanical', 'cnc'],
            certifications: ['hydraulic_systems_cert', 'cnc_advanced'],
            max_concurrent_jobs: 3,
            current_job_count: 1,
            avg_resolution_hours: 3.2,
            rating: 4.8,
            is_available: true,
          },
          {
            user_id: mariaUser.id,
            site_id: siteA.id,
            employee_code: 'T-002',
            specializations: ['electrical', 'plc', 'calibration'],
            certifications: ['electrical_systems_cert', 'plc_programming'],
            max_concurrent_jobs: 3,
            current_job_count: 2,
            avg_resolution_hours: 4.1,
            rating: 4.5,
            is_available: true,
          },
          {
            user_id: jamesUser.id,
            site_id: siteB.id,
            employee_code: 'T-003',
            specializations: ['welding', 'mechanical', 'pneumatic'],
            certifications: ['welding_cert', 'safety_officer'],
            max_concurrent_jobs: 4,
            current_job_count: 0,
            avg_resolution_hours: 5.0,
            rating: 4.2,
            is_available: true,
          },
        ],
        { onConflict: 'employee_code' }
      )
      .select();

    console.log(`  ✓ Technicians: ${technicians?.length}`);
  } else {
    console.log('  ⚠ Skipped technicians — technician user profiles not found.');
  }

  // 5. Spare parts (includes a cross-site rebalance scenario for HS-100)
  const { data: parts } = await supabase
    .from('spare_parts')
    .upsert(
      [
        { site_id: siteA.id, name: 'Hydraulic Seal Kit', part_number: 'HS-100', category: 'hydraulic', quantity_available: 15, reorder_level: 5, unit_cost: 45.0 },
        { site_id: siteA.id, name: 'CNC Tool Insert', part_number: 'CT-200', category: 'tooling', quantity_available: 30, reorder_level: 10, unit_cost: 22.5 },
        { site_id: siteA.id, name: 'Motor Bearing 6205', part_number: 'MB-300', category: 'mechanical', quantity_available: 8, reorder_level: 5, unit_cost: 35.0 },
        { site_id: siteB.id, name: 'Hydraulic Seal Kit', part_number: 'HS-100', category: 'hydraulic', quantity_available: 3, reorder_level: 5, unit_cost: 45.0 },
        { site_id: siteB.id, name: 'Welding Wire Spool', part_number: 'WW-400', category: 'welding', quantity_available: 20, reorder_level: 5, unit_cost: 85.0 },
      ],
      { onConflict: 'site_id,part_number' }
    )
    .select();

  console.log(`  ✓ Spare parts: ${parts?.length}`);

  console.log('\n✅ Seed complete!\n');
  console.log('Demo accounts:');
  console.log('  Admin:      admin@dqbh.com / Admin123!');
  console.log('  Ops Mgr:    ops@dqbh.com / Ops123!');
  console.log('  Technician: alex.chen@dqbh.com / Tech123!');
  console.log('  Customer:   customer@dqbh.com / Cust123!');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
