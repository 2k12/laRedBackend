import fs from "fs";
import path from "path";
import pool from "../config/db";

const migrate = async () => {
  try {
    const migrationPath = path.join(
      __dirname,
      "../db/ghost_drops_migration.sql",
    );
    const sql = fs.readFileSync(migrationPath, "utf8");

    console.log("Running migration: ghost_drops_migration.sql");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Split if needed, but simple ALTERs can run together if supported,
      // but pg usually wants singular statements if mixed.
      // The file has separate lines, let's just run them one by one or as a block.
      // Postgres node driver can run multiple statements if semi-colon separated.
      await client.query(sql);
      await client.query("COMMIT");
      console.log("✅ Migration applied successfully.");
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

migrate();
