import { Request, Response } from 'express';
import { query } from '../config/db';

export class CoinsController {

  static async getMyCoins(req: Request, res: Response) {
    // @ts-ignore
    const userId = req.user?.userId;

    try {
      // 1. Check if we want vault balance (Treasury)
      const isVault = req.query.vault === 'true';
      const TREASURY_WALLET_ID = '11111111-1111-1111-1111-111111111111';
      
      let walletId: string;

      if (isVault) {
          // Verify Admin for Vault Access
          // @ts-ignore
          const userRoles = req.user?.roles || [];
          if (!userRoles.includes('ADMIN')) {
              return res.status(403).json({ error: 'No tienes permiso para ver la Bóveda' });
          }
          
          // Get Physical Balance
          const physicalRes = await query("SELECT COUNT(*) as total FROM coins WHERE wallet_id = $1 AND status = 'ACTIVE'", [TREASURY_WALLET_ID]);
          const physical = parseInt(physicalRes.rows[0].total);

          // Get Committed Balance
          const committedRes = await query("SELECT SUM(remaining_budget) as total FROM reward_events WHERE is_active = TRUE");
          const committed = parseInt(committedRes.rows[0].total || '0');

          return res.json({
              total: physical,
              physical,
              committed,
              available: physical - committed
          });
      } else {
          // Standard User Wallet
          const walletRes = await query('SELECT id FROM wallets WHERE user_id = $1', [userId]);
          if (walletRes.rows.length === 0) return res.json({ total: 0, coins: [] });
          walletId = walletRes.rows[0].id;
      }

      // Get Coins
      const coinsRes = await query(`
        SELECT * FROM coins 
        WHERE wallet_id = $1 
        ORDER BY created_at DESC
        LIMIT 1000 -- Cap for performance for now
      `, [walletId]);

      // Group coins into "batches" for visualization if needed, or just return raw
      res.json({ 
        total: coinsRes.rows.length,
        coins: coinsRes.rows 
      });

    } catch (error) {
      console.error('Get Coins Error:', error);
      res.status(500).json({ error: 'Error al obtener monedas' });
    }
  }
}
