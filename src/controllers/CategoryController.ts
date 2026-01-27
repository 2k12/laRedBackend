import { Request, Response } from 'express';
import { query } from '../config/db';

export class CategoryController {
    
    static async getAllCategories(req: Request, res: Response) {
        try {
            const result = await query('SELECT * FROM categories ORDER BY name ASC');
            res.json(result.rows);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    static async updateCategoryFactor(req: any, res: Response) {
        try {
            const { id } = req.params;
            const { price_factor } = req.body;
            const userRoles = req.user?.roles || [];

            if (!userRoles.includes('SYSTEM')) {
                return res.status(403).json({ error: 'Unauthorized: SYSTEM role required' });
            }

            const result = await query(
                'UPDATE categories SET price_factor = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
                [parseFloat(price_factor), id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Category not found' });
            }

            res.json({
                message: 'Category factor updated successfully',
                category: result.rows[0]
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}
