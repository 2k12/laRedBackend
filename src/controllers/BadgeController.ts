import { Request, Response } from "express";
import { query } from "../config/db";

import { CacheService, CACHE_TTL } from "../utils/cache";

export class BadgeController {
  // 1. Get all available badges
  static async getAllBadges(req: Request, res: Response) {
    try {
      const cacheKey = "badges:all";
      const cached = await CacheService.get(cacheKey);
      if (cached) return res.json(cached);

      const result = await query("SELECT * FROM badges ORDER BY rarity DESC");

      await CacheService.set(cacheKey, result.rows, CACHE_TTL.LONG);
      res.json(result.rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // 2. Get badges for a specific user
  static async getUserBadges(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      const cacheKey = `user:badges:${userId}`;
      const cached = await CacheService.get(cacheKey);
      if (cached) return res.json(cached);

      const result = await query(
        `
                SELECT b.*, ub.created_at as earned_at
                FROM badges b
                JOIN user_badges ub ON b.id = ub.badge_id
                WHERE ub.user_id = $1
                ORDER BY ub.created_at DESC
            `,
        [userId],
      );

      await CacheService.set(cacheKey, result.rows, CACHE_TTL.MEDIUM);
      res.json(result.rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // 3. Evaluate and award badges (Badge Engine Trigger)
  static async checkAndAwardBadges(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const awarded = [];

      await query("BEGIN");

      // Criteria 1: SALES_COUNT (Vendedor Estrella)
      const salesRes = await query(
        `
                SELECT count(*) as count 
                FROM orders o
                JOIN stores s ON o.store_id = s.id
                WHERE s.owner_id = $1 AND o.status = 'DELIVERED'
            `,
        [userId],
      );
      const salesCount = parseInt(salesRes.rows[0].count);

      // Criteria 2: PL_BALANCE (Millonario)
      const balanceRes = await query(
        `
                SELECT count(*) as balance
                FROM coins
                WHERE wallet_id = (SELECT id FROM wallets WHERE user_id = $1)
                AND status = 'ACTIVE'
            `,
        [userId],
      );
      const balance = parseInt(balanceRes.rows[0].balance);

      // Get badges the user doesn't have yet
      const potentialBadges = await query(
        `
                SELECT * FROM badges 
                WHERE id NOT IN (SELECT badge_id FROM user_badges WHERE user_id = $1)
            `,
        [userId],
      );

      for (const badge of potentialBadges.rows) {
        let meetsCriteria = false;

        if (
          badge.criteria_type === "SALES_COUNT" &&
          salesCount >= badge.criteria_value
        ) {
          meetsCriteria = true;
        } else if (
          badge.criteria_type === "PL_BALANCE" &&
          balance >= badge.criteria_value
        ) {
          meetsCriteria = true;
        }

        if (meetsCriteria) {
          await query(
            "INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [userId, badge.id],
          );
          awarded.push(badge);
        }
      }

      await query("COMMIT");

      if (awarded.length > 0) {
        await CacheService.delete(`user:badges:${userId}`);
        await CacheService.delete(`user:profile:${userId}`);
      }

      res.json({ message: "Badge engine executed", awarded });
    } catch (error) {
      await query("ROLLBACK");
      console.error(error);
      res.status(500).json({ error: "Badge Engine Error" });
    }
  }

  // 4. Manually award a badge (Admin only)
  static async awardBadgeManually(req: any, res: Response) {
    try {
      const { userId, badgeId } = req.body;
      const isSystem = req.user.roles.includes("SYSTEM");

      if (!isSystem) {
        return res
          .status(403)
          .json({ error: "Se requieren privilegios de nivel SISTEMA" });
      }

      const result = await query(
        "INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *",
        [userId, badgeId],
      );

      if (result.rows.length === 0) {
        return res.status(400).json({
          error: "El usuario ya tiene esta insignia o los IDs son inválidos",
        });
      }

      // Invalidate Cache
      await CacheService.delete(`user:badges:${userId}`);
      await CacheService.delete(`user:profile:${userId}`);

      res.status(201).json({ message: "Insignia otorgada exitosamente" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error al otorgar insignia" });
    }
  }

  // 5. Bulk award badges (Admin SYSTEM only)
  static async awardBadgesBulk(req: any, res: Response) {
    try {
      const { userId, badgeIds } = req.body;
      const isSystem = req.user.roles.includes("SYSTEM");

      if (!isSystem) {
        return res.status(403).json({ error: "Privilegios insuficientes" });
      }

      if (!userId || !badgeIds || !Array.isArray(badgeIds)) {
        return res.status(400).json({ error: "Datos inválidos" });
      }

      await query("BEGIN");
      for (const badgeId of badgeIds) {
        await query(
          "INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [userId, badgeId],
        );
      }
      await query("COMMIT");

      await query("COMMIT");

      // Invalidate Cache
      await CacheService.delete(`user:badges:${userId}`);
      await CacheService.delete(`user:profile:${userId}`);

      res.status(201).json({ message: "Insignias otorgadas masivamente" });
    } catch (error) {
      await query("ROLLBACK");
      console.error(error);
      res.status(500).json({ error: "Error en adjudicación masiva" });
    }
  }
}
