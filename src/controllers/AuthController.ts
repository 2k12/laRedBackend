import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../config/db";
import { LedgerService } from "../services/LedgerService";
import { CacheService, CACHE_TTL } from "../utils/cache";

const ledgerService = new LedgerService();

const JWT_SECRET = process.env.JWT_SECRET || "secret_key_123";

export class AuthController {
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      // 1. Find User
      const userRes = await query("SELECT * FROM users WHERE email = $1", [
        email,
      ]);
      if (userRes.rows.length === 0) {
        return res.status(401).json({ error: "Credenciales inválidas" });
      }

      const user = userRes.rows[0];

      // 2. Verify Password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: "Credenciales inválidas" });
      }

      // 2.1 Check Status
      if (user.status === "INACTIVE") {
        return res.status(403).json({
          error: "Cuenta pendiente de activación",
          status: "INACTIVE",
        });
      }

      // 3. Generate Token
      const token = jwt.sign({ id: user.id, roles: user.roles }, JWT_SECRET, {
        expiresIn: "24h",
      });

      // 4. Return Data
      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          roles: user.roles,
          status: user.status,
        },
      });
    } catch (error) {
      console.error("Login Error:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }

  static async logout(req: Request, res: Response) {
    try {
      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1];

      if (token) {
        const decoded: any = jwt.decode(token);
        if (decoded && decoded.exp) {
          const now = Math.floor(Date.now() / 1000);
          const ttl = decoded.exp - now;
          if (ttl > 0) {
            await CacheService.set(`blacklist:${token}`, "true", ttl);
          }
        }
      }

      res.json({ message: "Sesión cerrada correctamente" });
    } catch (error) {
      console.error("Logout Error:", error);
      res.status(500).json({ error: "Error al cerrar sesión" });
    }
  }

  static async me(req: Request, res: Response) {
    // @ts-ignore
    const userId = req.user?.id;

    try {
      const userRes = await query(
        "SELECT id, name, email, roles, status, utn_id, phone FROM users WHERE id = $1",
        [userId],
      );
      if (userRes.rows.length === 0)
        return res.status(404).json({ error: "Usuario no encontrado" });

      const walletRes = await query(
        `
            SELECT w.*, (SELECT COUNT(*) FROM coins WHERE wallet_id = w.id AND status = 'ACTIVE') as balance_count 
            FROM wallets w WHERE w.user_id = $1
          `,
        [userId],
      );

      res.json({
        user: userRes.rows[0],
        wallet: walletRes.rows[0]
          ? {
              ...walletRes.rows[0],
              balance: parseInt(walletRes.rows[0].balance_count), // Derived from coins
            }
          : null,
      });
    } catch (error) {
      console.error("Me Error:", error);
      res.status(500).json({ error: "Error interno" });
    }
  }

  static async updateMe(req: Request, res: Response) {
    // @ts-ignore
    const userId = req.user?.id;
    const { name, email, phone } = req.body; // Phone is generic placeholder for now

    try {
      // Check if email taken by other user
      if (email) {
        const emailCheck = await query(
          "SELECT id FROM users WHERE email = $1 AND id != $2",
          [email, userId],
        );
        if (emailCheck.rows.length > 0) {
          return res.status(400).json({ error: "El email ya está en uso" });
        }
      }

      // Build dynamic update
      const fields = [];
      const values = [];
      let idx = 1;

      if (name) {
        fields.push(`name = $${idx++}`);
        values.push(name);
      }
      if (email) {
        fields.push(`email = $${idx++}`);
        values.push(email);
      }
      if (phone) {
        fields.push(`phone = $${idx++}`);
        values.push(phone);
      }
      // Phone column doesn't exist yet in DB schema shown, assuming we might need to add it or store in separate profile table.
      // For now, let's stick to name/email or add phone to users table.
      // Checking schema... users table has: id, email, password_hash, roles, name, created_at.
      // I should probably add 'phone' to the users table first if I want to save it.
      // user request explicitly mentioned "phone".

      if (fields.length === 0)
        return res.json({ message: "Nada que actualizar" });

      values.push(userId);
      const updateQuery = `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id, name, email, roles`;

      const result = await query(updateQuery, values);

      // Invalidate Profile Cache
      await CacheService.delete(`user:profile:${userId}`);

      res.json({ user: result.rows[0], message: "Perfil actualizado" });
    } catch (error) {
      console.error("Update Me Error:", error);
      res.status(500).json({ error: "Error al actualizar perfil" });
    }
  }
  static async register(req: Request, res: Response) {
    try {
      const { name, email, password } = req.body;

      // 1. Check if user exists
      const existing = await query("SELECT id FROM users WHERE email = $1", [
        email,
      ]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: "El email ya está registrado" });
      }

      // 2. Hash Password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // 3. Create User (Standard role USER, Status INACTIVE)
      const result = await query(
        "INSERT INTO users (name, email, password_hash, roles, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, roles, status",
        [name, email, passwordHash, ["USER"], "ACTIVE"],
      );
      const newUser = result.rows[0];

      // 4. Create Wallet automatically
      await ledgerService.createWallet(newUser.id);

      // 5. Generate Token for Auto-Login
      const token = jwt.sign(
        { id: newUser.id, roles: newUser.roles },
        JWT_SECRET,
        {
          expiresIn: "24h",
        },
      );

      res.status(201).json({
        message: "Registro exitoso. Bienvenido a University Store.",
        user: newUser,
        token, // Return token for auto-login
      });
    } catch (error) {
      console.error("Register Error:", error);
      res.status(500).json({ error: "Error al registrar usuario" });
    }
  }

  static async updatePassword(req: Request, res: Response) {
    // @ts-ignore
    const userId = req.user?.id;
    const { currentPassword, newPassword } = req.body;

    try {
      // 1. Get current user
      const userRes = await query(
        "SELECT password_hash FROM users WHERE id = $1",
        [userId],
      );
      if (userRes.rows.length === 0)
        return res.status(404).json({ error: "Usuario no encontrado" });

      const user = userRes.rows[0];

      // 2. Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) {
        return res
          .status(400)
          .json({ error: "La contraseña actual es incorrecta" });
      }

      // 3. Hash and update new password
      const salt = await bcrypt.genSalt(10);
      const newPasswordHash = await bcrypt.hash(newPassword, salt);

      await query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        newPasswordHash,
        userId,
      ]);

      res.json({ message: "Contraseña actualizada correctamente" });
    } catch (error) {
      console.error("Update Password Error:", error);
      res.status(500).json({ error: "Error al actualizar contraseña" });
    }
  }
}
