import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    connectTimeout: 5000,
    reconnectStrategy: (retries) => {
      if (retries > 5) return false;
      return 1000;
    },
  },
});

redisClient.on("error", (err) => {
  // Silent connection errors to avoid crashing or hanging logs
  if (err.name !== "ConnectionTimeoutError") {
    console.warn("Redis Info:", err.message);
  }
});

redisClient.on("connect", () => console.log("Redis Status: Connected"));
redisClient.on("ready", () => console.log("Redis Status: Ready"));

// This will be called by CacheService or RateLimit only when needed
export const ensureRedisConnection = async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (e) {
    // Silently fail, caching will be skipped by readiness checks
  }
};

export default redisClient;
