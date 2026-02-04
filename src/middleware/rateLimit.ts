import { Request, Response, NextFunction } from "express";

export const rateLimit = (windowSeconds: number, maxRequests: number) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Rate limit disabled by request
    next();
  };
};
