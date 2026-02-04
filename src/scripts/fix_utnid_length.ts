import pool from "../config/db";

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log("Running migration: Increasing utn_id column length...");
    await client.query("BEGIN");

    // Change column type to TEXT to allow longer QR strings
    await client.query(`
      ALTER TABLE users 
      ALTER COLUMN utn_id TYPE TEXT;
    `);

    await client.query("COMMIT");
    console.log("✅ Migration successful: utn_id column type changed to TEXT.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ Migration Failed:", e);
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
