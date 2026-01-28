import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "university_store",
  password: process.env.DB_PASSWORD || "password",
  port: parseInt(process.env.DB_PORT || "5432"),
});

const migrate = async () => {
  try {
    console.log("Starting Migration V3...");
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1. Update Products Table for Condition
      console.log("Adding condition to products...");
      await client.query(`
                ALTER TABLE products ADD COLUMN IF NOT EXISTS condition VARCHAR(20) DEFAULT 'NEW';
            `);

      // 2. Update Users Table for Status
      console.log("Adding status to users...");
      await client.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'INACTIVE';
            `);

      // Activate existing users if any to avoid locking everyone out
      await client.query(`
                UPDATE users SET status = 'ACTIVE' WHERE status = 'INACTIVE';
            `);

      await client.query("COMMIT");
      console.log("✅ Migration V3 Successful");
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("❌ Migration V3 Failed:", e);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Connection Error:", err);
  } finally {
    await pool.end();
  }
};

migrate();
