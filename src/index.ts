import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { AuthController } from './controllers/AuthController';
import { RewardController } from './controllers/RewardController';
import { authenticateToken } from './middleware/auth';
import { requestLogger } from './middleware/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Middleware de logging para monitorear todas las peticiones
app.use(requestLogger);

// Auth Routes
app.post('/api/auth/login', AuthController.login);
app.get('/api/users/me', authenticateToken, AuthController.me);
app.put('/api/users/me', authenticateToken, AuthController.updateMe);

// Store Routes
import { StoreController } from './controllers/StoreController';
import { ProductController } from './controllers/ProductController';
import { CategoryController } from './controllers/CategoryController';

app.get('/api/store/products/public', StoreController.getPublicProducts);
app.get('/api/store/products/:id', StoreController.getProductById);

// Product Management & Economy Checks
app.post('/api/products', authenticateToken, ProductController.createProduct);
app.get('/api/products/categories', authenticateToken, ProductController.getCategoriesAndCaps);
app.get('/api/stores/:id/products', authenticateToken, ProductController.getProductsByStore);
app.put('/api/products/:id', authenticateToken, ProductController.updateProduct);
app.delete('/api/products/:id', authenticateToken, ProductController.deleteProduct);
app.put('/api/products/:id/transfer', authenticateToken, ProductController.transferProduct);

// Category Management
app.get('/api/categories', CategoryController.getAllCategories);
app.put('/api/categories/:id', authenticateToken, CategoryController.updateCategoryFactor);

// Secured Store Management
app.get('/api/stores/me', authenticateToken, StoreController.getMyStores);
app.get('/api/stores/all', authenticateToken, StoreController.getAllStores); 
app.get('/api/users/list', authenticateToken, StoreController.listUsers);
app.post('/api/stores', authenticateToken, StoreController.createStore);
app.put('/api/stores/:id', authenticateToken, StoreController.updateStore);
app.delete('/api/stores/:id', authenticateToken, StoreController.deleteStore);

// Coins Routes
import { CoinsController } from './controllers/CoinsController';
app.get('/api/coins/me', authenticateToken, CoinsController.getMyCoins);

// Economy Routes (Admin)
import { EconomyController } from './controllers/EconomyController';
app.post('/api/economy/issue', authenticateToken, EconomyController.triggerSemesterMinting);
app.post('/api/economy/mint', authenticateToken, EconomyController.manualMint);
app.get('/api/economy/config', authenticateToken, EconomyController.getConfig);
app.put('/api/economy/config', authenticateToken, EconomyController.updateConfig);

// Reward System Routes
app.post('/api/rewards/events', authenticateToken, RewardController.createEvent);
app.get('/api/rewards/events', authenticateToken, RewardController.getEvents);
app.put('/api/rewards/events/:id/status', authenticateToken, RewardController.toggleEventStatus);
app.delete('/api/rewards/events/:id', authenticateToken, RewardController.deleteEvent);
app.get('/api/rewards/token/:eventId', authenticateToken, RewardController.generateToken);
app.post('/api/rewards/claim', authenticateToken, RewardController.claimReward);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'university-store-api' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
