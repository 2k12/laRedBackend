import { Request, Response } from "express";
import { query } from "../config/db";
import { v4 as uuidv4 } from "uuid";
import { CacheService } from "../utils/cache";
import { UploadService } from "../services/UploadService";
import { isWithinCampus } from "../config/geofence";

export class ProductController {
  static async createProduct(req: any, res: Response) {
    try {
      const {
        name,
        description,
        price,
        stock,
        category_slug,
        store_id,
        variants,
        condition,
        currency = "COINS", // Default to COINS
        images = [],
        is_ghost_drop,
        ghost_lat,
        ghost_lng,
        ghost_radius,
        ghost_clue,
      } = req.body;
      const userId = req.user.id || req.user.userId;

      // 1. Validate Ownership of Store (Admins/System bypass)
      const storeCheck = await query(
        "SELECT owner_id FROM stores WHERE id = $1",
        [store_id],
      );
      if (storeCheck.rows.length === 0)
        return res.status(404).json({ error: "Store not found" });

      const userRoles = req.user?.roles || [];
      const isAdmin =
        userRoles.includes("ADMIN") || userRoles.includes("SYSTEM");

      if (storeCheck.rows[0].owner_id !== userId && !isAdmin) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // 1.5. GEOFENCE VALIDATION FOR GHOST DROPS
      if (is_ghost_drop) {
        const lat = parseFloat(ghost_lat);
        const lng = parseFloat(ghost_lng);

        if (isNaN(lat) || isNaN(lng)) {
          return res
            .status(400)
            .json({ error: "Coordenadas inválidas para Ghost Drop" });
        }

        if (!isWithinCampus(lat, lng)) {
          return res.status(400).json({
            error:
              "Ubicación fuera del campus permitido. Los Ghost Drops deben crearse dentro del área universitaria.",
          });
        }
      }

      // 2. ECONOMY VALIDATION: PRICE CAP
      // SKIP IF CURRENCY IS MONEY
      if (currency !== "MONEY") {
        const catRes = await query(
          "SELECT price_factor FROM categories WHERE slug = $1",
          [category_slug],
        );
        if (catRes.rows.length === 0)
          return res.status(400).json({ error: "Invalid Category" });
        const factor = parseFloat(catRes.rows[0].price_factor);

        const coinsRes = await query(
          "SELECT COUNT(*) as count FROM coins WHERE status = 'ACTIVE'",
        );
        const totalCoins = parseInt(coinsRes.rows[0].count);

        const usersRes = await query(
          "SELECT COUNT(*) as count FROM users WHERE email != 'system@treasury'",
        );
        const totalUsers = parseInt(usersRes.rows[0].count) || 1;

        const averageWealth = totalCoins / totalUsers;
        const maxAllowedPrice = averageWealth * factor;

        if (price > maxAllowedPrice) {
          return res.status(400).json({
            error: `Price Check Failed: El precio ${price} PL excede el límite permitido para esta categoría.`,
            details: {
              max_allowed: Math.floor(maxAllowedPrice),
              average_wealth: Math.floor(averageWealth),
              category_factor: factor,
            },
          });
        }
      }

      // 3. Generate ID and SKU
      const newId = uuidv4();
      const skuPart = req.body.sku_part || "GEN";
      const sku = `${newId.substring(0, 8).toUpperCase()}-${skuPart.toUpperCase().replace(/[^A-Z0-9-]/g, "")}`;

      // 4. Insert Product
      const result = await query(
        `
                INSERT INTO products (id, store_id, name, description, price, stock, category, sku, condition, currency, images, created_at, is_ghost_drop, ghost_lat, ghost_lng, ghost_radius, ghost_clue)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12, $13, $14, $15, $16)
                RETURNING *
            `,
        [
          newId,
          store_id,
          name,
          description,
          price,
          stock,
          category_slug,
          sku,
          condition || "NEW",
          currency,
          images,
          req.body.is_ghost_drop || false,
          req.body.ghost_lat || null,
          req.body.ghost_lng || null,
          req.body.ghost_radius || 50,
          req.body.ghost_clue || null,
        ],
      );

      const product = result.rows[0];

      // 4. Insert Variants into dedicated table
      if (variants && Array.isArray(variants) && variants.length > 0) {
        for (const v of variants) {
          await query(
            `
                        INSERT INTO product_variants (product_id, name, sku, price_modifier, stock)
                        VALUES ($1, $2, $3, $4, $5)
                    `,
            [
              product.id,
              v.name,
              v.sku || null,
              parseFloat(v.price_modifier || 0),
              parseInt(v.stock || 0),
            ],
          );
        }
      }

      // Invalidate Cache
      await CacheService.deleteByPattern("products:feed:*");

      res.status(201).json(product);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  static async getCategoriesAndCaps(req: Request, res: Response) {
    try {
      // Helper for frontend to show limits
      // Total Coins
      const coinsRes = await query(
        "SELECT COUNT(*) as count FROM coins WHERE status = 'ACTIVE'",
      );
      const totalCoins = parseInt(coinsRes.rows[0].count);

      // Total Users
      const usersRes = await query(
        "SELECT COUNT(*) as count FROM users WHERE email != 'system@treasury'",
      );
      const totalUsers = parseInt(usersRes.rows[0].count) || 1;

      const averageWealth = totalCoins / totalUsers;

      const catsRes = await query(
        "SELECT * FROM categories ORDER BY price_factor ASC",
      );

      const data = catsRes.rows.map((c) => ({
        slug: c.slug,
        name: c.name,
        description: c.description,
        factor: parseFloat(c.price_factor),
        max_price: Math.floor(averageWealth * parseFloat(c.price_factor)),
      }));

      res.json({
        stats: {
          total_coins: totalCoins,
          total_users: totalUsers,
          average_wealth: Math.floor(averageWealth),
        },
        categories: data,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  static async getProductsByStore(req: any, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user.id || req.user.userId;

      // 1. Verify Store Ownership (Admins/System bypass)
      const storeRes = await query(
        "SELECT owner_id FROM stores WHERE id = $1",
        [id],
      );
      if (storeRes.rows.length === 0)
        return res.status(404).json({ error: "Store not found" });

      const userRoles = req.user?.roles || [];
      const isAdmin =
        userRoles.includes("ADMIN") || userRoles.includes("SYSTEM");

      if (storeRes.rows[0].owner_id !== userId && !isAdmin) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // 2. Get Products with Variants
      const productsRes = await query(
        `
                SELECT * FROM products 
                WHERE store_id = $1 
                ORDER BY created_at DESC
            `,
        [id],
      );

      const products = productsRes.rows;

      // Fetch variants for each product
      for (let prod of products) {
        const varRes = await query(
          `SELECT * FROM product_variants WHERE product_id = $1`,
          [prod.id],
        );
        prod.variants = varRes.rows;
      }

      res.json({ products });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  static async transferProduct(req: any, res: Response) {
    try {
      const { id } = req.params; // Product ID
      const { target_store_id } = req.body;
      const userId = req.user.id || req.user.userId;

      // 1. Get Product and Info
      const prodRes = await query(
        `
                SELECT p.*, s.owner_id 
                FROM products p 
                JOIN stores s ON p.store_id = s.id 
                WHERE p.id = $1
            `,
        [id],
      );

      const userRoles = req.user?.roles || [];
      const isAdmin = userRoles.includes("ADMIN");

      if (prodRes.rows.length === 0)
        return res.status(404).json({ error: "Product not found" });
      if (prodRes.rows[0].owner_id !== userId && !isAdmin) {
        return res.status(403).json({ error: "Unauthorized (Origin)" });
      }

      // 2. Verify Target Store Ownership
      const targetStoreRes = await query(
        "SELECT owner_id FROM stores WHERE id = $1",
        [target_store_id],
      );
      if (targetStoreRes.rows.length === 0)
        return res.status(404).json({ error: "Target Store not found" });
      if (targetStoreRes.rows[0].owner_id !== userId && !isAdmin) {
        return res.status(403).json({ error: "Unauthorized (Target)" });
      }

      // 3. Execute Transfer
      const result = await query(
        `
                UPDATE products 
                SET store_id = $1 
                WHERE id = $2 
                RETURNING *
            `,
        [target_store_id, id],
      );

      // Invalidate Cache
      await CacheService.deleteByPattern("products:feed:*");
      await CacheService.deleteByPattern(`product:detail:${id}:*`);

      res.json({
        message: "Product transferred successfully",
        product: result.rows[0],
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  static async updateProduct(req: any, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, price, stock, category, condition, currency } =
        req.body;
      const userId = req.user.id || req.user.userId;
      const userRoles = req.user?.roles || [];
      const isAdmin =
        userRoles.includes("ADMIN") || userRoles.includes("SYSTEM");

      // 1. Verify Ownership or Admin
      const prodRes = await query(
        `
                SELECT p.*, s.owner_id 
                FROM products p 
                JOIN stores s ON p.store_id = s.id 
                WHERE p.id = $1
            `,
        [id],
      );

      if (prodRes.rows.length === 0)
        return res.status(404).json({ error: "Product not found" });
      if (prodRes.rows[0].owner_id !== userId && !isAdmin) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // 2. Perform Update

      // Calculate missing images to delete from R2
      const oldImages: string[] = prodRes.rows[0].images || [];
      const newImages: string[] = req.body.images || oldImages;

      const imagesToDelete = oldImages.filter(
        (img) => !newImages.includes(img),
      );

      // Execute cleanup in background
      if (imagesToDelete.length > 0) {
        Promise.all(
          imagesToDelete.map((img) => UploadService.deleteImage(img)),
        ).catch(console.error);
      }

      const result = await query(
        `
                UPDATE products 
                SET name = $1, description = $2, price = $3, stock = $4, category = $5, condition = $6, currency = COALESCE($7, currency), images = COALESCE($8, images)
                WHERE id = $9 RETURNING *
            `,
        [
          name,
          description,
          parseFloat(price),
          parseInt(stock),
          category,
          condition,
          currency,
          req.body.images, // Can be null/undefined if not updating
          id,
        ],
      );

      // Invalidate Cache
      await CacheService.deleteByPattern("products:feed:*");
      await CacheService.deleteByPattern(`product:detail:${id}:*`);

      res.json(result.rows[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  static async deleteProduct(req: any, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user.id || req.user.userId;
      const userRoles = req.user?.roles || [];
      const isAdmin =
        userRoles.includes("ADMIN") || userRoles.includes("SYSTEM");

      // 1. Verify Ownership or Admin
      const prodRes = await query(
        `
                SELECT p.*, s.owner_id 
                FROM products p 
                JOIN stores s ON p.store_id = s.id 
                WHERE p.id = $1
            `,
        [id],
      );

      if (prodRes.rows.length === 0)
        return res.status(404).json({ error: "Product not found" });
      if (prodRes.rows[0].owner_id !== userId && !isAdmin) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // 2. Perform Delete (and variants due to cascade hopefully, or manual)
      // Assuming DB has cascade, otherwise we delete variants first.
      // In setup we usually have cascades, but safer to delete variants.
      await query("DELETE FROM product_variants WHERE product_id = $1", [id]);
      await query("DELETE FROM products WHERE id = $1", [id]);

      // Delete images from R2
      const images: string[] = prodRes.rows[0].images || [];
      if (images.length > 0) {
        Promise.all(images.map((img) => UploadService.deleteImage(img))).catch(
          console.error,
        );
      }

      // Invalidate Cache
      await CacheService.deleteByPattern("products:feed:*");
      await CacheService.deleteByPattern(`product:detail:${id}:*`);

      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
}
