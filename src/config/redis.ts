import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    connectTimeout: 5000, // 5 seconds timeout
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error(
          "Redis: Max retries reached. Stopping reconnection attempts.",
        );
        return false; // Stop retrying
      }
      return Math.min(retries * 100, 3000); // Backoff strategy
    },
  },
});

redisClient.on("error", (err) => {
  // Only log detailed error if it's not a connection timeout spam
  if (err.name === "ConnectionTimeoutError") {
    console.error("Redis Status: Connection Timeout (Local/Down)");
  } else {
    console.error("Redis Status: Error", err.message);
  }
});

redisClient.on("connect", () => console.log("Redis Status: Connected"));
redisClient.on("ready", () => console.log("Redis Status: Ready"));

const connectRedis = async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (error) {
    console.warn(
      "Redis Status: Could not establish initial connection. Cache will be disabled.",
    );
  }
};

// Start connection attempt without blocking or crashing
connectRedis();

export default redisClient;
