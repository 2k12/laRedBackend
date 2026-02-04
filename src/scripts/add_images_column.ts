import { query } from "../config/db";

async function run() {
  try {
    console.log("Running migration: Add images to products...");
    await query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';
    `);
    console.log("Migration completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

run();
