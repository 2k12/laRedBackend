import { Pool } from 'pg';
import dotenv from 'dotenv';

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
        console.log("Starting Migration...");
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // 1. Update Products Table
            console.log("Updating products table...");
            await client.query(`
                ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(50);
                ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(50);
            `);

            // 2. Create Product Variants Table
            console.log("Creating product_variants table...");
            await client.query(`
                CREATE TABLE IF NOT EXISTS product_variants (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
                    name VARCHAR(100) NOT NULL,
                    sku VARCHAR(50),
                    price_modifier DECIMAL(20, 2) DEFAULT 0,
                    stock INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // 3. Create Economy Config Table
            console.log("Creating economy_config table...");
            await client.query(`
                CREATE TABLE IF NOT EXISTS economy_config (
                    key VARCHAR(50) PRIMARY KEY,
                    value TEXT,
                    description TEXT
                );
            `);

            // 4. Seed Default Economy Config
            console.log("Seeding economy config...");
            const configs = [
                ['MAX_PRODUCT_PRICE_CAP', '1000', 'Precio máximo permitido para cualquier producto base'],
                ['TOTAL_MINT_CAP', '10000000', 'Límite duro de monedas en circulación'],
                ['ROLE_MINT_RECTOR', '5000', 'Asignación semestral para Rector'],
                ['ROLE_MINT_DECANO', '3000', 'Asignación semestral para Decanos'],
                ['ROLE_MINT_DOCENTE', '1000', 'Asignación semestral para Docentes'],
                ['ROLE_MINT_ESTUDIANTE', '500', 'Asignación semestral para Estudiantes'],
                ['ROLE_MINT_ADMIN', '200', 'Asignación semestral para Administrativos']
            ];

            for (const [key, value, desc] of configs) {
                await client.query(`
                    INSERT INTO economy_config (key, value, description) 
                    VALUES ($1, $2, $3) 
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
                `, [key, value, desc]);
            }

            // 5. Update Users Logic (Ensure Roles column is flexible - already TEXT[])
            // No changes needed for users table as roles is TEXT[].

            await client.query('COMMIT');
            console.log("✅ Migration Successful");
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
