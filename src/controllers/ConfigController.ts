import { Request, Response } from "express";
import { CAMPUS_POLYGON } from "../config/geofence";

export class ConfigController {
  static async getGeofence(req: Request, res: Response) {
    try {
      res.json({ polygon: CAMPUS_POLYGON });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
}
