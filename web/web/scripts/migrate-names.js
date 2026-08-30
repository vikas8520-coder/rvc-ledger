const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

async function run() {
  try {
    console.log("Starting migration...");
    const result = await sql`UPDATE customers SET telugu_name = name WHERE telugu_name IS NULL`;
    console.log("Migration complete:", result.count, "rows updated.");
  } catch (e) {
    console.error("Migration failed:", e);
  }
}
run();
