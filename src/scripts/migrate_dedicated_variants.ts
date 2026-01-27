import { query } from '../config/db';

async function migrate() {
    console.log('--- Iniciando Migración: Tabla product_variants ---');
    try {
        // 1. Crear tabla product_variants si no existe
        await query(`
            CREATE TABLE IF NOT EXISTS public.product_variants (
                id uuid DEFAULT uuid_generate_v4() NOT NULL,
                product_id uuid NULL,
                name varchar(100) NOT NULL,
                sku varchar(50) NULL,
                price_modifier numeric(20, 2) DEFAULT 0 NULL,
                stock int4 DEFAULT 0 NULL,
                created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
                CONSTRAINT product_variants_pkey PRIMARY KEY (id),
                CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE
            );
        `);
        console.log('✅ Tabla "product_variants" creada/verificada.');

        // 2. Opcional: Eliminar la columna variants JSONB si ya existe para evitar confusión
        // await query(`ALTER TABLE products DROP COLUMN IF EXISTS variants;`);
        
    } catch (error) {
        console.error('❌ Error en la migración:', error);
    } finally {
        process.exit();
    }
}

migrate();
