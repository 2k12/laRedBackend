import { Request, Response } from "express";
import { query } from "../config/db";

import { CacheService, CACHE_TTL } from "../utils/cache";

export class UserController {
  static async listAllUsers(req: any, res: Response) {
    try {
      // Only SYSTEM role can see full user management
      if (!req.user?.roles?.includes("SYSTEM")) {
        return res
          .status(403)
          .json({ error: "Acceso restringido a Administradores del Sistema" });
      }

      const cacheKey = "users:list";
      const cached = await CacheService.get(cacheKey);
      if (cached) return res.json({ users: cached });

      const result = await query(`
                SELECT id, name, email, status, roles, created_at 
                FROM users 
                ORDER BY created_at DESC
            `);

      await CacheService.set(cacheKey, result.rows, CACHE_TTL.SHORT);

      res.json({ users: result.rows });
    } catch (error) {
      console.error("List Users Error:", error);
      res.status(500).json({ error: "Error al obtener lista de usuarios" });
    }
  }

  static async activateUsers(req: any, res: Response) {
    try {
      if (!req.user?.roles?.includes("SYSTEM")) {
        return res.status(403).json({ error: "Acceso restringido" });
      }

      const { userIds } = req.body; // Array of IDs

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res
          .status(400)
          .json({ error: "Se requiere una lista de IDs de usuario" });
      }

      await query(
        `
                UPDATE users 
                SET status = 'ACTIVE' 
                WHERE id = ANY($1::uuid[])
            `,
        [userIds],
      );

      // Invalidate list
      await CacheService.delete("users:list");
      // Ideally invalidate profiles, but since we have an array, we can iterate or just let them expire if TTL is short.
      // For precision:
      for (const uid of userIds) {
        await CacheService.delete(`user:profile:${uid}`);
      }

      res.json({
        message: `${userIds.length} usuarios activados correctamente`,
      });
    } catch (error) {
      console.error("Activate Users Error:", error);
      res.status(500).json({ error: "Error al activar usuarios" });
    }
  }

  static async toggleUserStatus(req: any, res: Response) {
    try {
      if (!req.user?.roles?.includes("SYSTEM")) {
        return res.status(403).json({ error: "Acceso restringido" });
      }

      const { userId } = req.params;

      const userRes = await query("SELECT status FROM users WHERE id = $1", [
        userId,
      ]);
      if (userRes.rows.length === 0) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      const newStatus =
        userRes.rows[0].status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await query("UPDATE users SET status = $1 WHERE id = $2", [
        newStatus,
        userId,
      ]);

      // Invalidate Cache
      await CacheService.delete("users:list");
      await CacheService.delete(`user:profile:${userId}`);

      res.json({
        message: "Estado actualizado exitosamente",
        status: newStatus,
      });
    } catch (error) {
      console.error("Toggle Status Error:", error);
      res.status(500).json({ error: "Error al cambiar estado" });
    }
  }

  static async getUserProfile(req: any, res: Response) {
    try {
      if (!req.user?.roles?.includes("SYSTEM")) {
        return res.status(403).json({ error: "Acceso restringido" });
      }

      const { userId } = req.params;

      const cacheKey = `user:profile:${userId}`;
      const cached = await CacheService.get(cacheKey);
      if (cached) return res.json(cached);

      const userRes = await query(
        "SELECT id, name, email, roles, status, created_at, utn_id FROM users WHERE id = $1",
        [userId],
      );
      if (userRes.rows.length === 0)
        return res.status(404).json({ error: "Usuario no encontrado" });

      const walletRes = await query(
        `
            SELECT w.id, (SELECT COUNT(*) FROM coins WHERE wallet_id = w.id AND status = 'ACTIVE') as balance
            FROM wallets w WHERE w.user_id = $1
          `,
        [userId],
      );

      const responseData = {
        user: userRes.rows[0],
        wallet: walletRes.rows[0] || null,
      };

      await CacheService.set(cacheKey, responseData, CACHE_TTL.MEDIUM);

      res.json(responseData);
    } catch (error) {
      console.error("Get User Profile Error:", error);
      res.status(500).json({ error: "Error al obtener perfil" });
    }
  }

  static async updateRoles(req: any, res: Response) {
    try {
      if (!req.user?.roles?.includes("SYSTEM")) {
        return res.status(403).json({ error: "Acceso restringido" });
      }

      const { userId } = req.params;
      const { roles } = req.body;

      if (!roles || !Array.isArray(roles)) {
        return res.status(400).json({ error: "Roles inválidos" });
      }

      await query("UPDATE users SET roles = $1 WHERE id = $2", [roles, userId]);

      // Invalidate Cache
      await CacheService.delete("users:list");
      await CacheService.delete(`user:profile:${userId}`);

      res.json({ message: "Roles actualizados correctamente", roles });
    } catch (error) {
      console.error("Update Roles Error:", error);
      res.status(500).json({ error: "Error al actualizar roles" });
    }
  }

  static async linkUtnId(req: any, res: Response) {
    try {
      const userId = req.user?.id;
      const { utn_id } = req.body;

      if (!userId) return res.status(401).json({ error: "No autorizado" });
      if (!utn_id)
        return res
          .status(400)
          .json({ error: "Se requiere UTN ID (Código de Carnet)" });

      // Check if ID is already taken
      const existing = await query("SELECT id FROM users WHERE utn_id = $1", [
        utn_id,
      ]);
      if (existing.rows.length > 0) {
        return res
          .status(409)
          .json({ error: "Este carnet ya está vinculado a otra cuenta." });
      }

      // Link ID to user
      await query("UPDATE users SET utn_id = $1 WHERE id = $2", [
        utn_id,
        userId,
      ]);

      // Invalidate profiles
      await CacheService.delete(`user:profile:${userId}`);
      await CacheService.delete("users:list");

      // Verify success/return updated user
      const userRes = await query(
        "SELECT id, name, email, roles, utn_id FROM users WHERE id = $1",
        [userId],
      );

      res.json({
        message: "Carnet vinculado exitosamente",
        user: userRes.rows[0],
      });
    } catch (error) {
      console.error("Link UTN ID Error:", error);
      res.status(500).json({ error: "Error al vincular carnet" });
    }
  }
}
