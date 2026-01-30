import fs from "fs";
import path from "path";
import pool from "../config/db";

const runMigration = async () => {
  try {
    const migrationPath = path.join(
      __dirname,
      "../db/ads_badges_migration.sql",
    );
    const migrationSql = fs.readFileSync(migrationPath, "utf8");

    console.log("Running Ads & Badges migration...");

    const statements = migrationSql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const statement of statements) {
        await client.query(statement);
      }
      await client.query("COMMIT");
      console.log("✅ Ads & Badges migration completed successfully.");
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("❌ Migration Failed:", e);
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error running migration:", err);
  } finally {
    await pool.end();
  }
};

runMigration();
