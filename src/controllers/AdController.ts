import { Request, Response } from "express";
import { query } from "../config/db";
import { v4 as uuidv4 } from "uuid";
import { CacheService, CACHE_TTL } from "../utils/cache";

export class AdController {
  // 1. Get available advertising packages
  static async getPackages(req: Request, res: Response) {
    try {
      const cacheKey = "ads:packages";
      const cached = await CacheService.get(cacheKey);
      if (cached) return res.json(cached);

      const result = await query(
        "SELECT * FROM advertising_packages ORDER BY price ASC",
      );

      await CacheService.set(cacheKey, result.rows, CACHE_TTL.LONG);
      res.json(result.rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // 2. Purchase a package for a product
  static async purchasePackage(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { productId, packageId } = req.body;

      if (!productId || !packageId) {
        return res
          .status(400)
          .json({ error: "Product ID and Package ID required" });
      }

      await query("BEGIN");

      // 1. Verify product ownership
      const productRes = await query(
        "SELECT p.* FROM products p JOIN stores s ON p.store_id = s.id WHERE p.id = $1 AND s.owner_id = $2",
        [productId, userId],
      );
      if (productRes.rows.length === 0) {
        await query("ROLLBACK");
        return res
          .status(404)
          .json({ error: "Product not found or not owned by user" });
      }

      // 1.5. Check if an active ad already exists
      const existingAd = await query(
        "SELECT id FROM product_ads WHERE product_id = $1 AND expires_at > CURRENT_TIMESTAMP",
        [productId],
      );
      if (existingAd.rows.length > 0) {
        await query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Este drop ya tiene una promoción activa." });
      }

      // 2. Get package info
      const packageRes = await query(
        "SELECT * FROM advertising_packages WHERE id = $1",
        [packageId],
      );
      if (packageRes.rows.length === 0) {
        await query("ROLLBACK");
        return res.status(404).json({ error: "Package not found" });
      }
      const pkg = packageRes.rows[0];

      // 3. Verify user funds (Pulsos)
      const TREASURY_WALLET_ID = "11111111-1111-1111-1111-111111111111";
      const price = Math.ceil(Number(pkg.price));

      const coinsRes = await query(
        `SELECT id FROM coins 
                 WHERE wallet_id = (SELECT id FROM wallets WHERE user_id = $1) 
                 AND status = 'ACTIVE' LIMIT $2 FOR UPDATE`,
        [userId, price],
      );

      if (coinsRes.rows.length < price) {
        await query("ROLLBACK");
        return res.status(402).json({ error: "Insufficient Funds" });
      }

      // 4. Transfer coins to Treasury
      const coinIds = coinsRes.rows.map((c) => c.id);
      await query(
        "UPDATE coins SET wallet_id = $1 WHERE id = ANY($2::uuid[])",
        [TREASURY_WALLET_ID, coinIds],
      );

      // 5. Create Ad Entry
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + pkg.duration_hours);

      await query(
        "INSERT INTO product_ads (product_id, package_id, expires_at) VALUES ($1, $2, $3)",
        [productId, packageId, expiresAt],
      );

      // 6. Log transaction
      await query(
        `INSERT INTO transactions (from_wallet_id, to_wallet_id, amount, type, reference_id, previous_hash, hash)
                 VALUES ((SELECT id FROM wallets WHERE user_id = $1), $2, $3, 'AD_PURCHASE', $4, 'ADS_LINK', md5(random()::text))`,
        [userId, TREASURY_WALLET_ID, price, productId],
      );

      await query("COMMIT");

      // Invalidate Cache
      await CacheService.delete("ads:featured");

      res.status(201).json({
        message: "Ad package purchased successfully",
        expires_at: expiresAt,
      });
    } catch (error) {
      await query("ROLLBACK");
      console.error(error);
      res.status(500).json({ error: "Transaction Failed" });
    }
  }

  // 3. Get featured products for the slide
  static async getFeaturedProducts(req: Request, res: Response) {
    try {
      const cacheKey = "ads:featured";
      const cached = await CacheService.get(cacheKey);
      if (cached) return res.json(cached);

      const result = await query(`
                SELECT p.*, s.name as store_name, pa.expires_at
                FROM products p
                JOIN stores s ON p.store_id = s.id
                JOIN product_ads pa ON p.id = pa.product_id
                WHERE pa.expires_at > CURRENT_TIMESTAMP
                ORDER BY pa.created_at DESC
                LIMIT 5
            `);

      await CacheService.set(cacheKey, result.rows, CACHE_TTL.SHORT);
      res.json(result.rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
}
