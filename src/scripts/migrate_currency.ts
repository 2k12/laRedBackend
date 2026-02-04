import { query } from "../config/db";

async function migrate() {
  console.log("Starting Currency Migration...");

  try {
    // 1. Add currency column
    console.log("Adding currency column...");
    await query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS currency VARCHAR(20) DEFAULT 'COINS' CHECK (currency IN ('COINS', 'MONEY'));
    `);

    console.log("Migration Complete!");
  } catch (error) {
    console.error("Migration Failed:", error);
  }
}

migrate();
