import { query } from '../config/db';
import dotenv from 'dotenv';
dotenv.config();

async function grantSystemRole() {
    try {
        const email = 'admin@saas.com';
        // Get current roles
        const userRes = await query('SELECT roles FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) {
            console.error('User not found');
            return;
        }

        let roles = userRes.rows[0].roles || [];
        if (!roles.includes('SYSTEM')) {
            roles.push('SYSTEM');
        }
        if (!roles.includes('ADMIN')) {
            roles.push('ADMIN');
        }

        await query('UPDATE users SET roles = $1 WHERE email = $2', [roles, email]);
        console.log(`Rol SYSTEM asignado exitosamente a ${email}`);
        console.log('Nuevos roles:', roles);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

grantSystemRole();
