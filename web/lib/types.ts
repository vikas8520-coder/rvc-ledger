export interface BillItem {
  raw_text: string;
  confirmed_name: string;
  qty: string | null;
  rate: string | null;
  amount: number;
  display?: string;
}

export interface BillData {
  customerName: string;
  date: string;
  billNo: string | null;
  total: number;
  items: BillItem[];
  imagePath?: string;
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
  billed: number;
  paid: number;
  due: number;
  txns: TxnView[];
}

export interface TxnView {
  id: string;
  title: string;
  type: 'bill' | 'payment';
  amount: number;
  balanceAfter: number;
  date: string;
  items: [string, string][];
}
