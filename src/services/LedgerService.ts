import { query } from "../config/db";
import { Transaction, Wallet, Coin } from "../models/types";
import crypto from "crypto";

export class LedgerService {
  private calculateHash(prevHash: string, data: any): string {
    const str = prevHash + JSON.stringify(data);
    return crypto.createHash("sha256").update(str).digest("hex");
  }

  async getWallet(walletId: string): Promise<Wallet | null> {
    const res = await query("SELECT * FROM wallets WHERE id = $1", [walletId]);
    return res.rows[0] || null;
  }

  // Get Balance by counting active coins
  async getBalance(walletId: string): Promise<number> {
    const res = await query(
      "SELECT COUNT(*) FROM coins WHERE wallet_id = $1 AND status = $2",
      [walletId, "ACTIVE"],
    );
    return parseInt(res.rows[0].count);
  }

  async createWallet(userId: string): Promise<Wallet> {
    const res = await query(
      "INSERT INTO wallets (user_id, currency_symbol) VALUES ($1, $2) RETURNING *",
      [userId, "PL"],
    );
    return res.rows[0];
  }

  // Minting: Now creates N RECORDS in the coins table
  async mintTokens(
    toWalletId: string,
    amount: number,
    referenceId?: string,
  ): Promise<Transaction> {
    const lastTxRes = await query(
      "SELECT hash FROM transactions ORDER BY created_at DESC LIMIT 1",
    );
    const prevHash = lastTxRes.rows[0]?.hash || "0".repeat(64);

    const txData = {
      from_wallet_id: null,
      to_wallet_id: toWalletId,
      amount,
      type: "MINT",
      reference_id: referenceId,
      timestamp: new Date().toISOString(),
    };

    const hash = this.calculateHash(prevHash, txData);
    const client = await (await import("../config/db")).default.connect();

    try {
      await client.query("BEGIN");

      // 1. Create N Coins (Batch Insert for performance)
      // Note: For huge amounts (e.g. 1 million), this should be chunked.
      // For this demo (1000s), a loop or single query is fine.
      // We will perform a loop for simplicity but strictly ensuring we create 'amount' records.

      const batchId = `MINT_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Efficient Batch Insert
      let valueString = "";
      const params = [toWalletId, batchId];

      // Warning: Postgres has a limit on parameters (65535).
      // If amount > 10000, we need to batch. Assuming amount < 5000 for this demo context.
      for (let i = 0; i < amount; i++) {
        await client.query(
          `INSERT INTO coins (wallet_id, mint_batch_id, status) VALUES ($1, $2, 'ACTIVE')`,
          [toWalletId, batchId],
        );
      }

      // 2. Insert Transaction
      const txRes = await client.query(
        `INSERT INTO transactions 
        (from_wallet_id, to_wallet_id, amount, type, reference_id, previous_hash, hash) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [null, toWalletId, amount, "MINT", referenceId, prevHash, hash],
      );
      const txId = txRes.rows[0].id;

      // 3. Record History for each new coin
      // We know we just inserted 'amount' coins with this batchId.
      // To get their IDs for history, we could fetch them or return them.
      // Easiest is to select them by batchId.
      const newCoins = await client.query(
        `SELECT id FROM coins WHERE mint_batch_id = $1`,
        [batchId],
      );

      for (const coin of newCoins.rows) {
        await client.query(
          `INSERT INTO coin_history (coin_id, transaction_id, from_wallet_id, to_wallet_id, action, reason)
               VALUES ($1, $2, $3, $4, 'MINT', $5)`,
          [coin.id, txId, null, toWalletId, "Minted by System"],
        );
      }

      await client.query("COMMIT");
      return txRes.rows[0];
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async transferTokens(
    fromWalletId: string,
    toWalletId: string,
    amount: number,
    referenceId?: string,
  ): Promise<Transaction> {
    const client = await (await import("../config/db")).default.connect();

    try {
      await client.query("BEGIN");

      // 1. Find 'amount' active coins from sender
      const coinsRes = await client.query(
        `SELECT id FROM coins WHERE wallet_id = $1 AND status = 'ACTIVE' LIMIT $2 FOR UPDATE`,
        [fromWalletId, amount],
      );

      if (coinsRes.rows.length < amount) {
        throw new Error(
          `Insufficient funds. Available: ${coinsRes.rows.length}, Required: ${amount}`,
        );
      }

      const coinIds = coinsRes.rows.map((c) => c.id);

      // 2. Move coins to receiver
      // We update the owner_id of these specific coins
      await client.query(
        `UPDATE coins SET wallet_id = $1 WHERE id = ANY($2::uuid[])`,
        [toWalletId, coinIds],
      );

      // 3. Record Transaction
      const lastTxRes = await query(
        "SELECT hash FROM transactions ORDER BY created_at DESC LIMIT 1",
      );
      const prevHash = lastTxRes.rows[0]?.hash || "0".repeat(64);

      const txData = {
        from_wallet_id: fromWalletId,
        to_wallet_id: toWalletId,
        amount,
        type: "TRANSFER",
        reference_id: referenceId,
        coins_included: coinIds, // Optional data
        timestamp: new Date().toISOString(),
      };

      const hash = this.calculateHash(prevHash, txData);

      const txRes = await client.query(
        `INSERT INTO transactions 
        (from_wallet_id, to_wallet_id, amount, type, reference_id, previous_hash, hash) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          fromWalletId,
          toWalletId,
          amount,
          "TRANSFER",
          referenceId,
          prevHash,
          hash,
        ],
      );
      const txId = txRes.rows[0].id;

      // 4. Record Traceability Logic
      for (const coinId of coinIds) {
        await client.query(
          `INSERT INTO coin_history (coin_id, transaction_id, from_wallet_id, to_wallet_id, action, reason)
               VALUES ($1, $2, $3, $4, 'TRANSFER', $5)`,
          [coinId, txId, fromWalletId, toWalletId, referenceId || "Transfer"],
        );
      }

      await client.query("COMMIT");
      return txRes.rows[0];
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
