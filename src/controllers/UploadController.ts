import { Request, Response } from "express";
import { UploadService } from "../services/UploadService";
import multer from "multer";

// Configure Multer (Memory Storage)
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB Limit per file
    files: 3, // Max 3 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images are allowed"));
    }
  },
});

export class UploadController {
  static async uploadImage(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const { url, filename } = await UploadService.uploadImage(
        req.file.buffer,
      );

      res.json({ url, filename });
    } catch (error) {
      console.error("Upload Error:", error);
      res.status(500).json({ error: "Image upload failed" });
    }
  }
}
