const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let connectionString = process.env.DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (url.hostname.endsWith('.pooler.supabase.com') || url.hostname.endsWith('.supabase.co')) {
    const certificado = process.env.PGSSLROOTCERT || [
      path.resolve(__dirname, '../certs/prod-ca-2021.crt'),
      path.resolve(process.cwd(), 'backend/certs/prod-ca-2021.crt'),
    ].find((archivo) => fs.existsSync(archivo));
    if (certificado && !url.searchParams.has('sslrootcert')) {
      url.searchParams.set('sslrootcert', certificado);
    }
    if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'verify-full');
    connectionString = url.toString();
  }
}

const pool = new Pool({
  connectionString,
  max: process.env.NETLIFY === 'true' ? 2 : 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  // Para Supabase usar ?sslmode=verify-full y, si hace falta, PGSSLROOTCERT.
  // No desactivar la validación del certificado.
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});

module.exports = pool;
