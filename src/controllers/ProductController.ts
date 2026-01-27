import { Request, Response } from 'express';
import { query } from '../config/db';

export class ProductController {

    static async createProduct(req: any, res: Response) {
        try {
            const { name, description, price, stock, category_slug, store_id, variants } = req.body;
            const userId = req.user.id || req.user.userId;
            
            // 1. Validate Ownership of Store
            const storeCheck = await query('SELECT owner_id FROM stores WHERE id = $1', [store_id]);
            if (storeCheck.rows.length === 0) return res.status(404).json({ error: 'Store not found' });
            if (storeCheck.rows[0].owner_id !== userId) return res.status(403).json({ error: 'Not authorized' });

            // 2. ECONOMY VALIDATION: PRICE CAP
            // ... (rest of logic stays same)
            const catRes = await query('SELECT price_factor FROM categories WHERE slug = $1', [category_slug]);
            if (catRes.rows.length === 0) return res.status(400).json({ error: 'Invalid Category' });
            const factor = parseFloat(catRes.rows[0].price_factor);

            const coinsRes = await query("SELECT COUNT(*) as count FROM coins WHERE status = 'ACTIVE'");
            const totalCoins = parseInt(coinsRes.rows[0].count);

            const usersRes = await query("SELECT COUNT(*) as count FROM users WHERE email != 'system@treasury'");
            const totalUsers = parseInt(usersRes.rows[0].count) || 1;

            const averageWealth = totalCoins / totalUsers;
            const maxAllowedPrice = averageWealth * factor;

            if (price > maxAllowedPrice) {
                return res.status(400).json({ 
                    error: `Price Check Failed: El precio ${price} UC excede el límite permitido para esta categoría.`,
                    details: {
                        max_allowed: Math.floor(maxAllowedPrice),
                        average_wealth: Math.floor(averageWealth),
                        category_factor: factor
                    }
                });
            }

            // 3. Insert Product
            const result = await query(`
                INSERT INTO products (store_id, name, description, price, stock, category, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                RETURNING *
            `, [store_id, name, description, price, stock, category_slug]);

            const product = result.rows[0];

            // 4. Insert Variants into dedicated table
            if (variants && Array.isArray(variants) && variants.length > 0) {
                for (const v of variants) {
                    await query(`
                        INSERT INTO product_variants (product_id, name, sku, price_modifier, stock)
                        VALUES ($1, $2, $3, $4, $5)
                    `, [
                        product.id, 
                        v.name, 
                        v.sku || null, 
                        parseFloat(v.price_modifier || 0), 
                        parseInt(v.stock || 0)
                    ]);
                }
            }

            res.status(201).json(product);

        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    static async getCategoriesAndCaps(req: Request, res: Response) {
        try {
            // Helper for frontend to show limits
             // Total Coins
             const coinsRes = await query("SELECT COUNT(*) as count FROM coins WHERE status = 'ACTIVE'");
             const totalCoins = parseInt(coinsRes.rows[0].count);
 
             // Total Users
             const usersRes = await query("SELECT COUNT(*) as count FROM users WHERE email != 'system@treasury'");
             const totalUsers = parseInt(usersRes.rows[0].count) || 1;
 
             const averageWealth = totalCoins / totalUsers;

             const catsRes = await query('SELECT * FROM categories ORDER BY price_factor ASC');
             
             const data = catsRes.rows.map(c => ({
                 slug: c.slug,
                 name: c.name,
                 description: c.description,
                 factor: parseFloat(c.price_factor),
                 max_price: Math.floor(averageWealth * parseFloat(c.price_factor))
             }));

             res.json({
                 stats: {
                     total_coins: totalCoins,
                     total_users: totalUsers,
                     average_wealth: Math.floor(averageWealth)
                 },
                 categories: data
             });

        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    static async getProductsByStore(req: any, res: Response) {
        try {
            const { id } = req.params;
            const userId = req.user.id || req.user.userId;

            // 1. Verify Store Ownership
            const storeRes = await query('SELECT owner_id FROM stores WHERE id = $1', [id]);
            if (storeRes.rows.length === 0) return res.status(404).json({ error: 'Store not found' });
            if (storeRes.rows[0].owner_id !== userId) return res.status(403).json({ error: 'Unauthorized' });

            // 2. Get Products with Variants
            const productsRes = await query(`
                SELECT * FROM products 
                WHERE store_id = $1 
                ORDER BY created_at DESC
            `, [id]);

            const products = productsRes.rows;

            // Fetch variants for each product
            for (let prod of products) {
                const varRes = await query(`SELECT * FROM product_variants WHERE product_id = $1`, [prod.id]);
                prod.variants = varRes.rows;
            }

            res.json({ products });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    static async transferProduct(req: any, res: Response) {
        try {
            const { id } = req.params; // Product ID
            const { target_store_id } = req.body;
            const userId = req.user.id || req.user.userId;

            // 1. Get Product and Info
            const prodRes = await query(`
                SELECT p.*, s.owner_id 
                FROM products p 
                JOIN stores s ON p.store_id = s.id 
                WHERE p.id = $1
            `, [id]);

            const userRoles = req.user?.roles || [];
            const isAdmin = userRoles.includes('ADMIN');

            if (prodRes.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
            if (prodRes.rows[0].owner_id !== userId && !isAdmin) {
                return res.status(403).json({ error: 'Unauthorized (Origin)' });
            }

            // 2. Verify Target Store Ownership
            const targetStoreRes = await query('SELECT owner_id FROM stores WHERE id = $1', [target_store_id]);
            if (targetStoreRes.rows.length === 0) return res.status(404).json({ error: 'Target Store not found' });
            if (targetStoreRes.rows[0].owner_id !== userId && !isAdmin) {
                return res.status(403).json({ error: 'Unauthorized (Target)' });
            }

            // 3. Execute Transfer
            const result = await query(`
                UPDATE products 
                SET store_id = $1 
                WHERE id = $2 
                RETURNING *
            `, [target_store_id, id]);

            res.json({
                message: "Product transferred successfully",
                product: result.rows[0]
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}
