import { Request, Response } from "express";
import { query } from "../config/db";

export class UserController {
  static async listAllUsers(req: any, res: Response) {
    try {
      // Only SYSTEM role can see full user management
      if (!req.user?.roles?.includes("SYSTEM")) {
        return res
          .status(403)
          .json({ error: "Acceso restringido a Administradores del Sistema" });
      }

      const result = await query(`
                SELECT id, name, email, status, roles, created_at 
                FROM users 
                ORDER BY created_at DESC
            `);

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

      res.json({
        message: `${userIds.length} usuarios activados correctamente`,
      });
    } catch (error) {
      console.error("Activate Users Error:", error);
      res.status(500).json({ error: "Error al activar usuarios" });
    }
  }
}
