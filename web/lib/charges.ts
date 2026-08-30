export type ChargeType = 'hamali' | 'tulai' | 'bardana' | 'safai' | 'jhadai' | 'dami' | 'commission' | 'marketfee' | 'advance' | 'other';
export type RateType = 'per_bag' | 'flat' | 'percent';

export interface Charge {
  id: string;
  type: ChargeType;
  label: string;
  rateType: RateType;
  rate: string;
  amount: string;
}

export const CHARGE_TYPES: { type: ChargeType; label: string; defaultRateType: RateType; hint: string }[] = [
  { type: 'hamali', label: 'Hamali (Labour)', defaultRateType: 'per_bag', hint: '₹ per bag — loading/unloading' },
  { type: 'tulai', label: 'Tulai (Weighing)', defaultRateType: 'per_bag', hint: '₹ per bag — weighing charge' },
  { type: 'bardana', label: 'Bardana (Bags/Crates)', defaultRateType: 'per_bag', hint: '₹ per bag — packaging cost' },
  { type: 'safai', label: 'Safai (Cleaning)', defaultRateType: 'flat', hint: '₹ flat — floor cleaning' },
  { type: 'jhadai', label: 'Jhadai (Sieving)', defaultRateType: 'flat', hint: '₹ flat — cleaning produce' },
  { type: 'dami', label: 'Dami', defaultRateType: 'flat', hint: '₹ flat — traditional deduction' },
  { type: 'commission', label: 'Commission (Arhat)', defaultRateType: 'percent', hint: '% of sale value' },
  { type: 'marketfee', label: 'Market Fee (APMC)', defaultRateType: 'percent', hint: '% of sale value — buyer pays' },
  { type: 'advance', label: 'Advance Recovery', defaultRateType: 'flat', hint: '₹ flat — recover prior advance' },
  { type: 'other', label: 'Other Charge', defaultRateType: 'flat', hint: '₹ flat — custom deduction' },
];