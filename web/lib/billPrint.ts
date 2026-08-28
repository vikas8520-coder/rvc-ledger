import type { TxnView, TxnItemView } from './types';
import type { MarketMeta, ChargeCode } from './market';
import { yardById, chargeLabel, goodsTotal, chargesTotal } from './market';

export type BillFormat = 'simple' | 'itemized' | 'market' | 'patti';

export const BILL_FORMATS: { value: BillFormat; labelKey: string }[] = [
  { value: 'simple', labelKey: 'billFormatSimple' },
  { value: 'itemized', labelKey: 'billFormatItemized' },
  { value: 'market', labelKey: 'billFormatMarket' },
  { value: 'patti', labelKey: 'billFormatPatti' },
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

// ============================================================
// SHARED HELPERS
// ============================================================

function printScript(label = 'Print'): string {
  return `<button class="print-btn no-print" onclick="window.print()">${label}</button><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>`;
}

// ============================================================
// FORMAT 1: SIMPLE — thermal receipt style
// Narrow, monospace, minimal. Looks like a shop receipt.
// ============================================================

const SIMPLE_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; color: #000; padding: 10px; }
  .receipt { max-width: 380px; margin: 0 auto; }
  .r-shop { text-align: center; border-bottom: 1px dashed #999; padding-bottom: 8px; margin-bottom: 8px; }
  .r-shop-name { font-size: 16px; font-weight: bold; }
  .r-shop-addr { font-size: 11px; }
  .r-shop-phone { font-size: 11px; }
  .r-title { text-align: center; font-size: 13px; font-weight: bold; margin: 8px 0; letter-spacing: 2px; }
  .r-meta { font-size: 11px; line-height: 1.6; margin-bottom: 8px; }
  .r-meta-row { display: flex; justify-content: space-between; }
  .r-divider { border-top: 1px dashed #999; margin: 6px 0; }
  .r-item { display: flex; justify-content: space-between; font-size: 12px; line-height: 1.6; }
  .r-item-name { flex: 1; }
  .r-item-amt { font-weight: bold; }
  .r-item-sub { font-size: 10px; color: #666; padding-left: 12px; }
  .r-charge { display: flex; justify-content: space-between; font-size: 11px; color: #555; line-height: 1.6; }
  .r-total { display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 6px 0; margin-top: 6px; }
  .r-footer { text-align: center; font-size: 10px; color: #888; margin-top: 12px; }
  .r-sign { margin-top: 30px; font-size: 11px; text-align: center; border-top: 1px solid #999; padding-top: 4px; }
  .print-btn { display: block; margin: 12px auto 0; padding: 6px 18px; background: #333; color: #fff; border: none; font-size: 12px; cursor: pointer; }
  @media print { body { padding: 0; } .no-print { display: none; } }
`;

function simpleBill(bill: BillPrintData, shop: ShopProfile): string {
  const items = bill.items.filter((it) => it.kind !== 'charge');
  const charges = bill.items.filter((it) => it.kind === 'charge');
  const goodsSum = goodsTotal(bill.items);

  const itemLines = items.map((it) => {
    const sub = [it.qty, it.rate].filter(Boolean).join(' × ');
    return `<div class="r-item">
      <span class="r-item-name">${esc(it.name)}</span>
      <span class="r-item-amt">${money(it.amount)}</span>
    </div>${sub ? `<div class="r-item-sub">${esc(sub)}</div>` : ''}`;
  }).join('\n');

  const chargeLines = charges.map((it) =>
    `<div class="r-charge"><span>${esc(it.name)}</span><span>${money(it.amount)}</span></div>`
  ).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${esc(bill.billNo || '')}</title>
  <style>${SIMPLE_STYLES}</style></head><body>
  <div class="receipt">
    <div class="r-shop">
      <div class="r-shop-name">${esc(shop.shopName || 'RVC Vegetable Shop')}</div>
      ${shop.shopAddress ? `<div class="r-shop-addr">${esc(shop.shopAddress)}</div>` : ''}
      ${shop.shopPhone ? `<div class="r-shop-phone">${esc(shop.shopPhone)}</div>` : ''}
    </div>
    <div class="r-title">RECEIPT</div>
    <div class="r-meta">
      <div class="r-meta-row"><span>Bill No:</span><span>${esc(bill.billNo || '—')}</span></div>
      <div class="r-meta-row"><span>Date:</span><span>${fmtDate(bill.date)}</span></div>
      <div class="r-meta-row"><span>Customer:</span><span>${esc(bill.customerName)}</span></div>
    </div>
    <div class="r-divider"></div>
    ${itemLines}
    ${charges.length > 0 ? `<div class="r-divider"></div>${chargeLines}<div class="r-charge" style="font-weight:bold"><span>Goods Total</span><span>${money(goodsSum)}</span></div>` : ''}
    <div class="r-total">
      <span>TOTAL</span>
      <span>${money(bill.total)}</span>
    </div>
    <div class="r-sign">Authorized Signature</div>
    <div class="r-footer">Thank you! · ${esc(shop.shopName || 'RVC')}</div>
  </div>
  ${printScript('Print Receipt')}
  </body></html>`;
}

// ============================================================
// FORMAT 2: ITEMIZED — professional invoice with grid table
// Boxed layout, grid lines, blue-gray header
// ============================================================

const ITEMIZED_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial', 'Helvetica', sans-serif; color: #1a1a1a; padding: 20px; }
  .invoice { max-width: 750px; margin: 0 auto; }
  .inv-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2c3e50; padding-bottom: 12px; margin-bottom: 16px; }
  .inv-shop-name { font-size: 24px; font-weight: bold; color: #2c3e50; }
  .inv-shop-addr { font-size: 12px; color: #666; margin-top: 2px; }
  .inv-shop-phone { font-size: 12px; color: #666; }
  .inv-title-box { background: #2c3e50; color: #fff; padding: 8px 20px; text-align: center; }
  .inv-title { font-size: 18px; font-weight: bold; letter-spacing: 2px; }
  .inv-meta { display: flex; justify-content: space-between; margin: 12px 0; font-size: 13px; }
  .inv-meta-left, .inv-meta-right { line-height: 1.7; }
  .inv-meta-label { font-size: 10px; text-transform: uppercase; color: #999; }
  .inv-meta-val { font-weight: bold; }
  .inv-table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  .inv-table th { background: #2c3e50; color: #fff; font-size: 11px; text-transform: uppercase; padding: 8px; text-align: left; }
  .inv-table th.num { text-align: right; }
  .inv-table td { padding: 7px 8px; border: 1px solid #ddd; font-size: 13px; }
  .inv-table td.num { text-align: right; }
  .inv-table tbody tr:nth-child(even) { background: #f8f9fa; }
  .inv-goods-total { font-weight: bold; background: #eef2f7; }
  .inv-goods-total td { border: 1px solid #ccc; }
  .inv-charges { margin-top: 12px; }
  .inv-charges th { background: #34495e; }
  .inv-grand-total { margin-top: 16px; text-align: right; }
  .inv-grand-total-box { display: inline-block; background: #2c3e50; color: #fff; padding: 10px 24px; font-size: 20px; font-weight: bold; }
  .inv-signature { margin-top: 50px; display: flex; justify-content: space-between; font-size: 12px; color: #888; }
  .inv-sig-line { border-top: 1px solid #aaa; padding-top: 4px; min-width: 200px; text-align: center; }
  .inv-footer { text-align: center; font-size: 10px; color: #aaa; margin-top: 20px; border-top: 1px solid #eee; padding-top: 8px; }
  .print-btn { display: block; margin: 16px auto 0; padding: 8px 24px; background: #2c3e50; color: #fff; border: none; border-radius: 4px; font-size: 14px; cursor: pointer; }
  @media print { body { padding: 0; } .no-print { display: none; } }
`;

function itemizedBill(bill: BillPrintData, shop: ShopProfile): string {
  const items = bill.items.filter((it) => it.kind !== 'charge');
  const charges = bill.items.filter((it) => it.kind === 'charge');
  const goodsSum = goodsTotal(bill.items);
  const chargesSum = chargesTotal(bill.items);

  const itemRows = items.map((it, i) => `<tr>
    <td style="text-align:center">${i + 1}</td>
    <td>${esc(it.name)}</td>
    <td class="num">${esc(it.qty || '—')}</td>
    <td class="num">${esc(it.rate || '—')}</td>
    <td class="num">${money(it.amount)}</td>
  </tr>`).join('\n');

  const chargesTable = charges.length > 0 ? `
    <table class="inv-table inv-charges">
      <thead><tr><th>Charges</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${charges.map((it) => `<tr><td>${esc(it.name)}</td><td class="num">${money(it.amount)}</td></tr>`).join('\n')}
        <tr class="inv-goods-total"><td>Total Charges</td><td class="num">${money(chargesSum)}</td></tr>
      </tbody>
    </table>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${esc(bill.billNo || '')}</title>
  <style>${ITEMIZED_STYLES}</style></head><body>
  <div class="invoice">
    <div class="inv-header">
      <div>
        <div class="inv-shop-name">${esc(shop.shopName || 'RVC Vegetable Shop')}</div>
        ${shop.shopAddress ? `<div class="inv-shop-addr">${esc(shop.shopAddress)}</div>` : ''}
        ${shop.shopPhone ? `<div class="inv-shop-phone">${esc(shop.shopPhone)}</div>` : ''}
      </div>
      <div class="inv-title-box">
        <div class="inv-title">INVOICE</div>
      </div>
    </div>
    <div class="inv-meta">
      <div class="inv-meta-left">
        <div class="inv-meta-label">Bill To</div>
        <div class="inv-meta-val">${esc(bill.customerName)}</div>
      </div>
      <div class="inv-meta-right" style="text-align:right">
        <div class="inv-meta-label">Bill No</div>
        <div class="inv-meta-val">${esc(bill.billNo || '—')}</div>
        <div class="inv-meta-label" style="margin-top:4px">Date</div>
        <div class="inv-meta-val">${fmtDate(bill.date)}</div>
      </div>
    </div>
    <table class="inv-table">
      <thead>
        <tr><th style="width:30px">#</th><th>Item Name</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
      <tfoot>
        <tr class="inv-goods-total"><td colspan="4">Goods Total</td><td class="num">${money(goodsSum)}</td></tr>
      </tfoot>
    </table>
    ${chargesTable}
    <div class="inv-grand-total">
      <div class="inv-grand-total-box">GRAND TOTAL: ${money(bill.total)}</div>
    </div>
    <div class="inv-signature">
      <div class="inv-sig-line">Customer Signature</div>
      <div class="inv-sig-line">For ${esc(shop.shopName || 'Shop')}</div>
    </div>
    <div class="inv-footer">This is a computer-generated invoice · ${new Date().toLocaleString('en-IN')}</div>
  </div>
  ${printScript('Print Invoice')}
  </body></html>`;
}

// ============================================================
// FORMAT 3: MARKET YARD — mandi style with bordered boxes
// Green/brown earthy tones, prominent market info box
// ============================================================

const MARKET_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Verdana', 'Geneva', sans-serif; color: #2d2200; padding: 20px; }
  .mandi { max-width: 750px; margin: 0 auto; }
  .mandi-header { text-align: center; border: 3px double #5a7a3a; padding: 10px; margin-bottom: 12px; background: #f4f8ee; }
  .mandi-shop { font-size: 22px; font-weight: bold; color: #3a5a1a; }
  .mandi-addr { font-size: 11px; color: #5a6a3a; }
  .mandi-phone { font-size: 11px; color: #5a6a3a; }
  .mandi-title { font-size: 16px; font-weight: bold; text-align: center; background: #5a7a3a; color: #fff; padding: 6px; margin: 12px 0; letter-spacing: 3px; }
  .mandi-info-box { border: 2px solid #5a7a3a; padding: 10px; margin: 10px 0; background: #f8fbf4; }
  .mandi-info-row { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px; line-height: 1.8; }
  .mandi-info-item { min-width: 150px; }
  .mandi-info-label { font-size: 10px; text-transform: uppercase; color: #7a8a5a; }
  .mandi-info-val { font-weight: bold; color: #2d2200; }
  .mandi-meta { display: flex; justify-content: space-between; font-size: 12px; margin: 10px 0; }
  .mandi-table { width: 100%; border-collapse: collapse; margin: 8px 0; border: 2px solid #5a7a3a; }
  .mandi-table th { background: #5a7a3a; color: #fff; font-size: 11px; padding: 6px; text-align: left; text-transform: uppercase; }
  .mandi-table th.num { text-align: right; }
  .mandi-table td { padding: 5px 6px; border: 1px solid #c5d5a5; font-size: 12px; }
  .mandi-table td.num { text-align: right; }
  .mandi-table tbody tr:nth-child(even) { background: #f4f8ee; }
  .mandi-goods-total { font-weight: bold; background: #e8f0d8 !important; }
  .mandi-charges-box { border: 2px solid #8a6a3a; padding: 8px; margin: 10px 0; background: #faf6ee; }
  .mandi-charges-title { font-size: 12px; font-weight: bold; color: #5a4a2a; margin-bottom: 6px; text-transform: uppercase; }
  .mandi-charge-row { display: flex; justify-content: space-between; font-size: 12px; line-height: 1.8; }
  .mandi-charges-total { display: flex; justify-content: space-between; font-weight: bold; border-top: 1px solid #8a6a3a; margin-top: 4px; padding-top: 4px; font-size: 13px; }
  .mandi-bill-total { display: flex; justify-content: space-between; background: #5a7a3a; color: #fff; padding: 10px 16px; font-size: 18px; font-weight: bold; margin-top: 12px; }
  .mandi-sign { margin-top: 40px; display: flex; justify-content: space-between; font-size: 11px; color: #888; }
  .mandi-sig-line { border-top: 1px solid #aaa; padding-top: 4px; min-width: 180px; text-align: center; }
  .mandi-footer { text-align: center; font-size: 10px; color: #aaa; margin-top: 16px; }
  .print-btn { display: block; margin: 16px auto 0; padding: 8px 24px; background: #5a7a3a; color: #fff; border: none; border-radius: 4px; font-size: 14px; cursor: pointer; }
  @media print { body { padding: 0; } .no-print { display: none; } }
`;

function marketBill(bill: BillPrintData, shop: ShopProfile): string {
  const m = bill.market || {};
  const yard = m.marketYard ? yardById(m.marketYard) : null;
  const yardName = yard?.name || m.marketYard || '—';
  const items = bill.items.filter((it) => it.kind !== 'charge');
  const charges = bill.items.filter((it) => it.kind === 'charge');
  const goodsSum = goodsTotal(bill.items);
  const chargesSum = chargesTotal(bill.items);

  const itemRows = items.map((it, i) => `<tr>
    <td style="text-align:center">${i + 1}</td>
    <td>${esc(it.name)}</td>
    <td class="num">${esc(it.qty || '—')}</td>
    <td class="num">${esc(it.rate || '—')}</td>
    <td class="num">${money(it.amount)}</td>
  </tr>`).join('\n');

  const chargesBox = charges.length > 0 ? `
    <div class="mandi-charges-box">
      <div class="mandi-charges-title">Charges / Commission</div>
      ${charges.map((it) => `<div class="mandi-charge-row"><span>${esc(it.name)}</span><span>${money(it.amount)}</span></div>`).join('\n')}
      <div class="mandi-charges-total"><span>Total Charges</span><span>${money(chargesSum)}</span></div>
    </div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Market Bill ${esc(bill.billNo || '')}</title>
  <style>${MARKET_STYLES}</style></head><body>
  <div class="mandi">
    <div class="mandi-header">
      <div class="mandi-shop">${esc(shop.shopName || 'RVC Vegetable Shop')}</div>
      ${shop.shopAddress ? `<div class="mandi-addr">${esc(shop.shopAddress)}</div>` : ''}
      ${shop.shopPhone ? `<div class="mandi-phone">${esc(shop.shopPhone)}</div>` : ''}
    </div>
    <div class="mandi-title">MARKET BILL</div>
    <div class="mandi-meta">
      <div><strong>Customer:</strong> ${esc(bill.customerName)}</div>
      <div style="text-align:right"><strong>Bill No:</strong> ${esc(bill.billNo || '—')} &nbsp; <strong>Date:</strong> ${fmtDate(bill.date)}</div>
    </div>
    <div class="mandi-info-box">
      <div class="mandi-info-row">
        <div class="mandi-info-item"><div class="mandi-info-label">Market Yard</div><div class="mandi-info-val">${esc(yardName)}</div></div>
        <div class="mandi-info-item"><div class="mandi-info-label">Market Type</div><div class="mandi-info-val">${esc(m.marketType || '—')}</div></div>
        <div class="mandi-info-item"><div class="mandi-info-label">Seller</div><div class="mandi-info-val">${esc(m.sellerName || '—')}</div></div>
        <div class="mandi-info-item"><div class="mandi-info-label">Lot No</div><div class="mandi-info-val">${esc(m.lotNo || '—')}</div></div>
        <div class="mandi-info-item"><div class="mandi-info-label">Vehicle No</div><div class="mandi-info-val">${esc(m.vehicleNo || '—')}</div></div>
      </div>
    </div>
    <table class="mandi-table">
      <thead><tr><th style="width:30px">#</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>${itemRows}</tbody>
      <tfoot><tr class="mandi-goods-total"><td colspan="4">Goods Total</td><td class="num">${money(goodsSum)}</td></tr></tfoot>
    </table>
    ${chargesBox}
    <div class="mandi-bill-total"><span>BILL TOTAL</span><span>${money(bill.total)}</span></div>
    <div class="mandi-sign">
      <div class="mandi-sig-line">Customer Signature</div>
      <div class="mandi-sig-line">For ${esc(shop.shopName || 'Shop')}</div>
    </div>
    <div class="mandi-footer">Market bill · ${new Date().toLocaleString('en-IN')}</div>
  </div>
  ${printScript('Print Market Bill')}
  </body></html>`;
}

// ============================================================
// FORMAT 4: PATTI — 6 bills per A4 page (2 columns × 3 rows)
// Compact sections, each with shop name, customer, items, total
// ============================================================

const PATTI_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial', 'Helvetica', sans-serif; color: #000; background: #fff; }
  .patti-sheet {
    width: 210mm;
    height: 297mm;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr 1fr;
    gap: 0;
    border: 1px solid #000;
  }
  .patti-section {
    border: 0.5px solid #000;
    padding: 4mm 5mm;
    font-size: 9px;
    line-height: 1.35;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .patti-section:nth-child(odd) { border-right: 1px solid #000; }
  .patti-section:nth-child(-n+4) { border-bottom: 1px solid #000; }

  .patti-shop { text-align: center; font-weight: bold; font-size: 11px; border-bottom: 0.5px solid #000; padding-bottom: 2px; margin-bottom: 3px; }
  .patti-shop-addr { font-size: 7px; font-weight: normal; color: #444; }
  .patti-meta { display: flex; justify-content: space-between; font-size: 8px; margin-bottom: 3px; }
  .patti-customer { font-weight: bold; font-size: 9px; }
  .patti-table { width: 100%; border-collapse: collapse; flex: 1; }
  .patti-table th { font-size: 7px; text-transform: uppercase; border-bottom: 0.5px solid #000; padding: 1px 2px; text-align: left; }
  .patti-table th.num { text-align: right; }
  .patti-table td { font-size: 8px; padding: 1px 2px; border-bottom: 0.25px dotted #ccc; }
  .patti-table td.num { text-align: right; }
  .patti-table td.name { max-width: 35mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .patti-charges { font-size: 7px; margin-top: 2px; }
  .patti-charge-row { display: flex; justify-content: space-between; }
  .patti-total { display: flex; justify-content: space-between; border-top: 1px solid #000; margin-top: 3px; padding-top: 2px; font-weight: bold; font-size: 11px; }
  .patti-sign { margin-top: auto; padding-top: 4px; font-size: 7px; color: #888; text-align: center; border-top: 0.25px dotted #aaa; }

  .print-btn { display: block; margin: 10px auto 0; padding: 6px 18px; background: #333; color: #fff; border: none; font-size: 12px; cursor: pointer; }
  .no-print { display: none; }

  @page { size: A4; margin: 0; }
  @media print {
    body { background: #fff; }
    .patti-sheet { border: 1px solid #000; }
    .no-print { display: none; }
    .patti-page-break { page-break-after: always; }
    .patti-page-break:last-child { page-break-after: auto; }
  }
`;

function pattiSection(bill: BillPrintData, shop: ShopProfile): string {
  const items = bill.items.filter((it) => it.kind !== 'charge');
  const charges = bill.items.filter((it) => it.kind === 'charge');
  const goodsSum = goodsTotal(bill.items);

  const itemRows = items.map((it) => `<tr>
    <td class="name">${esc(it.name)}</td>
    <td class="num">${esc(it.qty || '')}</td>
    <td class="num">${esc(it.rate || '')}</td>
    <td class="num">${money(it.amount)}</td>
  </tr>`).join('\n');

  const chargeRows = charges.map((it) =>
    `<div class="patti-charge-row"><span>${esc(it.name)}</span><span>${money(it.amount)}</span></div>`
  ).join('\n');

  return `<div class="patti-section">
    <div class="patti-shop">
      ${esc(shop.shopName || 'RVC Vegetable Shop')}
      ${shop.shopAddress ? `<div class="patti-shop-addr">${esc(shop.shopAddress)}</div>` : ''}
    </div>
    <div class="patti-meta">
      <span>No: ${esc(bill.billNo || '—')}</span>
      <span>${fmtDate(bill.date)}</span>
    </div>
    <div class="patti-customer">${esc(bill.customerName)}</div>
    <table class="patti-table">
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amt</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    ${chargeRows ? `<div class="patti-charges">${chargeRows}</div>` : ''}
    ${charges.length > 0 ? `<div class="patti-charge-row" style="font-weight:bold;font-size:8px"><span>Goods</span><span>${money(goodsSum)}</span></div>` : ''}
    <div class="patti-total"><span>TOTAL</span><span>${money(bill.total)}</span></div>
    <div class="patti-sign">Authorized Signatory</div>
  </div>`;
}

function pattiSheet(bills: BillPrintData[], shop: ShopProfile): string {
  // Group bills into pages of 6
  const pages: BillPrintData[][] = [];
  for (let i = 0; i < bills.length; i += 6) {
    pages.push(bills.slice(i, i + 6));
  }

  const sheets = pages.map((pageBills, pageIdx) => {
    // Fill to 6 sections with empty placeholders if fewer than 6
    const sections: string[] = pageBills.map((b) => pattiSection(b, shop));
    while (sections.length < 6) {
      sections.push('<div class="patti-section"></div>');
    }
    return `<div class="patti-sheet patti-page-break">${sections.join('\n')}</div>`;
  }).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Patti - ${esc(shop.shopName || 'RVC')}</title>
  <style>${PATTI_STYLES}</style></head><body>
  ${sheets}
  <button class="print-btn no-print" onclick="window.print()">Print Patti</button>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
  </body></html>`;
}

export function renderBillHtml(bill: BillPrintData, shop: ShopProfile, format: BillFormat): string {
  switch (format) {
    case 'itemized':
      return itemizedBill(bill, shop);
    case 'market':
      return marketBill(bill, shop);
    case 'patti':
      return pattiSheet([bill], shop);
    case 'simple':
    default:
      return simpleBill(bill, shop);
  }
}

// Print multiple bills in one window (each on its own page)
export function renderBillsHtml(bills: BillPrintData[], shop: ShopProfile, format: BillFormat): string {
  if (bills.length === 0) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>No bills</title></head><body><p style="text-align:center;padding:40px;font-family:sans-serif">No bills found for this customer.</p></body></html>`;
  }

  // Patti format: 6 bills per A4 page
  if (format === 'patti') {
    return pattiSheet(bills, shop);
  }

  // Extract just the <style> and <body> content from each bill
  const pages = bills.map((bill, i) => {
    const html = renderBillHtml(bill, shop, format);
    // Extract style content
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    const styleContent = styleMatch ? styleMatch[1] : '';
    // Extract body content (between <body> and </body>)
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    const bodyContent = bodyMatch ? bodyMatch[1] : '';
    // Wrap each bill in a div with its own scoped style and page break
    return `<div class="bill-page" style="page-break-after: ${i < bills.length - 1 ? 'always' : 'auto'}">
      <style scoped>${styleContent}</style>
      ${bodyContent}
    </div>`;
  }).join('\n');

  // Combine all styles at the top, then all pages
  const allStyles = bills.map((bill) => {
    const html = renderBillHtml(bill, shop, format);
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    return styleMatch ? styleMatch[1] : '';
  }).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bills - ${esc(bills[0].customerName)}</title>
  <style>${allStyles}
    .bill-page { min-height: 100vh; }
    .no-print { display: none; }
    @media print { .bill-page { page-break-after: always; } .bill-page:last-child { page-break-after: auto; } }
  </style></head><body>
  ${pages}
  <button class="print-btn no-print" style="display:block;margin:16px auto 0;padding:8px 24px;background:#333;color:#fff;border:none;border-radius:4px;font-size:14px;cursor:pointer" onclick="window.print()">Print All</button>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
  </body></html>`;
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

export function printBills(bills: BillPrintData[], shop: ShopProfile, format: BillFormat): void {
  const html = renderBillsHtml(bills, shop, format);
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow popups to print bills');
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

// ============================================================
// CREDIT LEDGER PRINT — matches RVC "All" credit ledger format
// Two-column dot-matrix style: account code, name, amount, grand total
// ============================================================

export interface CreditLedgerEntry {
  code: string;      // account code or "OB"
  name: string;      // customer name (uppercase)
  phone?: string;    // optional phone on its own line
  amount: number;    // outstanding amount
  isCredit?: boolean; // "Cr" — credit in your favor
}

const LEDGER_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', 'Courier', monospace; color: #000; line-height: 1.4; padding: 15px; font-size: 11px; }
  .ledger { max-width: 800px; margin: 0 auto; }
  .ledger-header { text-align: center; margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 6px; }
  .ledger-title { font-size: 16px; font-weight: bold; letter-spacing: 2px; }
  .ledger-sub { font-size: 11px; margin-top: 2px; }
  .ledger-date { font-size: 11px; }
  .columns { display: flex; gap: 20px; margin-top: 8px; }
  .column { flex: 1; }
  .entry { white-space: pre; font-size: 11px; line-height: 1.5; }
  .entry-code { display: inline-block; width: 45px; }
  .entry-name { display: inline-block; }
  .entry-dots { color: #999; }
  .entry-amt { float: right; font-weight: bold; }
  .entry-phone { padding-left: 50px; color: #444; font-size: 10px; }
  .entry-cr { color: #000; font-style: italic; }
  .total-section { margin-top: 12px; text-align: right; }
  .total-line { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 6px 0; font-size: 14px; font-weight: bold; }
  .total-label { display: inline-block; min-width: 200px; text-align: right; }
  .page-footer { text-align: center; font-size: 10px; color: #888; margin-top: 15px; padding-top: 8px; border-top: 1px dashed #ccc; }
  .print-btn { display: block; margin: 15px auto 0; padding: 6px 20px; background: #8b2e2e; color: white; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; }
  .print-btn:hover { background: #6b2222; }
  @media print {
    body { padding: 0; font-size: 10px; }
    .ledger { max-width: 100%; }
    .no-print { display: none; }
    .columns { gap: 15px; }
  }
`;

function ledgerEntryHtml(entry: CreditLedgerEntry): string {
  const code = (entry.code || '').padEnd(4).slice(0, 4);
  const amtStr = entry.isCredit ? `${entry.amount} Cr` : String(entry.amount);
  const phoneLine = entry.phone ? `<div class="entry-phone">${esc(entry.phone)}</div>` : '';
  return `<div class="entry">
    <span class="entry-code">${esc(code)}</span>
    <span class="entry-name">${esc(entry.name.toUpperCase())}</span>
    <span class="entry-dots"> ${'.'.repeat(4)} </span>
    <span class="entry-amt ${entry.isCredit ? 'entry-cr' : ''}">${esc(amtStr)}</span>
    ${phoneLine}
  </div>`;
}

export function renderCreditLedgerHtml(
  entries: CreditLedgerEntry[],
  shop: ShopProfile,
  date: string,
  title = 'All'
): string {
  const total = entries.reduce((s, e) => s + (e.isCredit ? -e.amount : e.amount), 0);
  const totalStr = total.toLocaleString('en-IN');

  // Split entries into two columns
  const mid = Math.ceil(entries.length / 2);
  const leftCol = entries.slice(0, mid);
  const rightCol = entries.slice(mid);

  const leftHtml = leftCol.map(ledgerEntryHtml).join('\n');
  const rightHtml = rightCol.map(ledgerEntryHtml).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(shop.shopName || 'RVC')} - ${esc(title)}</title>
  <style>${LEDGER_STYLES}</style></head><body>
  <div class="ledger">
    <div class="ledger-header">
      <div class="ledger-title">${esc((shop.shopName || 'RVC').toUpperCase())}</div>
      <div class="ledger-sub">${esc(title.toUpperCase())}</div>
      <div class="ledger-date">Date: ${esc(date)}</div>
    </div>
    <div class="columns">
      <div class="column">${leftHtml}</div>
      <div class="column">${rightHtml}</div>
    </div>
    <div class="total-section">
      <div class="total-line">
        <span class="total-label">Total :</span> ${esc(totalStr)}
      </div>
    </div>
    <div class="page-footer no-print">
      ${esc(shop.shopName || 'RVC Ledger')} · ${entries.length} customers · Generated ${new Date().toLocaleString('en-IN')}
    </div>
  </div>
  <button class="print-btn no-print" onclick="window.print()">Print Ledger</button>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
  </body></html>`;
}

export function printCreditLedger(
  entries: CreditLedgerEntry[],
  shop: ShopProfile,
  date?: string,
  title?: string
): void {
  const d = date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
  const html = renderCreditLedgerHtml(entries, shop, d, title);
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow popups to print the ledger');
    return;
  }
  win.document.write(html);
  win.document.close();
}
