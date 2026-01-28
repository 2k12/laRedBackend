import pool from "../config/db";

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log("🚀 Starting selective migration...");
    await client.query("BEGIN");

    // Create Orders Table
    await client.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                buyer_id UUID REFERENCES users(id),
                store_id UUID REFERENCES stores(id),
                product_id UUID REFERENCES products(id),
                price_paid DECIMAL(20, 2) NOT NULL,
                status VARCHAR(20) DEFAULT 'PENDING_DELIVERY' CHECK (
                    status IN (
                    'PENDING_DELIVERY',
                    'DELIVERED',
                    'DISPUTED',
                    'CANCELLED'
                    )
                ),
                delivery_code VARCHAR(6),
                product_snapshot JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    console.log("✅ Orders table checked/created.");

    // Create Notifications Table
    await client.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID REFERENCES users(id),
                type VARCHAR(50),
                title VARCHAR(100),
                message TEXT,
                related_entity_id UUID,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    console.log("✅ Notifications table checked/created.");

    await client.query("COMMIT");
    console.log("🎉 Migration finished successfully!");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ Migration Failed:", e);
  } finally {
    client.release();
    await pool.end();
    process.exit();
  }
};

migrate();
