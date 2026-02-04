import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "universitystore-images";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

export class UploadService {
  private static s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  static async uploadImage(
    fileBuffer: Buffer,
  ): Promise<{ url: string; filename: string }> {
    const uniqueId = uuidv4();
    const filename = `products/${uniqueId}.webp`;

    // Optimization with Sharp
    const optimizedBuffer = await sharp(fileBuffer)
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80, effort: 6 })
      .toBuffer();

    // Upload to R2
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: filename,
        Body: optimizedBuffer,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000",
      }),
    );

    const url = `${R2_PUBLIC_URL}/${filename}`;
    return { url, filename };
  }

  static async deleteImage(urlOrKey: string): Promise<void> {
    try {
      let key = urlOrKey;
      // If it's a full URL, extract the key
      if (urlOrKey.startsWith(R2_PUBLIC_URL)) {
        key = urlOrKey.replace(`${R2_PUBLIC_URL}/`, "");
      }
      // If it's a full URL from another domain (unlikely but possible), try to keep just the path
      // For now, assume it matches our public URL structure.

      console.log(`Deleting image from R2: ${key}`);

      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
        }),
      );
    } catch (error) {
      console.error(`Failed to delete image ${urlOrKey}:`, error);
      // We don't throw here to avoid blocking main flows if cleanup fails
    }
  }
}
