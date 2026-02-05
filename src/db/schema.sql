-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Reset Tables (Dev Mode)
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS coins CASCADE;
DROP TABLE IF EXISTS stores CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS users CASCADE;
-- Users Table (Updated for Multi-Role)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  roles TEXT [] NOT NULL DEFAULT '{"USER"}',
  -- Supports ['ADMIN', 'SELLER', 'USER']
  name VARCHAR(100),
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Wallets Table (One per user usually, but flexible)
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  -- balance DECIMAL(20, 2) DEFAULT 0.00,  <-- REMOVED: Balance is now derived count(coins)
  currency_symbol VARCHAR(10) DEFAULT 'UC',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Coins Table (Tokenized Currency - 1 Row = 1 Coin)
CREATE TABLE IF NOT EXISTS coins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID REFERENCES wallets(id),
  -- Current Owner
  mint_batch_id VARCHAR(100),
  -- For audit (e.g., "MINT_GENESIS_001")
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SPENT', 'BURNED')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Coin History (Traceability)
CREATE TABLE IF NOT EXISTS coin_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coin_id UUID REFERENCES coins(id) ON DELETE CASCADE,
  transaction_id UUID,
  -- Link to the batch transaction
  from_wallet_id UUID REFERENCES wallets(id),
  to_wallet_id UUID REFERENCES wallets(id),
  action VARCHAR(50) NOT NULL,
  -- 'MINT', 'TRANSFER', 'PURCHASE'
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Transactions Ledger (Immutable)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_wallet_id UUID REFERENCES wallets(id),
  -- Nullable for Mint
  to_wallet_id UUID REFERENCES wallets(id),
  -- Nullable for Burn
  amount DECIMAL(20, 2) NOT NULL,
  type VARCHAR(20) NOT NULL,
  -- MINT, TRANSFER, PURCHASE
  reference_id VARCHAR(255),
  previous_hash VARCHAR(64) NOT NULL,
  -- For chain integrity
  hash VARCHAR(64) NOT NULL,
  -- Current hash
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Stores Table
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Products Table (New)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(20, 2) NOT NULL,
  -- Price in UC
  stock INTEGER DEFAULT 0,
  sku VARCHAR(100),
  image_url TEXT,
  currency VARCHAR(20) DEFAULT 'COINS' CHECK (currency IN ('COINS', 'MONEY')),
  is_ghost_drop BOOLEAN DEFAULT FALSE,
  ghost_lat DECIMAL(10, 8),
  ghost_lng DECIMAL(11, 8),
  ghost_radius INTEGER DEFAULT 50,
  ghost_clue TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Orders Table (Purchase Contract)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID REFERENCES users(id),
  store_id UUID REFERENCES stores(id),
  product_id UUID REFERENCES products(id),
  price_paid DECIMAL(20, 2) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING_DELIVERY' CHECK (
    status IN (
      'PENDING_DELIVERY',
      'DELIVERED',
      'DISPUTED',
      'CANCELLED'
    )
  ),
  delivery_code VARCHAR(6),
  -- Security Code for handover
  product_snapshot JSONB,
  -- Stores name, image, description at time of purchase
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Notifications System
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  type VARCHAR(50),
  -- ORDER_NEW, ORDER_DELIVERED, SYSTEM
  title VARCHAR(100),
  message TEXT,
  related_entity_id UUID,
  -- usually order_id
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);