import { query } from '../config/db';
import dotenv from 'dotenv';
dotenv.config();

async function revertAdminRole() {
    try {
        const email = 'admin@saas.com';
        await query("UPDATE users SET roles = '{ADMIN}' WHERE email = $1", [email]);
        console.log(`Roles de ${email} revertidos a [ADMIN]`);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

revertAdminRole();
