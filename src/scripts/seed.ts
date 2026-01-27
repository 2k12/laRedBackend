import { Pool } from 'pg';
import dotenv from 'dotenv';
import { LedgerService } from '../services/LedgerService';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

const ledgerService = new LedgerService();

const seed = async () => {
    try {
        console.log('🌱 Starting Seed (Tokenized Economy)...');
        
        // 1. Reset Data (Already handled by db:init usually, but strictly clearing here for seed consistency)
        // Note: db:init drops tables, so this TRUNCATE might fail if tables are empty/missing.
        // Assuming db:init ran just before.
        await pool.query('TRUNCATE TABLE transactions, products, coins, stores, wallets, users CASCADE');

        const hashedPassword = await bcrypt.hash('123456789', 10);

        // 2. Create Admin User
        const adminId = uuidv4();
        await pool.query(
            `INSERT INTO users (id, email, password_hash, roles, name) VALUES ($1, $2, $3, $4, $5)`,
            [adminId, 'admin@saas.com', hashedPassword, ['ADMIN'], 'Super Admin']
        );
        const adminWallet = await ledgerService.createWallet(adminId);
        console.log('✅ Admin User & Wallet Created');

        // 3. Create Seller User
        const sellerId = uuidv4();
        await pool.query(
            `INSERT INTO users (id, email, password_hash, roles, name) VALUES ($1, $2, $3, $4, $5)`,
            [sellerId, 'seller@store.com', hashedPassword, ['USER', 'SELLER'], 'Jane Seller']
        );
        const sellerWallet = await ledgerService.createWallet(sellerId);
        console.log('✅ Seller User & Wallet Created');

        // 4. Create Store
        const storeId = uuidv4();
        await pool.query(
             `INSERT INTO stores (id, owner_id, name, description, image_url) VALUES ($1, $2, $3, $4, $5)`,
             [storeId, sellerId, 'Campus Tech Store', 'Electronics and Accessories for Students', 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&q=80&w=200']
        );
        console.log('✅ Store Created');

        // 5. Create Products (Price in UC)
        // 5. Create Products (Price in UC)
        const products = [
            { name: 'MacBook Pro M3', price: 1500, stock: 5, img: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca4?auto=format&fit=crop&q=80&w=1200' },
            { name: 'Hoodie Universidad', price: 45, stock: 100, img: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&q=80&w=1200' },
            { name: 'Teclado Mecánico', price: 90, stock: 20, img: 'https://images.unsplash.com/photo-1595225476474-87563907a212?auto=format&fit=crop&q=80&w=1200' },
            { name: 'Libros Diseño', price: 30, stock: 50, img: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=600' },
            { name: 'Headphones Pro', price: 120, stock: 15, img: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=600' },
            { name: 'Smart Watch', price: 199, stock: 25, img: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&q=80&w=600' },
            { name: 'Mochila Antirrobo', price: 55, stock: 40, img: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&q=80&w=600' },
            { name: 'Monitor 4K', price: 300, stock: 8, img: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&q=80&w=600' },
        ];

        for (const p of products) {
            await pool.query(
                `INSERT INTO products (store_id, name, price, stock, image_url) VALUES ($1, $2, $3, $4, $5)`,
                [storeId, p.name, p.price, p.stock, p.img]
            );
        }
        console.log(`✅ Products Created`);

        // 6. Mint Initial Economy (TOKENIZED)
        // Creating 1000 INDIVIDUAL COINS
        console.log('💰 Minting 1000 individual coins (this might take a moment)...');
        await ledgerService.mintTokens(adminWallet.id, 1000, 'Genesis Mint');
        console.log('✅ 1000 Coins Minted (1000 DB Records)');

        // Admin grants 50 coins to Seller (MOVES 50 RECORDS)
        await ledgerService.transferTokens(adminWallet.id, sellerWallet.id, 50, 'Grant for Setup');
        console.log('✅ 50 Coins Transferred to Seller');

        console.log('🚀 Seed Completed Successfully');

    } catch (e) {
        console.error('❌ Seed Failed:', e);
    } finally {
        await pool.end();
    }
}

seed();
