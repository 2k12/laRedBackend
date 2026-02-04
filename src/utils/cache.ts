import redisClient from "../config/redis";

export const CACHE_TTL = {
  SHORT: 300, // 5 minutos (Feed, Eventos activos)
  MEDIUM: 1800, // 30 minutos (Detalles de producto)
  LONG: 86400, // 24 horas (Configuraciones, Paquetes de pub)
};

export class CacheService {
  private static isRedisReady(): boolean {
    return redisClient.isOpen && redisClient.isReady;
  }

  static async get<T>(key: string): Promise<T | null> {
    if (!this.isRedisReady()) return null;
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Cache Get Error [${key}]:`, error);
      return null;
    }
  }

  static async set(
    key: string,
    value: any,
    ttl: number = CACHE_TTL.SHORT,
  ): Promise<void> {
    if (!this.isRedisReady()) return;
    try {
      await redisClient.set(key, JSON.stringify(value), {
        EX: ttl,
      });
    } catch (error) {
      console.error(`Cache Set Error [${key}]:`, error);
    }
  }

  static async delete(key: string): Promise<void> {
    if (!this.isRedisReady()) return;
    try {
      await redisClient.del(key);
    } catch (error) {
      console.error(`Cache Delete Error [${key}]:`, error);
    }
  }

  static async deleteByPattern(pattern: string): Promise<void> {
    if (!this.isRedisReady()) return;
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } catch (error) {
      console.error(`Cache DeletePattern Error [${pattern}]:`, error);
    }
  }
}
