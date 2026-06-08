// src/config/supabase.js
require('dotenv').config(); // Garante que o .env seja carregado

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ ERRO: Variáveis SUPABASE_URL ou SUPABASE_SERVICE_KEY não encontradas no .env');
  console.error('Verifique se o arquivo .env está na raiz do projeto e contém:');
  console.error('SUPABASE_URL=...');
  console.error('SUPABASE_SERVICE_KEY=...');
  process.exit(1); // Para o servidor se as variáveis estiverem faltando
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

console.log('✅ Supabase conectado com sucesso!');

module.exports = supabase;