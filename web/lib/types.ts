import type { ChargeCode, ChargeKind, MarketMeta } from './market';

export interface BillItem {
  raw_text: string;
  confirmed_name: string;
  qty: string | null;
  rate: string | null;
  amount: number;
  display?: string;
  kind?: ChargeKind;
  chargeCode?: ChargeCode | null;
}

export interface BillData {
  customerName: string;
  date: string;
  billNo: string | null;
  total: number;
  items: BillItem[];
  imagePath?: string;
  market?: MarketMeta;
}

export interface PurchaseItem {
  name: string;
  qty: string | null;
  rate: string | null;
  amount: number;
  kind?: ChargeKind;
  chargeCode?: ChargeCode | null;
}

export interface PurchaseData {
  date: string;
  supplier: string;
  billNo?: string | null;
  total: number;
  items: PurchaseItem[];
  market?: MarketMeta;
}

export interface PurchaseView extends Omit<PurchaseData, 'market'> {
  id: string;
  market?: Partial<MarketMeta>;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  purchased: number;
  paid: number;
  balance: number;
  entries: SupplierEntry[];
}

export interface SupplierEntry {
  id: string;
  type: 'purchase' | 'payment';
  date: string;
  amount: number;
  balanceAfter: number;
  billNo?: string | null;
  items?: TxnItemView[];
  notes?: string | null;
}

export interface WastageEntry {
  id: string;
  date: string;
  itemName: string;
  qty: string | null;
  unit: string | null;
  reason: string;
  estCost: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  defaultUnit: string | null;
  defaultSellPrice: number | null;
  teluguName: string | null;
  hindiName: string | null;
  active: boolean;
  aliases: string[];
}

export interface StockLevel {
  itemKey: string;
  itemName: string;
  unit: string | null;
  qty: number;
  lastPurchaseDate: string | null;
  lastRate: number | null;
}

export interface ExpenseEntry {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
}

export interface Transaction {
  id: string;
  customer_id: string;
  date: string;
  bill_no: string | null;
  bill_amount: number;
  amount_paid: number;
  notes: string | null;
  image_path: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  creditLimit?: number | null;
  billed: number;
  paid: number;
  due: number;
  txns: TxnView[];
}

export interface TxnItemView {
  name: string;
  qty: string | null;
  rate: string | null;
  amount: number;
  display: string;
  kind?: ChargeKind;
  chargeCode?: ChargeCode | null;
}

export interface TxnView {
  id: string;
  title: string;
  type: 'bill' | 'payment';
  amount: number;
  balanceAfter: number;
  date: string;
  billNo?: string | null;
  items: TxnItemView[];
  market?: Partial<MarketMeta>;
}
