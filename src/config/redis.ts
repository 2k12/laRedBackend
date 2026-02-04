import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    connectTimeout: 1000, // 1 second timeout for initial connection
    reconnectStrategy: (retries) => {
      // Very conservative reconnection
      if (retries > 5) return false;
      return 1000;
    },
  },
});

// CRITICAL: Error listener must be defined BEFORE any connection attempt
redisClient.on("error", (err) => {
  if (err.name === "ConnectionTimeoutError") {
    // Silent in logs to avoid cluttering Railway logs if Redis is missing
  } else {
    console.warn("Redis Info:", err.message);
  }
});

redisClient.on("connect", () => console.log("Redis Status: Connected"));
redisClient.on("ready", () => console.log("Redis Status: Ready"));

// Background connection attempt
(async () => {
  try {
    // We don't await this to avoid blocking the main thread/event loop during startup
    redisClient.connect().catch(() => {
      // Silently catch the initial connection failure
    });
  } catch (e) {
    // Ignore top-level sync errors
  }
})();

export default redisClient;
