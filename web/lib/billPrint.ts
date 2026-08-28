import type { TxnView, TxnItemView } from './types';
import type { MarketMeta, ChargeCode } from './market';
import { yardById, chargeLabel, goodsTotal, chargesTotal } from './market';

export type BillFormat = 'simple' | 'itemized' | 'market';

export const BILL_FORMATS: { value: BillFormat; labelKey: string }[] = [
  { value: 'simple', labelKey: 'billFormatSimple' },
  { value: 'itemized', labelKey: 'billFormatItemized' },
  { value: 'market', labelKey: 'billFormatMarket' },
];

export interface ShopProfile {
  shopName?: string;
  shopAddress?: string;
  shopPhone?: string;
}

export interface BillPrintData {
  customerName: string;
  date: string;
  billNo?: string | null;
  items: TxnItemView[];
  total: number;
  market?: Partial<MarketMeta>;
}

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

function money(n: number): string {
  return '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const BASE_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Georgia', 'Times New Roman', serif; color: #222; line-height: 1.5; padding: 20px; }
  .bill { max-width: 700px; margin: 0 auto; }
  .shop-header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #8b2e2e; }
  .shop-name { font-size: 22px; font-weight: bold; color: #8b2e2e; }
  .shop-addr { font-size: 12px; color: #666; margin-top: 2px; }
  .shop-phone { font-size: 12px; color: #666; }
  .bill-title { text-align: center; font-size: 16px; font-weight: bold; margin: 12px 0; text-transform: uppercase; letter-spacing: 1px; }
  .meta { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 12px; }
  .meta div { line-height: 1.8; }
  .meta .label { color: #888; font-size: 11px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th { background: #f5f0e6; font-size: 11px; text-transform: uppercase; padding: 6px 8px; text-align: left; border-bottom: 2px solid #8b2e2e; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 13px; }
  td.num, th.num { text-align: right; }
  .total-row { font-weight: bold; font-size: 15px; border-top: 2px solid #8b2e2e; }
  .total-row td { border-bottom: none; padding-top: 8px; }
  .charges-section { margin-top: 8px; }
  .charges-section th { background: #faf5ec; }
  .grand-total { text-align: right; font-size: 18px; font-weight: bold; color: #8b2e2e; margin-top: 12px; padding-top: 8px; border-top: 2px solid #8b2e2e; }
  .signature { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; color: #888; }
  .signature-line { border-top: 1px solid #999; padding-top: 4px; min-width: 180px; text-align: center; }
  .footer { text-align: center; font-size: 10px; color: #aaa; margin-top: 20px; padding-top: 10px; border-top: 1px dashed #ccc; }
  .market-info { background: #f9f6f0; border: 1px solid #e0d8c8; border-radius: 4px; padding: 8px 12px; margin: 8px 0; font-size: 12px; }
  .market-info strong { color: #5a4a3a; }
  @media print {
    body { padding: 0; }
    .bill { max-width: 100%; }
    .no-print { display: none; }
  }
  .print-btn { display: block; margin: 16px auto 0; padding: 8px 24px; background: #8b2e2e; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
  .print-btn:hover { background: #6b2222; }
`;

function shopHeader(shop: ShopProfile): string {
  return `
    <div class="shop-header">
      <div class="shop-name">${esc(shop.shopName || 'RVC Vegetable Shop')}</div>
      ${shop.shopAddress ? `<div class="shop-addr">${esc(shop.shopAddress)}</div>` : ''}
      ${shop.shopPhone ? `<div class="shop-phone">${esc(shop.shopPhone)}</div>` : ''}
    </div>`;
}

function metaBlock(bill: BillPrintData): string {
  return `
    <div class="meta">
      <div>
        <div class="label">Customer</div>
        <div><strong>${esc(bill.customerName)}</strong></div>
      </div>
      <div style="text-align: right;">
        <div class="label">Bill No</div>
        <div>${esc(bill.billNo || '—')}</div>
        <div class="label" style="margin-top:4px;">Date</div>
        <div>${fmtDate(bill.date)}</div>
      </div>
    </div>`;
}

function signatureBlock(): string {
  return `
    <div class="signature">
      <div class="signature-line">Customer Signature</div>
      <div class="signature-line">For ${esc('Shop Name')}</div>
    </div>`;
}

function footerBlock(shop: ShopProfile): string {
  return `
    <div class="footer">
      Thank you for your business · ${esc(shop.shopName || 'RVC Vegetable Shop')}<br>
      Generated on ${new Date().toLocaleString('en-IN')}
    </div>`;
}

function printScript(): string {
  return `<button class="print-btn no-print" onclick="window.print()">Print Bill</button><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>`;
}

// Format 1: Simple — plain item list with total
function simpleBill(bill: BillPrintData, shop: ShopProfile): string {
  const itemRows = bill.items
    .filter((it) => it.kind !== 'charge')
    .map((it, i) => {
      const display = it.display || '';
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(it.name)}</td>
        <td>${esc(display)}</td>
        <td class="num">${money(it.amount)}</td>
      </tr>`;
    })
    .join('\n');

  const charges = bill.items.filter((it) => it.kind === 'charge');
  const chargesRows = charges
    .map((it) => `<tr><td>${esc(it.name)}</td><td class="num">${money(it.amount)}</td></tr>`)
    .join('\n');

  const goodsSum = goodsTotal(bill.items);
  const chargesSum = chargesTotal(bill.items);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bill ${esc(bill.billNo || '')}</title>
  <style>${BASE_STYLES}</style></head><body>
  <div class="bill">
    ${shopHeader(shop)}
    <div class="bill-title">Bill</div>
    ${metaBlock(bill)}
    <table>
      <thead><tr><th>#</th><th>Item</th><th>Qty × Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${itemRows}
        ${chargesRows}
      </tbody>
      <tfoot>
        ${charges.length > 0 ? `<tr class="total-row"><td colspan="3">Goods Total</td><td class="num">${money(goodsSum)}</td></tr>` : ''}
        ${charges.length > 0 ? charges.map((it) => `<tr><td colspan="3">${esc(it.name)}</td><td class="num">${money(it.amount)}</td></tr>`).join('') : ''}
        <tr class="total-row"><td colspan="3">Total</td><td class="num">${money(bill.total)}</td></tr>
      </tfoot>
    </table>
    <div class="grand-total">Total: ${money(bill.total)}</div>
    ${signatureBlock().replace('Shop Name', esc(shop.shopName || 'Shop'))}
    ${footerBlock(shop)}
  </div>
  ${printScript()}
  </body></html>`;
}

// Format 2: Itemized — full table with qty, rate, amount columns + charges section
function itemizedBill(bill: BillPrintData, shop: ShopProfile): string {
  const itemRows = bill.items
    .filter((it) => it.kind !== 'charge')
    .map((it, i) => {
      const qty = it.qty || '—';
      const rate = it.rate || '—';
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(it.name)}</td>
        <td class="num">${esc(qty)}</td>
        <td class="num">${esc(rate)}</td>
        <td class="num">${money(it.amount)}</td>
      </tr>`;
    })
    .join('\n');

  const charges = bill.items.filter((it) => it.kind === 'charge');
  const goodsSum = goodsTotal(bill.items);
  const chargesSum = chargesTotal(bill.items);

  const chargesTable = charges.length > 0
    ? `<div class="charges-section">
        <table>
          <thead><tr><th>Charges</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${charges.map((it) => `<tr><td>${esc(it.name)}</td><td class="num">${money(it.amount)}</td></tr>`).join('')}
            <tr class="total-row"><td>Total Charges</td><td class="num">${money(chargesSum)}</td></tr>
          </tbody>
        </table>
      </div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bill ${esc(bill.billNo || '')}</title>
  <style>${BASE_STYLES}</style></head><body>
  <div class="bill">
    ${shopHeader(shop)}
    <div class="bill-title">Invoice / Bill</div>
    ${metaBlock(bill)}
    <table>
      <thead>
        <tr><th>#</th><th>Item Name</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
      <tfoot>
        <tr class="total-row"><td colspan="4">Goods Total</td><td class="num">${money(goodsSum)}</td></tr>
      </tfoot>
    </table>
    ${chargesTable}
    <div class="grand-total">Grand Total: ${money(bill.total)}</div>
    ${signatureBlock().replace('Shop Name', esc(shop.shopName || 'Shop'))}
    ${footerBlock(shop)}
  </div>
  ${printScript()}
  </body></html>`;
}

// Format 3: Market yard — includes market info, lot no, vehicle no, charge breakdown
function marketBill(bill: BillPrintData, shop: ShopProfile): string {
  const m = bill.market || {};
  const yard = m.marketYard ? yardById(m.marketYard) : null;
  const yardName = yard?.name || m.marketYard || '—';
  const marketType = m.marketType || '—';

  const marketInfo = `
    <div class="market-info">
      <strong>Market Yard:</strong> ${esc(yardName)} &nbsp;|&nbsp;
      <strong>Type:</strong> ${esc(marketType)}<br>
      ${m.sellerName ? `<strong>Seller:</strong> ${esc(m.sellerName)} &nbsp;` : ''}
      ${m.lotNo ? `| <strong>Lot No:</strong> ${esc(m.lotNo)} &nbsp;` : ''}
      ${m.vehicleNo ? `| <strong>Vehicle:</strong> ${esc(m.vehicleNo)}` : ''}
    </div>`;

  const itemRows = bill.items
    .filter((it) => it.kind !== 'charge')
    .map((it, i) => {
      const qty = it.qty || '—';
      const rate = it.rate || '—';
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(it.name)}</td>
        <td class="num">${esc(qty)}</td>
        <td class="num">${esc(rate)}</td>
        <td class="num">${money(it.amount)}</td>
      </tr>`;
    })
    .join('\n');

  const charges = bill.items.filter((it) => it.kind === 'charge');
  const goodsSum = goodsTotal(bill.items);

  // Group charges by code for market format
  const chargeRows = charges
    .map((it) => `<tr><td>${esc(it.name)}</td><td class="num">${money(it.amount)}</td></tr>`)
    .join('\n');

  const chargesTable = charges.length > 0
    ? `<div class="charges-section">
        <table>
          <thead><tr><th>Charges / Commission</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${chargeRows}
          </tbody>
        </table>
      </div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bill ${esc(bill.billNo || '')}</title>
  <style>${BASE_STYLES}</style></head><body>
  <div class="bill">
    ${shopHeader(shop)}
    <div class="bill-title">Market Bill</div>
    ${metaBlock(bill)}
    ${marketInfo}
    <table>
      <thead>
        <tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
      <tfoot>
        <tr class="total-row"><td colspan="4">Goods Total</td><td class="num">${money(goodsSum)}</td></tr>
      </tfoot>
    </table>
    ${chargesTable}
    <div class="grand-total">Bill Total: ${money(bill.total)}</div>
    ${signatureBlock().replace('Shop Name', esc(shop.shopName || 'Shop'))}
    ${footerBlock(shop)}
  </div>
  ${printScript()}
  </body></html>`;
}

export function renderBillHtml(bill: BillPrintData, shop: ShopProfile, format: BillFormat): string {
  switch (format) {
    case 'itemized':
      return itemizedBill(bill, shop);
    case 'market':
      return marketBill(bill, shop);
    case 'simple':
    default:
      return simpleBill(bill, shop);
  }
}

export function printBill(bill: BillPrintData, shop: ShopProfile, format: BillFormat): void {
  const html = renderBillHtml(bill, shop, format);
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow popups to print the bill');
    return;
  }
  win.document.write(html);
  win.document.close();
}

// Convert a TxnView (from customer ledger) to BillPrintData
export function txnToBillData(txn: TxnView, customerName: string): BillPrintData {
  return {
    customerName,
    date: txn.date,
    billNo: txn.billNo,
    items: txn.items,
    total: txn.amount,
    market: txn.market,
  };
}
