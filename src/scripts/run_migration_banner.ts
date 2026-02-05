import { query } from "../config/db";

async function runMigration() {
  try {
    console.log("Running migration to add banner_url...");
    await query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='banner_url') THEN 
                    ALTER TABLE stores ADD COLUMN banner_url TEXT; 
                    RAISE NOTICE 'Column banner_url added successfully.';
                ELSE 
                    RAISE NOTICE 'Column banner_url already exists.';
                END IF;
            END $$;
        `);
    console.log("Migration completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
