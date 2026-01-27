import { Request, Response } from 'express';
import { query } from '../config/db';
import { LedgerService } from '../services/LedgerService';
import jwt from 'jsonwebtoken';
import { BRANDING } from '../config/branding';

const ledgerService = new LedgerService();
const TREASURY_WALLET_ID = '11111111-1111-1111-1111-111111111111';

export class RewardController {

    static async createEvent(req: any, res: Response) {
        try {
            // Verify Admin
            const userRoles = req.user?.roles || [];
            if (!userRoles.includes('ADMIN')) {
                return res.status(403).json({ error: 'Require Admin Role' });
            }

            const { name, description, reward_amount, total_budget, expires_at } = req.body;
            
            if (!name || !reward_amount || !total_budget) {
                return res.status(400).json({ error: 'Nombre, recompensa y presupuesto total son requeridos' });
            }

            // --- Validation: Check Vault Balance (Net available) ---
            const vaultBalanceRes = await query(
                "SELECT COUNT(*) as balance FROM coins WHERE wallet_id = $1 AND status = 'ACTIVE'",
                [TREASURY_WALLET_ID]
            );
            const physicalBalance = parseInt(vaultBalanceRes.rows[0].balance);

            // Sum of remaining_budget of all ACTIVE events
            const committedRes = await query(
                "SELECT SUM(remaining_budget) as total FROM reward_events WHERE is_active = TRUE"
            );
            const committedBalance = parseInt(committedRes.rows[0].total || '0');

            const netAvailable = physicalBalance - committedBalance;

            if (total_budget > netAvailable) {
                return res.status(400).json({ 
                    error: `Presupuesto insuficiente. Fondos en Bóveda: ${physicalBalance}, Comprometidos en otros eventos: ${committedBalance}. Disponible neto: ${netAvailable} ${BRANDING.currencySymbol}.`,
                    physical: physicalBalance,
                    committed: committedBalance,
                    available: netAvailable
                });
            }
            // ------------------------------------------------------

            const secret_key = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

            const result = await query(
                `INSERT INTO reward_events (name, description, reward_amount, total_budget, remaining_budget, secret_key, expires_at)
                 VALUES ($1, $2, $3, $4, $4, $5, $6) RETURNING *`,
                [name, description, reward_amount, total_budget, secret_key, expires_at]
            );

            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Create Event Error:', error);
            res.status(500).json({ error: 'Error al crear el evento' });
        }
    }

    static async toggleEventStatus(req: any, res: Response) {
        try {
            const userRoles = req.user?.roles || [];
            if (!userRoles.includes('ADMIN')) {
                return res.status(403).json({ error: 'Require Admin Role' });
            }

            const { id } = req.params;
            const { is_active } = req.body;

            const result = await query(
                'UPDATE reward_events SET is_active = $1 WHERE id = $2 RETURNING *',
                [is_active, id]
            );

            if (result.rows.length === 0) return res.status(404).json({ error: 'Evento no encontrado' });
            
            res.json({ 
                message: is_active ? 'Evento reactivado' : 'Evento finalizado. Fondos liberados para el presupuesto neto.',
                event: result.rows[0] 
            });
        } catch (error) {
            console.error('Toggle Event Status Error:', error);
            res.status(500).json({ error: 'Error al actualizar el estado del evento' });
        }
    }

    static async getEvents(req: any, res: Response) {
        try {
            const result = await query(`
                SELECT id, name, description, reward_amount, total_budget, remaining_budget, is_active, created_at, expires_at 
                FROM reward_events 
                ORDER BY created_at DESC
            `);
            res.json(result.rows);
        } catch (error) {
            console.error('Get Events Error:', error);
            res.status(500).json({ error: 'Error al obtener eventos' });
        }
    }

    static async deleteEvent(req: any, res: Response) {
        try {
            const userRoles = req.user?.roles || [];
            if (!userRoles.includes('ADMIN')) {
                return res.status(403).json({ error: 'Require Admin Role' });
            }

            const { id } = req.params;
            await query('DELETE FROM reward_events WHERE id = $1', [id]);
            res.json({ message: 'Evento eliminado correctamente' });
        } catch (error) {
            console.error('Delete Event Error:', error);
            res.status(500).json({ error: 'Error al eliminar el evento' });
        }
    }

