import { Pool } from 'pg';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'university_store',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432'),
});

const migrate = async () => {
    try {
        console.log("Starting Rewards System Migration...");
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            console.log("Creating reward_events table...");
            await client.query(`
                CREATE TABLE IF NOT EXISTS reward_events (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    reward_amount INTEGER NOT NULL DEFAULT 1,
                    total_budget INTEGER NOT NULL,
                    remaining_budget INTEGER NOT NULL,
                    secret_key VARCHAR(255) NOT NULL,
                    expires_at TIMESTAMP,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            console.log("Creating reward_claims table...");
            await client.query(`
                CREATE TABLE IF NOT EXISTS reward_claims (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    event_id UUID REFERENCES reward_events(id) ON DELETE CASCADE,
                    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(event_id, user_id)
                );
            `);
            
            await client.query('COMMIT');
            console.log("✅ Rewards Migration Successful");
        } catch (e) {
            await client.query('ROLLBACK');
            console.error("❌ Migration Failed:", e);
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
