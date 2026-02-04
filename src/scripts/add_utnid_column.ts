import pool from "../config/db";

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log("Running migration: Add utn_id to users table...");
    await client.query("BEGIN");

    // Add utn_id column if it doesn't exist
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS utn_id VARCHAR(50) UNIQUE;
    `);

    await client.query("COMMIT");
    console.log("✅ Migration successful: utn_id column added.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ Migration Failed:", e);
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