    static async generateToken(req: any, res: Response) {
        try {
            const { eventId } = req.params;
            const eventRes = await query('SELECT * FROM reward_events WHERE id = $1', [eventId]);
            
            if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Evento no encontrado' });
            const event = eventRes.rows[0];

            if (!event.is_active) return res.status(400).json({ error: 'El evento no está activo' });

            // Generate a token that expires in 60 seconds
            const token = jwt.sign(
                { eventId: event.id, iat: Math.floor(Date.now() / 1000) },
                event.secret_key,
                { expiresIn: '60s' }
            );

            res.json({ token, expires_in: 60 });
        } catch (error) {
            console.error('Generate Token Error:', error);
            res.status(500).json({ error: 'Error al generar el token' });
        }
    }

    static async claimReward(req: any, res: Response) {
        try {
            const { eventId, token } = req.body;
            // @ts-ignore
            const userId = req.user?.id;

            if (!eventId || !token) {
                return res.status(400).json({ error: 'EventID y Token son requeridos' });
            }

            // 1. Get Event
            const eventRes = await query('SELECT * FROM reward_events WHERE id = $1', [eventId]);
            if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Evento no encontrado' });
            const event = eventRes.rows[0];

            // 2. Validate Event
            if (!event.is_active) return res.status(400).json({ error: 'Este vínculo ha expirado o el evento está inactivo' });
            
            if (event.remaining_budget < event.reward_amount) {
                return res.status(400).json({ error: 'Se ha agotado el presupuesto de este evento' });
            }

            // 3. Verify Token
            try {
                // Add a small clock tolerance (e.g. 10 seconds) to compensate for network latency
                jwt.verify(token, event.secret_key, { clockTolerance: 10 });
            } catch (err) {
                return res.status(401).json({ error: 'El código QR ha expirado. Por favor, escanea el código actualizado.' });
            }

            // 4. Check if user already claimed
            const claimCheck = await query('SELECT * FROM reward_claims WHERE event_id = $1 AND user_id = $2', [eventId, userId]);
            if (claimCheck.rows.length > 0) {
                return res.status(400).json({ error: 'Ya has reclamado la recompensa de este evento' });
            }

            // 5. Get User Wallet
            const walletRes = await query('SELECT id FROM wallets WHERE user_id = $1', [userId]);
            if (walletRes.rows.length === 0) return res.status(404).json({ error: 'Cartera de usuario no encontrada' });
            const userWalletId = walletRes.rows[0].id;

            // 6. Execute Transfer
            try {
                // Perform the coin transfer using LedgerService
                await ledgerService.transferTokens(
                    TREASURY_WALLET_ID,
                    userWalletId,
                    event.reward_amount,
                    `EVENT_REWARD: ${event.name}`
                );

                // 7. Record Claim and Update Budget Atomically
                // LedgerService already uses its own client. Let's use it for the local update too to be safe.
                await query('BEGIN');
                await query(
                    'UPDATE reward_events SET remaining_budget = remaining_budget - $1 WHERE id = $2',
                    [event.reward_amount, eventId]
                );
                await query(
                    'INSERT INTO reward_claims (event_id, user_id) VALUES ($1, $2)',
                    [eventId, userId]
                );
                await query('COMMIT');

                res.json({ 
                    success: true, 
                    amount: event.reward_amount,
                    message: `¡Recompensa reclamada! Has recibido ${event.reward_amount} pulsos.`
                });

            } catch (transferError: any) {
                await query('ROLLBACK');
                console.error('Reward Transfer Error:', transferError);
                res.status(500).json({ error: transferError.message || 'Error al procesar la transferencia de la recompensa' });
            }

        } catch (error) {
            console.error('Claim Reward Error:', error);
            res.status(500).json({ error: 'Error interno al procesar el reclamo' });
        }
    }
}
