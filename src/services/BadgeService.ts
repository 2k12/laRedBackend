import { query } from "../config/db";
import { CacheService, CACHE_TTL } from "../utils/cache";

export class BadgeService {
  // Evaluate all badges for a user
  static async evaluateBadges(userId: string) {
    try {
      console.log(`🔍 Evaluating badges for user: ${userId}`);

      // 1. Fetch current user stats
      const stats = await this.getUserStats(userId);

      // 2. Fetch all potential badges (not yet earned)
      const potentialBadges = await query(
        `SELECT * FROM badges WHERE id NOT IN (SELECT badge_id FROM user_badges WHERE user_id = $1)`,
        [userId],
      );

      const awarded: string[] = [];

      // 3. Check criteria
      for (const badge of potentialBadges.rows) {
        let earned = false;

        switch (badge.criteria_type) {
          case "SALES_COUNT":
            earned = stats.salesCount >= badge.criteria_value;
            break;
          case "PL_BALANCE":
            earned = stats.balance >= badge.criteria_value;
            break;
          case "GHOST_FIND_COUNT":
            earned = stats.ghostFinds >= badge.criteria_value;
            break;
          case "ITEM_COUNT":
            earned = stats.itemCount >= badge.criteria_value;
            break;
          case "REFERRAL_COUNT":
            earned = stats.referrals >= badge.criteria_value;
            break;
          case "DONATION_COUNT":
            earned = stats.donations >= badge.criteria_value;
            break;
          case "EARLY_ADOPTER":
            earned = stats.isFounder;
            break;
          case "VERIFIED":
            earned = stats.isVerified;
            break;
          case "MANUAL":
            // Handled manually
            break;
        }

        if (earned) {
          await this.awardBadge(userId, badge.id);
          awarded.push(badge.name);
        }
      }

      if (awarded.length > 0) {
        console.log(
          `✅ Awarded ${awarded.length} badges to ${userId}: ${awarded.join(", ")}`,
        );
        await this.invalidateCache(userId);
      }

      return awarded;
    } catch (error) {
      console.error("❌ Error evaluating badges:", error);
      return [];
    }
  }

  // Helper to get all stats in one go (or efficient queries)
  private static async getUserStats(userId: string) {
    // Sales Count
    const salesRes = await query(
      `SELECT count(*) as count FROM orders o JOIN stores s ON o.store_id = s.id WHERE s.owner_id = $1 AND o.status = 'DELIVERED'`,
      [userId],
    );

    // PL Balance (Coins)
    const balanceRes = await query(
      `SELECT count(*) as balance FROM coins WHERE wallet_id = (SELECT id FROM wallets WHERE user_id = $1) AND status = 'ACTIVE'`,
      [userId],
    );

    // Ghost Finds (Orders of products marked as ghost drops)
    const ghostRes = await query(
      `SELECT count(*) as count FROM orders o JOIN products p ON o.product_id = p.id WHERE o.buyer_id = $1 AND p.is_ghost_drop = true`,
      [userId],
    );

    // Item Count (Products listed in store)
    const itemsRes = await query(
      `SELECT count(*) as count FROM products p JOIN stores s ON p.store_id = s.id WHERE s.owner_id = $1`,
      [userId],
    );

    // Referrals (Safe check)
    let referrals = 0;
    try {
      const refRes = await query(
        `SELECT count(*) as count FROM users WHERE referred_by = $1`,
        [userId],
      );
      referrals = parseInt(refRes.rows[0]?.count || "0");
    } catch (e) {
      // Column referred_by might not exist yet
    }

    // Donations (Safe check)
    let donations = 0;
    try {
      const donateRes = await query(
        `SELECT SUM(amount) as total FROM transactions t 
                 JOIN wallets w ON t.from_wallet_id = w.id 
                 WHERE w.user_id = $1 AND t.type = 'DONATION'`,
        [userId],
      );
      donations = parseInt(donateRes.rows[0]?.total || "0");
    } catch (e) {
      // Transaction type DONATION might not exist yet
    }

    // Founder & Verified Check
    const userStatusRes = await query(
      `SELECT created_at, utn_id FROM users WHERE id = $1`,
      [userId],
    );
    const createdAt = new Date(userStatusRes.rows[0]?.created_at);
    const founderDeadline = new Date("2026-03-01T00:00:00Z");
    const isFounder = createdAt < founderDeadline;

    // Verified Status (Has UTN ID linked)
    const isVerified = !!userStatusRes.rows[0]?.utn_id;

    return {
      salesCount: parseInt(salesRes.rows[0]?.count || "0"),
      balance: parseInt(balanceRes.rows[0]?.balance || "0"),
      ghostFinds: parseInt(ghostRes.rows[0]?.count || "0"),
      itemCount: parseInt(itemsRes.rows[0]?.count || "0"),
      referrals: referrals,
      donations: donations,
      isFounder,
      isVerified,
    };
  }

  // Award a specific badge
  static async awardBadge(userId: string, badgeId: string) {
    try {
      await query(
        `INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, badgeId],
      );
      await this.invalidateCache(userId);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  // Cache invalidation
  static async invalidateCache(userId: string) {
    await CacheService.delete(`user:badges:${userId}`);
    await CacheService.delete(`user:profile:${userId}`);
    await CacheService.delete(`badges:all`);
  }
}
