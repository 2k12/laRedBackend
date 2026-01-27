import { query } from '../config/db';
import dotenv from 'dotenv';
dotenv.config();

async function checkUsers() {
    try {
        const res = await query('SELECT id, name, email, roles FROM users');
        console.log('--- USUARIOS EN LA BASE DE DATOS ---');
        console.table(res.rows);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

checkUsers();
