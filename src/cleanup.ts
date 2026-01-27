import { query } from './config/db';

async function cleanup() {
    console.log('--- Iniciando Limpieza de Datos de Prueba ---');
    try {
        await query('TRUNCATE TABLE coin_history CASCADE');
        console.log('✓ Historial de monedas vaciado');
        
        await query('TRUNCATE TABLE transactions CASCADE');
        console.log('✓ Libro de transacciones vaciado');
        
        await query('TRUNCATE TABLE products CASCADE');
        console.log('✓ Catálogo de productos vaciado');
        
        await query('TRUNCATE TABLE stores CASCADE');
        console.log('✓ Directorio de tiendas vaciado');
        
        await query('TRUNCATE TABLE coins CASCADE');
        console.log('✓ Existencias de monedas (tokens) eliminadas');
        
        console.log('--- Limpieza Completada Exitosamente ---');
        process.exit(0);
    } catch (error) {
        console.error('Error durante la limpieza:', error);
        process.exit(1);
    }
}

cleanup();
