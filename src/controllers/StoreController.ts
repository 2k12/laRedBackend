import { Request, Response } from "express";
import { query } from "../config/db";

export class StoreController {
  static async getPublicProducts(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 12;
      const search = req.query.search as string;
      const minPrice = req.query.minPrice
        ? parseFloat(req.query.minPrice as string)
        : undefined;
      const maxPrice = req.query.maxPrice
        ? parseFloat(req.query.maxPrice as string)
        : undefined;
      const status = req.query.status as string; // 'new' | 'used' | 'all'
      const category = req.query.category as string;
      const storeId = req.query.storeId as string;

      const offset = (page - 1) * limit;

      // Build Query
      let queryText = `
                SELECT p.*, s.name as store_name 
                FROM products p
                LEFT JOIN stores s ON p.store_id = s.id
                WHERE p.stock > 0
            `;
      const queryParams: any[] = [];

      // Filters
      if (search) {
        queryParams.push(`%${search}%`);
        queryText += ` AND (p.name ILIKE $${queryParams.length} OR p.description ILIKE $${queryParams.length})`;
      }

      if (minPrice !== undefined) {
        queryParams.push(minPrice);
        queryText += ` AND p.price >= $${queryParams.length}`;
      }

      if (maxPrice !== undefined) {
        queryParams.push(maxPrice);
        queryText += ` AND p.price <= $${queryParams.length}`;
      }

      if (status && status !== "all") {
        queryParams.push(status.toUpperCase());
        queryText += ` AND p.condition = $${queryParams.length}`;
      }

      if (category) {
        queryParams.push(category);
        queryText += ` AND p.category = $${queryParams.length}`;
      }

      if (storeId) {
        queryParams.push(storeId);
        queryText += ` AND p.store_id = $${queryParams.length}`;
      }

      const countQueryText =
        `SELECT COUNT(*) FROM products p LEFT JOIN stores s ON p.store_id = s.id WHERE` +
        queryText.split("WHERE")[1];

      // Deterministic ordering: created_at DESC, id DESC
      const fullQuery = `
                WITH filtered_products AS (
                    ${queryText}
                )
                SELECT *, (SELECT COUNT(*) FROM filtered_products) as total_count 
                FROM filtered_products 
                ORDER BY created_at DESC, id DESC
                LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
            `;

      const finalParams = [...queryParams, limit, offset];
      const result = await query(fullQuery, finalParams);

      const total =
        result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
      const totalPages = Math.ceil(total / limit);

      res.json({
        data: result.rows.map((r) => {
          const { total_count, ...rest } = r;
          return rest;
        }),
        meta: {
          total,
          page,
          limit,
          totalPages,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  static async getProductById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Get current product
      const result = await query(
        `
                SELECT p.*, s.name as store_name, s.owner_id as owner_id 
                FROM products p
                LEFT JOIN stores s ON p.store_id = s.id
                WHERE p.id = $1
            `,
        [id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Product not found" });
      }

      const product = result.rows[0];

      // Get navigation using Window Functions to guarantee exact match with Feed order
      // Feed Order: created_at DESC, id DESC
      // LAG = Previous Row (Newer item in DESC list)
      // LEAD = Next Row (Older item in DESC list)

      const navResult = await query(
        `
                WITH sorted_ids AS (
                    SELECT id, 
                           LAG(id) OVER (ORDER BY created_at DESC, id DESC) as prev_id,
                           LEAD(id) OVER (ORDER BY created_at DESC, id DESC) as next_id
                    FROM products
                    WHERE stock > 0
                )
                SELECT prev_id, next_id FROM sorted_ids WHERE id = $1
            `,
        [id],
      );

      const navData = navResult.rows[0] || {};

      res.json({
        ...product,
        prev_id: navData.prev_id || null,
        next_id: navData.next_id || null,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // --- Secured Store Management Routes ---

  // Get Stores for Current User (or All if Admin)
  static async getMyStores(req: any, res: Response) {
    try {
      const userId = req.user.id || req.user.userId;
      const userRoles = req.user.roles || [];

      // Get stores strictly owned by the user
      const result = await query(
        `SELECT * FROM stores WHERE owner_id = $1 ORDER BY created_at DESC`,
        [userId],
      );

      res.json({ stores: result.rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // Explicit Get All for Admins (Optional, can be used for the separate view)
  static async getAllStores(req: any, res: Response) {
    try {
      // Ensure middleware checks for ADMIN role if using this specifically
      const result = await query(
        `SELECT * FROM stores ORDER BY created_at DESC`,
      );
      res.json({ stores: result.rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  static async createStore(req: any, res: Response) {
    try {
      const { name, description, owner_id } = req.body;
      const userId = req.user.id || req.user.userId;
      const roles = req.user.roles || [];

      if (!name) return res.status(400).json({ error: "Name is required" });

      // Logic: If ADMIN and owner_id is provided, use it. Otherwise use userId.
      const finalOwnerId =
        roles.includes("ADMIN") && owner_id ? owner_id : userId;

      const result = await query(
        `INSERT INTO stores (name, description, owner_id) VALUES ($1, $2, $3) RETURNING *`,
        [name, description, finalOwnerId],
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  static async updateStore(req: any, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, owner_id } = req.body;
      const userId = req.user.id || req.user.userId;
      const userRoles = req.user.roles || [];

      // Check ownership or admin
      const storeCheck = await query(
        `SELECT owner_id FROM stores WHERE id = $1`,
        [id],
      );
      if (storeCheck.rows.length === 0)
        return res.status(404).json({ error: "Store not found" });

      if (
        storeCheck.rows[0].owner_id !== userId &&
        !userRoles.includes("ADMIN")
      ) {
        return res.status(403).json({ error: "Not authorized" });
      }

      let queryStr = `UPDATE stores SET name = $1, description = $2`;
      const params = [name, description];

      if (userRoles.includes("ADMIN") && owner_id) {
        queryStr += `, owner_id = $3 WHERE id = $4`;
        params.push(owner_id, id);
      } else {
        queryStr += ` WHERE id = $3`;
        params.push(id);
      }

      const result = await query(queryStr + " RETURNING *", params);
      res.json(result.rows[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  static async deleteStore(req: any, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user.id || req.user.userId;
      const userRoles = req.user.roles || [];

      // Check ownership or admin
      const storeCheck = await query(
        `SELECT owner_id FROM stores WHERE id = $1`,
        [id],
      );
      if (storeCheck.rows.length === 0)
        return res.status(404).json({ error: "Store not found" });

      if (
        storeCheck.rows[0].owner_id !== userId &&
        !userRoles.includes("ADMIN")
      ) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await query(`DELETE FROM stores WHERE id = $1`, [id]);
      res.json({ message: "Store deleted" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  static async listUsers(req: any, res: Response) {
    try {
      // Security: Only Admin can list users for assignment
      if (!req.user.roles.includes("ADMIN")) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const result = await query(
        `SELECT id, name, email FROM users ORDER BY name ASC`,
      );
      res.json({ users: result.rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  static async getPublicStores(req: Request, res: Response) {
    try {
      const result = await query(
        `SELECT id, name FROM stores ORDER BY name ASC`,
      );
      res.json({ stores: result.rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
}
