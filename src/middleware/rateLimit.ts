import { Request, Response, NextFunction } from "express";
import redisClient from "../config/redis";

export const rateLimit = (windowSeconds: number, maxRequests: number) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!redisClient.isOpen || !redisClient.isReady) {
        return next();
      }

      const ip = req.ip || req.socket.remoteAddress || "unknown";
      // Sanitize IP to avoid weird keys
      const safeIp = ip.toString().replace(/:/g, "_");
      const key = `ratelimit:${req.path}:${safeIp}`;

      // Atomic increment
      const requests = await redisClient.incr(key);

      // If it's the first request, set expiration
      if (requests === 1) {
        await redisClient.expire(key, windowSeconds);
      }

      if (requests > maxRequests) {
        const ttl = await redisClient.ttl(key);
        res.status(429).json({
          error:
            "Demasiadas solicitudes. Por favor, inténtelo de nuevo más tarde.",
          retryAfter: ttl,
        });
        return;
      }

      next();
    } catch (error) {
      console.error("Rate Limit Error:", error);
      // Fail open: If Redis fails, allow request (prevent service outage)
      next();
    }
  };
};
