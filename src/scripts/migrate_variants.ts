import { query } from '../config/db';

async function migrate() {
    console.log('--- Iniciando Migración: Variantes de Producto ---');
    try {
        await query(`
            ALTER TABLE products 
            ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]'::jsonb;
        `);
        console.log('✅ Columna "variants" añadida exitosamente.');
    } catch (error) {
        console.error('❌ Error en la migración:', error);
    } finally {
        process.exit();
    }
}

migrate();
