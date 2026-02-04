import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";

const ACCESS_KEY_ID =
  process.env.AWS_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || "";
const SECRET_ACCESS_KEY =
  process.env.AWS_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || "";
const BUCKET_NAME =
  process.env.AWS_BUCKET ||
  process.env.R2_BUCKET_NAME ||
  "universitystore-images";
const PUBLIC_URL = process.env.AWS_URL || process.env.R2_PUBLIC_URL || "";
const ENDPOINT =
  process.env.AWS_ENDPOINT || `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const REGION = process.env.AWS_DEFAULT_REGION || "auto";

export class UploadService {
  private static s3Client = new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
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
        Bucket: BUCKET_NAME,
        Key: filename,
        Body: optimizedBuffer,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000",
      }),
    );

    const url = `${PUBLIC_URL}/${filename}`;
    return { url, filename };
  }

  static async deleteImage(urlOrKey: string): Promise<void> {
    try {
      let key = urlOrKey;
      // If it's a full URL, extract the key
      if (urlOrKey.startsWith(PUBLIC_URL)) {
        key = urlOrKey.replace(`${PUBLIC_URL}/`, "");
      }
      // If it's a full URL from another domain (unlikely but possible), try to keep just the path
      // For now, assume it matches our public URL structure.

      console.log(`Deleting image from R2: ${key}`);

      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        }),
      );
    } catch (error) {
      console.error(`Failed to delete image ${urlOrKey}:`, error);
      // We don't throw here to avoid blocking main flows if cleanup fails
    }
  }
}
