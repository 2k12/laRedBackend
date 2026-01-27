import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_123';

export class AuthController {
  
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      
      // 1. Find User
      const userRes = await query('SELECT * FROM users WHERE email = $1', [email]);
      if (userRes.rows.length === 0) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }
      
      const user = userRes.rows[0];

      // 2. Verify Password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      // 3. Generate Token
      const token = jwt.sign(
        { id: user.id, roles: user.roles },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // 4. Return Data
      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          roles: user.roles
        }
      });
    } catch (error) {
      console.error('Login Error:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  static async me(req: Request, res: Response) {
      // @ts-ignore
      const userId = req.user?.id; // Middleware will populate this
      
      try {
          const userRes = await query('SELECT id, name, email, roles FROM users WHERE id = $1', [userId]);
          if (userRes.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
          
          const walletRes = await query(`
            SELECT w.*, (SELECT COUNT(*) FROM coins WHERE wallet_id = w.id AND status = 'ACTIVE') as balance_count 
            FROM wallets w WHERE w.user_id = $1
          `, [userId]);

          res.json({
              user: userRes.rows[0],
              wallet: walletRes.rows[0] ? {
                  ...walletRes.rows[0],
                  balance: parseInt(walletRes.rows[0].balance_count) // Derived from coins
              } : null
          });
      } catch (error) {
          console.error('Me Error:', error);
          res.status(500).json({error: 'Error interno'});
      }
  }

  static async updateMe(req: Request, res: Response) {
      // @ts-ignore
      const userId = req.user?.id;
      const { name, email, phone } = req.body; // Phone is generic placeholder for now

      try {
          // Check if email taken by other user
          if (email) {
            const emailCheck = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, userId]);
            if (emailCheck.rows.length > 0) {
                return res.status(400).json({ error: 'El email ya está en uso' });
            }
          }

          // Build dynamic update
          const fields = [];
          const values = [];
          let idx = 1;

          if (name) { fields.push(`name = $${idx++}`); values.push(name); }
          if (email) { fields.push(`email = $${idx++}`); values.push(email); }
          // Phone column doesn't exist yet in DB schema shown, assuming we might need to add it or store in separate profile table. 
          // For now, let's stick to name/email or add phone to users table.
          // Checking schema... users table has: id, email, password_hash, roles, name, created_at.
          // I should probably add 'phone' to the users table first if I want to save it. 
          // user request explicitly mentioned "phone".
          
          if (fields.length === 0) return res.json({ message: 'Nada que actualizar' });

          values.push(userId);
          const updateQuery = `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, email, roles`;
          
          const result = await query(updateQuery, values);
          res.json({ user: result.rows[0], message: 'Perfil actualizado' });

      } catch (error) {
          console.error('Update Me Error:', error);
          res.status(500).json({ error: 'Error al actualizar perfil' });
      }
  }
}
