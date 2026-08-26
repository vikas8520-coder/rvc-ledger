-- Run this against the Neon database to create the RVC ledger tables.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  bill_no TEXT,
  bill_amount NUMERIC(12,2) DEFAULT 0,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  image_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  raw_text TEXT,
  confirmed_name TEXT,
  qty TEXT,
  rate TEXT,
  amount NUMERIC(12,2) DEFAULT 0,
  display TEXT,
  kind TEXT DEFAULT 'item',
  charge_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  supplier TEXT,
  bill_no TEXT,
  total NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE,
  name TEXT,
  qty TEXT,
  rate TEXT,
  amount NUMERIC(12,2) DEFAULT 0,
  kind TEXT DEFAULT 'item',
  charge_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS learned_names (
  raw TEXT NOT NULL,
  meaning TEXT NOT NULL,
  is_telugu BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (raw, is_telugu)
);
