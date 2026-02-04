import { query } from "../config/db";

async function run() {
  try {
    console.log("Running migration: Add qr_refresh_rate to reward_events...");
    await query(`
      ALTER TABLE reward_events 
      ADD COLUMN IF NOT EXISTS qr_refresh_rate INTEGER DEFAULT 60;
    `);
    console.log("Migration completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

run();
