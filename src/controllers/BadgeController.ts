import { Request, Response } from "express";
import { query } from "../config/db";

import { CacheService, CACHE_TTL } from "../utils/cache";
import { BadgeService } from "../services/BadgeService";

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
      const awarded = await BadgeService.evaluateBadges(userId);
      res.json({ message: "Badge engine executed", awarded });
    } catch (error) {
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

      const success = await BadgeService.awardBadge(userId, badgeId);

      if (!success) {
        return res.status(400).json({
          error: "El usuario ya tiene esta insignia o los IDs son inválidos",
        });
      }

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

      const results = await Promise.all(
        badgeIds.map((id) => BadgeService.awardBadge(userId, id)),
      );

      res.status(201).json({ message: "Insignias procesadas", results });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error en adjudicación masiva" });
    }
  }
}
