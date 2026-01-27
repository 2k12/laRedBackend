
import { error } from 'console';
import { query } from '../config/db';

const check = async () => {
    try {
        const res = await query('SELECT count(*) FROM products');
        console.log('Product Count:', res.rows[0].count);
        
        const products = await query('SELECT id, name FROM products LIMIT 5');
        console.log('Sample Products:', products.rows);
    } catch(e) {
        console.error(e);
    }
};

check();
