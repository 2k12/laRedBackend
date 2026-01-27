import fs from 'fs';
import path from 'path';
import pool from '../config/db';

const initDb = async () => {
  try {
    const schemaPath = path.join(__dirname, '../db/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Running schema migration...');
    
    // Split by semicolon but ignore newlines/empty strings
    const statements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const statement of statements) {
            // console.log('Executing:', statement.substring(0, 50) + '...');
            await client.query(statement);
        }
        await client.query('COMMIT');
        console.log('✅ Database initialized successfully.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Migration Failed:', e);
        throw e;
    } finally {
        client.release();
    }
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    await pool.end();
  }
};

initDb();
