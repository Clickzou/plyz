const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function checkTable(tableName) {
  const { data, error } = await supabase.from(tableName).select('*').limit(0);
  if (error && error.code === '42P01') return false;
  if (error && error.message?.includes('does not exist')) return false;
  return true;
}

async function checkMigration() {
  console.log('\n=== Plyz Marketplace - Table Check ===\n');
  
  const tables = [
    'profiles',
    'celebrity_profiles', 
    'celebrity_pricing',
    'booking_requests',
    'autograph_requests',
    'posts',
    'wikidata_entities',
    'reports'
  ];
  
  let allExist = true;
  for (const table of tables) {
    const exists = await checkTable(table);
    console.log(`  ${exists ? '✓' : '✗'} ${table}`);
    if (!exists) allExist = false;
  }
  
  if (allExist) {
    console.log('\n  All tables exist! Migration not needed.\n');
    return;
  }
  
  console.log('\n  Some tables are missing. Please run the following SQL in your');
  console.log('  Supabase SQL Editor (Dashboard > SQL Editor > New Query):\n');
  console.log('  File: server/migration.sql\n');
}

checkMigration().catch(console.error);
