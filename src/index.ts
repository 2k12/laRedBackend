import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AuthController } from "./controllers/AuthController";
import { RewardController } from "./controllers/RewardController";
import { authenticateToken } from "./middleware/auth";
import { requestLogger } from "./middleware/logger";
import { rateLimit } from "./middleware/rateLimit";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Middleware de logging para monitorear todas las peticiones
app.use(requestLogger);

// Auth Routes
app.post("/api/auth/register", rateLimit(300, 5), AuthController.register); // 5 attempts per 5 mins
app.post("/api/auth/login", rateLimit(60, 10), AuthController.login); // 10 attempts per minute
app.post("/api/auth/logout", authenticateToken, AuthController.logout);
app.get("/api/users/me", authenticateToken, AuthController.me);
app.put("/api/users/me", authenticateToken, AuthController.updateMe);
app.put(
  "/api/users/me/password",
  authenticateToken,
  AuthController.updatePassword,
);

// Store Routes
import { StoreController } from "./controllers/StoreController";
import { ProductController } from "./controllers/ProductController";
import { CategoryController } from "./controllers/CategoryController";

app.get("/api/store/products/public", StoreController.getPublicProducts);
app.get("/api/store/products/:id", StoreController.getProductById);
app.get("/api/stores/public", StoreController.getPublicStores);

// Product Management & Economy Checks
app.post("/api/products", authenticateToken, ProductController.createProduct);
app.get(
  "/api/products/categories",
  authenticateToken,
  ProductController.getCategoriesAndCaps,
);
app.get(
  "/api/stores/:id/products",
  authenticateToken,
  ProductController.getProductsByStore,
);
app.put(
  "/api/products/:id",
  authenticateToken,
  ProductController.updateProduct,
);
app.delete(
  "/api/products/:id",
  authenticateToken,
  ProductController.deleteProduct,
);
app.put(
  "/api/products/:id/transfer",
  authenticateToken,
  ProductController.transferProduct,
);

// Category Management
app.get("/api/categories", CategoryController.getAllCategories);
app.put(
  "/api/categories/:id",
  authenticateToken,
  CategoryController.updateCategoryFactor,
);

// Secured Store Management
app.get("/api/stores/me", authenticateToken, StoreController.getMyStores);
app.get("/api/stores/all", authenticateToken, StoreController.getAllStores);
app.get("/api/users/list", authenticateToken, StoreController.listUsers);
app.post("/api/stores", authenticateToken, StoreController.createStore);
app.put("/api/stores/:id", authenticateToken, StoreController.updateStore);
app.delete("/api/stores/:id", authenticateToken, StoreController.deleteStore);

// Coins Routes
import { CoinsController } from "./controllers/CoinsController";
app.get("/api/coins/me", authenticateToken, CoinsController.getMyCoins);

// Economy Routes (Admin)
import { EconomyController } from "./controllers/EconomyController";
app.post(
  "/api/economy/issue",
  authenticateToken,
  EconomyController.triggerSemesterMinting,
);
app.post("/api/economy/mint", authenticateToken, EconomyController.manualMint);
app.get("/api/economy/config", authenticateToken, EconomyController.getConfig);
app.put(
  "/api/economy/config",
  authenticateToken,
  EconomyController.updateConfig,
);

// Order & Purchase Routes
import { OrderController } from "./controllers/OrderController";
app.post(
  "/api/orders/purchase",
  authenticateToken,
  OrderController.createOrder,
);
app.get("/api/orders", authenticateToken, OrderController.getMyOrders);
app.post(
  "/api/orders/:orderId/confirm",
  authenticateToken,
  OrderController.confirmDelivery,
);

// Reward System Routes
app.post(
  "/api/rewards/events",
  authenticateToken,
  RewardController.createEvent,
);
app.get("/api/rewards/events", authenticateToken, RewardController.getEvents);
app.put(
  "/api/rewards/events/:id/status",
  authenticateToken,
  RewardController.toggleEventStatus,
);
app.delete(
  "/api/rewards/events/:id",
  authenticateToken,
  RewardController.deleteEvent,
);
app.get(
  "/api/rewards/token/:eventId",
  authenticateToken,
  RewardController.generateToken,
);
app.post("/api/rewards/claim", authenticateToken, RewardController.claimReward);

// Advertising & Ads Slide Routes
import { AdController } from "./controllers/AdController";
app.get("/api/ads/packages", authenticateToken, AdController.getPackages);
app.post("/api/ads/purchase", authenticateToken, AdController.purchasePackage);
app.get("/api/ads/featured", AdController.getFeaturedProducts);

// Badge System Routes
import { BadgeController } from "./controllers/BadgeController";
app.get("/api/badges", authenticateToken, BadgeController.getAllBadges);
app.get(
  "/api/badges/user/:userId",
  authenticateToken,
  BadgeController.getUserBadges,
);
app.post(
  "/api/badges/check",
  authenticateToken,
  BadgeController.checkAndAwardBadges,
);
app.post(
  "/api/badges/award",
  authenticateToken,
  BadgeController.awardBadgeManually,
);
app.post(
  "/api/badges/award-bulk",
  authenticateToken,
  BadgeController.awardBadgesBulk,
);

// User Management (Admin/System)
import { UserController } from "./controllers/UserController";
app.post("/api/users/link-utnid", authenticateToken, UserController.linkUtnId);
app.get("/api/admin/users", authenticateToken, UserController.listAllUsers);
app.post(
  "/api/admin/users/activate",
  authenticateToken,
  UserController.activateUsers,
);
app.post(
  "/api/admin/users/toggle/:userId",
  authenticateToken,
  UserController.toggleUserStatus,
);
app.get(
  "/api/admin/users/profile/:userId",
  authenticateToken,
  UserController.getUserProfile,
);
app.post(
  "/api/admin/users/roles/:userId",
  authenticateToken,
  UserController.updateRoles,
);

// Upload Routes
import {
  UploadController,
  uploadMiddleware,
} from "./controllers/UploadController";
app.post(
  "/api/upload/image",
  authenticateToken,
  uploadMiddleware.single("image"),
  UploadController.uploadImage,
);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "university-store-api" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
