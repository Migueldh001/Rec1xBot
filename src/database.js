// src/database.js - Conexión a Supabase
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
console.error('❌ Faltan variables de entorno de Supabase');
process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('✅ Conexión a Supabase configurada');

module.exports = supabase;