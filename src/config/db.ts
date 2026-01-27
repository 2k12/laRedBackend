import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT !== undefined;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Fallback to individual variables ONLY if DATABASE_URL is not provided
  user: !process.env.DATABASE_URL ? (process.env.DB_USER || 'postgres') : undefined,
  host: !process.env.DATABASE_URL ? (process.env.DB_HOST || 'localhost') : undefined,
  database: !process.env.DATABASE_URL ? (process.env.DB_NAME || 'university_store') : undefined,
  password: !process.env.DATABASE_URL ? (process.env.DB_PASSWORD || 'password') : undefined,
  port: !process.env.DATABASE_URL ? parseInt(process.env.DB_PORT || '5432') : undefined,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
export default pool;
