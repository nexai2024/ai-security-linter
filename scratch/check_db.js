const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || "https://xlppykqzsntlzoxnlpvp.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhscHB5a3F6c250bHpveG5scHZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjE2MDMyNiwiZXhwIjoyMDk3NzM2MzI2fQ.us03Q8gvkgaW2gA8ZWHOKSD-WGPEySpCjZNVT4G3Aw4";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const { data, error } = await supabase.from('accounts').select('*');
  if (error) {
    console.error("Query failed:", error);
  } else {
    console.log("=== Accounts in Supabase ===");
    console.log(data);
  }
}

main();
