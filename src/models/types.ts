
export interface User {
  id: string; // UUID
  email: string;
  roles: string[]; // ['ADMIN', 'SELLER', 'USER']
  name: string;
  created_at: Date;
}

export interface Product {
    id: string;
    store_id: string;
    name: string;
    description?: string;
    price: number;
    stock: number;
    image_url?: string;
}


export interface Wallet {
  id: string; // UUID
  user_id: string;
  // balance: number; // Removed, calculated dynamically
  currency_symbol: string;
  updated_at: Date;
}

export interface Coin {
    id: string;
    wallet_id: string;
    mint_batch_id: string;
    status: 'ACTIVE' | 'SPENT' | 'BURNED';
    created_at: Date;
}

export interface Transaction {
  id: string; // UUID
  from_wallet_id: string | null; // Null for Minting
  to_wallet_id: string | null; // Null for Burning
  amount: number;
  type: 'MINT' | 'TRANSFER' | 'PURCHASE' | 'REFUND';
  reference_id?: string; // Order ID or metadata
  previous_hash: string;
  hash: string;
  created_at: Date;
}
