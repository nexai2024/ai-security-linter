process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');

const connectionString = process.env.POSTGRES_URL || "postgres://postgres.xlppykqzsntlzoxnlpvp:LNiFlihqZ5hjnYuA@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require";

async function main() {
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log("Connected to PostgreSQL database.");
    
    // Add rule_settings column if not exists
    await client.query(`
      ALTER TABLE public.repositories 
      ADD COLUMN IF NOT EXISTS rule_settings JSONB DEFAULT '{}'::jsonb;
    `);
    console.log("Successfully added rule_settings column to repositories table.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}

main();
