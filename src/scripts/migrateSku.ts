import pool from '../config/db';

const migrate = async () => {
  try {
    console.log('Adding SKU column to products...');
    await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(100);');
    console.log('✅ Migration successful.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await pool.end();
  }
};

migrate();
