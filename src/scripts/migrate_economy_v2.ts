
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
        console.log("Starting Economy 2.0 Migration...");
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // 1. Create Treasury Wallet Owner (System User)
            console.log("Ensuring System User exists...");
            const sysUserRes = await client.query(`
                INSERT INTO users (email, password_hash, roles, name, id)
                VALUES ('system@treasury', 'SYSTEM_LOCKED', '{"SYSTEM"}', 'Banco Central', '00000000-0000-0000-0000-000000000000')
                ON CONFLICT (id) DO NOTHING
                RETURNING id;
            `);
            
            // 2. Create Treasury Wallet
             console.log("Ensuring Treasury Wallet exists...");
             await client.query(`
                INSERT INTO wallets (user_id, id, currency_symbol)
                VALUES ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'UC')
                ON CONFLICT (id) DO NOTHING;
            `);

            // 3. Create Categories Table with Price Factors
            console.log("Creating categories table...");
            await client.query(`
                CREATE TABLE IF NOT EXISTS categories (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(50) UNIQUE NOT NULL,
                    slug VARCHAR(50) UNIQUE NOT NULL,
                    price_factor DECIMAL(5, 4) NOT NULL, -- e.g. 0.05 for 5%, 0.80 for 80%
                    description TEXT
                );
            `);

            // 4. Seed Categories
            console.log("Seeding categories...");
            const categories = [
                ['Alimentos y Bebidas', 'food', 0.05, 'Comida diaria, snacks, bebidas.'],
                ['Papelería y Útiles', 'stationery', 0.10, 'Cuadernos, bolígrafos, material de clase.'],
                ['Servicios Académicos', 'services', 0.25, 'Tutorías, impresiones, asesorías.'],
                ['Ropa y Accesorios', 'clothing', 0.40, 'Sudaderas, camisetas, merch universitaria.'],
                ['Tecnología', 'tech', 0.80, 'Calculadoras, tablets, laptops, componentes.'],
                ['Otros', 'other', 0.15, 'Varios.']
            ];

            for (const [name, slug, factor, desc] of categories) {
                await client.query(`
                    INSERT INTO categories (name, slug, price_factor, description)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (name) DO UPDATE SET price_factor = EXCLUDED.price_factor;
                `, [name, slug, factor, desc]);
            }

            // 5. Add 'category_slug' to products if not exists or migrate text category to FK?
            // User current schema has "category VARCHAR(50)". We can keep it and assume it stores the slug.
            
            await client.query('COMMIT');
            console.log("✅ Economy 2.0 Migration Successful");
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
