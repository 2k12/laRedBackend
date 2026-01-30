import { Request, Response } from "express";
import { query } from "../config/db";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { CacheService, CACHE_TTL } from "../utils/cache";

export class EconomyController {
  // --- Configuration ---
  static async getConfig(req: Request, res: Response) {
    try {
      const cacheKey = "economy:config";
      const cached = await CacheService.get(cacheKey);
      if (cached) return res.json(cached);

      const result = await query("SELECT * FROM economy_config");
      const config: Record<string, string> = {};
      result.rows.forEach((row) => {
        config[row.key] = row.value;
      });

      await CacheService.set(cacheKey, config, CACHE_TTL.LONG);
      res.json(config);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  static async updateConfig(req: any, res: Response) {
    try {
      // Verify Admin
      const userRoles = req.user?.roles || [];
      if (!userRoles.includes("ADMIN")) {
        return res.status(403).json({ error: "Require Admin Role" });
      }

      const { configs } = req.body; // { "MAX_PRODUCT_PRICE_CAP": "1200", ... }
      if (!configs) return res.status(400).json({ error: "Configs required" });

      const promises = Object.entries(configs).map(([key, value]) => {
        return query(
          `INSERT INTO economy_config (key, value) VALUES ($1, $2) 
                     ON CONFLICT (key) DO UPDATE SET value = $2`,
          [key, value],
        );
      });

      await Promise.all(promises);

      // Invalidate Cache
      await CacheService.delete("economy:config");

      res.json({ message: "Configuration updated" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // --- Minting Logic (Refactored for Treasury System) ---

  // Step 1: Mint to Treasury -> Step 2: Distribute to Users
  static async triggerSemesterMinting(req: any, res: Response) {
    try {
      // Verify Admin
      const userRoles = req.user?.roles || [];
      if (!userRoles.includes("ADMIN")) {
        return res.status(403).json({ error: "Require Admin Role" });
      }

      const { semester } = req.body;
      const TREASURY_WALLET_ID = "11111111-1111-1111-1111-111111111111";

      // 1. Get Configs for Roles
      const configResult = await query(
        "SELECT * FROM economy_config WHERE key LIKE 'ROLE_MINT_%'",
      );
      const roleLimits: Record<string, number> = {};
      configResult.rows.forEach((r) => {
        const roleName = r.key.replace("ROLE_MINT_", "");
        roleLimits[roleName] = parseInt(r.value);
      });

      // 2. Calculate Total Needed
      const usersResult = await query(
        `
                SELECT u.id as user_id, u.roles, w.id as wallet_id 
                FROM users u
                LEFT JOIN wallets w ON u.id = w.user_id
                WHERE w.id IS NOT NULL AND w.id != $1
             `,
        [TREASURY_WALLET_ID],
      );

      let totalNeeded = 0;
      const distributionPlan: { walletId: string; amount: number }[] = [];

      for (const user of usersResult.rows) {
        const roles = user.roles || [];
        let maxAmount = 0;
        for (const role of roles) {
          if (roleLimits[role])
            maxAmount = Math.max(maxAmount, roleLimits[role]);
        }
        if (maxAmount === 0 && roleLimits["ESTUDIANTE"])
          maxAmount = roleLimits["ESTUDIANTE"];

        if (maxAmount > 0) {
          distributionPlan.push({
            walletId: user.wallet_id,
            amount: maxAmount,
          });
          totalNeeded += maxAmount;
        }
      }

      console.log(
        `Economy Plan: Need ${totalNeeded} PL for ${distributionPlan.length} users.`,
      );

      // 3. MINT to Treasury (New Money Creation)
      // Insert 'totalNeeded' coins into Treasury Wallet
      const batchId = `MINT_SEM_${semester}_TREASURY`;
      await query(
        `
                INSERT INTO coins (wallet_id, mint_batch_id, status)
                SELECT $1, $2, 'ACTIVE'
                FROM generate_series(1, $3)
             `,
        [TREASURY_WALLET_ID, batchId, totalNeeded],
      );

      // Log Mint Transaction
      await query(
        `
                INSERT INTO transactions (to_wallet_id, amount, type, reference_id, previous_hash, hash)
                VALUES ($1, $2, 'MINT_TREASURY', $3, 'GENESIS', md5(random()::text))
             `,
        [TREASURY_WALLET_ID, totalNeeded, batchId],
      );

      // 4. DISTRIBUTE - DISABLED BY POLICY
      // Funds remain in Treasury (1111...) until explicitly moved by grants or purchases.
      /*
             let distributedCount = 0;
             ... distribution logic skipped ...
             */

      res.json({
        message:
          "Semester minting completed. Funds stored in Treasury Reserve.",
        total_minted: totalNeeded,
        distributed: 0,
        treasury_balance_increase: totalNeeded,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // --- NEW: Manual Minting with Password Check ---
  static async manualMint(req: any, res: Response) {
    try {
      const { amount, concept, password } = req.body;
      const userId = req.user.id;
      const minAmount = 1;

      // 1. Verify Admin Role
      const userRoles = req.user?.roles || [];
      if (!userRoles.includes("ADMIN")) {
        return res.status(403).json({ error: "Require Admin Role" });
      }

      // 2. Verify Password
      const userRes = await query(
        "SELECT password_hash FROM users WHERE id = $1",
        [userId],
      );
      if (userRes.rows.length === 0)
        return res.status(404).json({ error: "User not found" });

      const validPass = await bcrypt.compare(
        password,
        userRes.rows[0].password_hash,
      );
      if (!validPass) {
        return res.status(401).json({ error: "Password incorrect" });
      }

      // 3. Execute Minting to Treasury
      const TREASURY_WALLET_ID = "11111111-1111-1111-1111-111111111111";
      const batchId = `MINT_MANUAL_${Date.now()}`;

      await query(
        `
                INSERT INTO coins (wallet_id, mint_batch_id, status)
                SELECT $1, $2, 'ACTIVE'
                FROM generate_series(1, $3)
            `,
        [TREASURY_WALLET_ID, batchId, amount],
      );

      // 4. Log Transaction
      await query(
        `
               INSERT INTO transactions (to_wallet_id, amount, type, reference_id, previous_hash, hash)
               VALUES ($1, $2, 'MINT_MANUAL', $3, 'GENESIS', md5(random()::text))
            `,
        [TREASURY_WALLET_ID, amount, concept || batchId],
      );

      res.json({
        message: "Minting Successful",
        minted_amount: amount,
        target: "TREASURY",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
}
