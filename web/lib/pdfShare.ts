import { jsPDF } from 'jspdf';
import { CreditLedgerEntry, ShopProfile, BillPrintData, BillFormat } from './billPrint';
import { Customer, TxnView } from './types';
import { fmt, fmtDate } from './format';
import { formatCustomerName } from './i18n';
import { goodsTotal, chargesTotal } from './market';

function money(n: number): string {
  return 'Rs ' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/**
 * Generate a credit ledger PDF (dot-matrix two-column format).
 */
export function generateCreditLedgerPdf(
  entries: CreditLedgerEntry[],
  shop: ShopProfile,
  date: string,
  title = 'All'
): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const colW = (pageW - margin * 2 - 10) / 2;
  let y = margin;

  // Header
  doc.setFont('courier', 'bold');
  doc.setFontSize(16);
  doc.text((shop.shopName || 'RVC').toUpperCase(), pageW / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(11);
  doc.text(title.toUpperCase(), pageW / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(10);
  doc.text(`Date: ${date}`, pageW / 2, y, { align: 'center' });
  y += 3;
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  const mid = Math.ceil(entries.length / 2);
  const leftCol = entries.slice(0, mid);
  const rightCol = entries.slice(mid);
  const startY = y;
  const lineH = 5.5;

  const drawColumn = (col: CreditLedgerEntry[], x: number, sy: number) => {
    let cy = sy;
    for (const e of col) {
      if (cy > pageH - 25) { doc.addPage(); cy = margin; }
      const code = (e.code || '').padEnd(4).slice(0, 4);
      const amtStr = e.isCredit ? `${e.amount} Cr` : String(e.amount);
      const name = e.name.toUpperCase();
      const maxNameLen = 26;
      const displayName = name.length > maxNameLen ? name.slice(0, maxNameLen) : name;
      doc.setFont('courier', 'normal');
      doc.setFontSize(10);
      doc.text(code, x, cy);
      doc.text(displayName, x + 9, cy);
      doc.text(amtStr, x + colW, cy, { align: 'right' });
      cy += lineH;
      if (e.phone) {
        doc.setFontSize(8);
        doc.text(e.phone, x + 9, cy);
        doc.setFontSize(10);
        cy += lineH - 1;
      }
    }
    return cy;
  };

  const leftEnd = drawColumn(leftCol, margin, startY);
  const rightEnd = drawColumn(rightCol, margin + colW + 10, startY);
  y = Math.max(leftEnd, rightEnd) + 4;

  if (y > pageH - 20) { doc.addPage(); y = margin; }
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 7;
  const total = entries.reduce((s, e) => s + (e.isCredit ? -e.amount : e.amount), 0);
  const totalStr = total.toLocaleString('en-IN');
  doc.setFont('courier', 'bold');
  doc.setFontSize(14);
  // Right-align "Total :" with enough gap before the amount
  doc.text('Total :', pageW - margin - 50, y, { align: 'right' });
  doc.text(totalStr, pageW - margin, y, { align: 'right' });
  y += 4;
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);

  // Footer
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.text(
    `${shop.shopName || 'RVC Ledger'} | ${entries.length} customers | Generated ${new Date().toLocaleString('en-IN')}`,
    pageW / 2, pageH - 8, { align: 'center' }
  );

  return doc.output('blob');
}

/**
 * Generate Dues Summary PDF (table with names, billed, paid, due).
 * Uses alternating row shading and horizontal lines for clear separation.
 */
export function generateOutstandingListPdf(
  customers: Customer[],
  shop: ShopProfile,
  uiLang: string
): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  let y = margin + 4;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text((shop.shopName || 'RVC').toUpperCase(), pageW / 2, y, { align: 'center' });
  y += 8;
  doc.setFontSize(12);
  doc.text('DUES SUMMARY', pageW / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, pageW / 2, y, { align: 'center' });
  y += 5;
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 9;

  const dueCustomers = customers.filter((c) => c.due > 0).sort((a, b) => b.due - a.due);

  // Column positions
  const colNo = margin;
  const colName = margin + 12;
  const colBilled = pageW - margin - 62;
  const colPaid = pageW - margin - 33;
  const colDue = pageW - margin;
  const tableW = pageW - margin * 2;

  // Helper: draw table header row
  const drawTableHeader = () => {
    // Header background
    doc.setFillColor(240, 235, 225);
    doc.rect(margin, y - 5, tableW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('#', colNo, y);
    doc.text('Customer Name', colName, y);
    doc.text('Billed', colBilled, y, { align: 'right' });
    doc.text('Paid', colPaid, y, { align: 'right' });
    doc.text('Due', colDue, y, { align: 'right' });
    y += 5;
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageW - margin, y);
    y += 7;
  };

  drawTableHeader();

  // Rows with alternating shading and line separators
  const rowH = 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (let i = 0; i < dueCustomers.length; i++) {
    const c = dueCustomers[i];

    if (y > pageH - 30) {
      doc.addPage();
      y = margin + 4;
      drawTableHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
    }

    // Alternating row background (light shading for even rows)
    if (i % 2 === 1) {
      doc.setFillColor(248, 246, 242);
      doc.rect(margin, y - 5, tableW, rowH, 'F');
    }

    const name = formatCustomerName(c, uiLang);
    const displayName = name.length > 34 ? name.slice(0, 34) + '…' : name;
    doc.text(String(i + 1), colNo, y);
    doc.text(displayName, colName, y);
    doc.text(fmt(c.billed), colBilled, y, { align: 'right' });
    doc.text(fmt(c.paid), colPaid, y, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(fmt(c.due), colDue, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    y += rowH;
    // Light separator line between rows
    doc.setLineWidth(0.1);
    doc.setDrawColor(210, 205, 195);
    doc.line(margin, y - 1, pageW - margin, y - 1);
  }

  // Total section
  y += 2;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 8;
  // Total background
  doc.setFillColor(240, 235, 225);
  doc.rect(margin, y - 6, tableW, 9, 'F');
  const totalDue = dueCustomers.reduce((s, c) => s + c.due, 0);
  const totalBilled = dueCustomers.reduce((s, c) => s + c.billed, 0);
  const totalPaid = dueCustomers.reduce((s, c) => s + c.paid, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Total (${dueCustomers.length} customers)`, colName, y);
  doc.text(fmt(totalBilled), colBilled, y, { align: 'right' });
  doc.text(fmt(totalPaid), colPaid, y, { align: 'right' });
  doc.text(fmt(totalDue), colDue, y, { align: 'right' });
  y += 5;
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `${shop.shopName || 'RVC Ledger'} | Generated ${new Date().toLocaleString('en-IN')}`,
    pageW / 2, pageH - 10, { align: 'center' }
  );
  doc.setTextColor(0, 0, 0);

  return doc.output('blob');
}

/**
 * Generate a customer statement PDF (all transactions for one customer).
 */
export function generateStatementPdf(
  customer: Customer,
  shop: ShopProfile,
  displayName: string
): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  let y = margin;

  // Shop header (right-aligned)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(shop.shopName || 'RVC Vegetable Shop', pageW - margin, y, { align: 'right' });
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (shop.shopAddress) { doc.text(shop.shopAddress, pageW - margin, y, { align: 'right' }); y += 4; }
  if (shop.shopPhone) { doc.text(shop.shopPhone, pageW - margin, y, { align: 'right' }); y += 4; }

  // Title
  y = margin + 15;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(139, 46, 46);
  doc.text('Customer Statement', margin, y);
  doc.setTextColor(0, 0, 0);

  // Customer info
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(displayName, margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, margin, y);

  // Summary
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Summary', margin, y);
  y += 4;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Total Billed', margin, y);
  doc.text(fmt(customer.billed), pageW - margin, y, { align: 'right' });
  y += 5;
  doc.text('Total Paid', margin, y);
  doc.text(fmt(customer.paid), pageW - margin, y, { align: 'right' });
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(139, 46, 46);
  doc.text('Outstanding', margin, y);
  doc.text(fmt(customer.due), pageW - margin, y, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  y += 4;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);

  // Ledger table
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Ledger', margin, y);
  y += 4;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // Table header
  const colDate = margin;
  const colType = margin + 35;
  const colBill = margin + 65;
  const colAmt = pageW - margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Date', colDate, y);
  doc.text('Type', colType, y);
  doc.text('Bill No', colBill, y);
  doc.text('Amount', colAmt, y, { align: 'right' });
  y += 3;
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // Transactions
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const tx of customer.txns) {
    if (y > pageH - 20) { doc.addPage(); y = margin; }
    const type = tx.type === 'bill' ? 'Bill' : 'Payment';
    const sign = tx.type === 'payment' ? '-' : '+';
    doc.text(fmtDate(tx.date), colDate, y);
    doc.text(type, colType, y);
    doc.text(tx.billNo || '', colBill, y);
    doc.text(`${sign}${fmt(tx.amount)}`, colAmt, y, { align: 'right' });
    y += 5;
  }

  // Footer
  y += 3;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text(
    `Generated by ${shop.shopName || 'RVC Vegetable Shop'} on ${new Date().toLocaleString('en-IN')}`,
    pageW / 2, pageH - 10, { align: 'center' }
  );

  return doc.output('blob');
}

/**
 * Generate simple bill PDF (thermal receipt style).
 */
export function generateSimpleBillPdf(bill: BillPrintData, shop: ShopProfile): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  const receiptW = 80; // narrow receipt
  const x = (pageW - receiptW) / 2;
  let y = 25;

  doc.setFont('courier', 'bold');
  doc.setFontSize(14);
  doc.text(shop.shopName || 'RVC Vegetable Shop', pageW / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  if (shop.shopAddress) { doc.text(shop.shopAddress, pageW / 2, y, { align: 'center' }); y += 4; }
  if (shop.shopPhone) { doc.text(shop.shopPhone, pageW / 2, y, { align: 'center' }); y += 4; }

  y += 3;
  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.text('RECEIPT', pageW / 2, y, { align: 'center' });
  y += 6;

  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  doc.text(`Bill No: ${bill.billNo || '-'}`, x, y);
  doc.text(`Date: ${fmtDate(bill.date)}`, x + receiptW, y, { align: 'right' });
  y += 5;
  doc.text(`Customer: ${bill.customerName}`, x, y);
  y += 4;
  doc.setLineWidth(0.2);
  doc.line(x, y, x + receiptW, y);
  y += 5;

  const items = bill.items.filter((it) => it.kind !== 'charge');
  const charges = bill.items.filter((it) => it.kind === 'charge');
  const goodsSum = goodsTotal(bill.items);

  for (const it of items) {
    const name = it.name.length > 25 ? it.name.slice(0, 25) : it.name;
    doc.text(name, x, y);
    doc.text(money(it.amount), x + receiptW, y, { align: 'right' });
    y += 4;
    if (it.qty || it.rate) {
      doc.setFontSize(7);
      doc.text(`${it.qty || ''} x ${it.rate || ''}`, x + 3, y);
      doc.setFontSize(9);
      y += 3;
    }
  }

  if (charges.length > 0) {
    y += 2;
    doc.setLineWidth(0.1);
    doc.line(x, y, x + receiptW, y);
    y += 4;
    for (const it of charges) {
      doc.text(it.name, x, y);
      doc.text(money(it.amount), x + receiptW, y, { align: 'right' });
      y += 4;
    }
    doc.setFont('courier', 'bold');
    doc.text('Goods Total', x, y);
    doc.text(money(goodsSum), x + receiptW, y, { align: 'right' });
    y += 4;
    doc.setFont('courier', 'normal');
  }

  y += 2;
  doc.setLineWidth(0.5);
  doc.line(x, y, x + receiptW, y);
  y += 5;
  doc.setFont('courier', 'bold');
  doc.setFontSize(14);
  doc.text('TOTAL', x, y);
  doc.text(money(bill.total), x + receiptW, y, { align: 'right' });
  y += 5;
  doc.setLineWidth(0.5);
  doc.line(x, y, x + receiptW, y);
  y += 15;

  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.text('Authorized Signature', pageW / 2, y, { align: 'center' });
  y += 10;
  doc.text(`Thank you! | ${shop.shopName || 'RVC'}`, pageW / 2, y, { align: 'center' });

  return doc.output('blob');
}

/**
 * Generate itemized bill PDF (professional invoice with table).
 */
export function generateItemizedBillPdf(bill: BillPrintData, shop: ShopProfile): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  let y = margin;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(44, 62, 80);
  doc.text(shop.shopName || 'RVC Vegetable Shop', margin, y);
  doc.setTextColor(0, 0, 0);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  if (shop.shopAddress) { doc.text(shop.shopAddress, margin, y); y += 4; }
  if (shop.shopPhone) { doc.text(shop.shopPhone, margin, y); y += 4; }

  // Invoice title (right)
  doc.setFillColor(44, 62, 80);
  doc.rect(pageW - margin - 40, margin - 5, 40, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('INVOICE', pageW - margin - 20, margin + 3, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // Meta
  y = margin + 15;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Bill To:', margin, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(bill.customerName, margin, y);
  y += 6;

  // Right side meta
  const rx = pageW - margin - 50;
  let ry = margin + 15;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Bill No:', rx, ry);
  doc.setFont('helvetica', 'bold');
  doc.text(bill.billNo || '-', rx + 25, ry);
  ry += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Date:', rx, ry);
  doc.setFont('helvetica', 'bold');
  doc.text(fmtDate(bill.date), rx + 25, ry);

  // Table
  y += 5;
  const colItem = margin;
  const colQty = pageW - margin - 55;
  const colRate = pageW - margin - 30;
  const colAmt = pageW - margin;
  const tableW = pageW - margin * 2;

  // Header row
  doc.setFillColor(44, 62, 80);
  doc.rect(margin, y - 4, tableW, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('#', margin + 3, y + 1);
  doc.text('Item Name', margin + 12, y + 1);
  doc.text('Qty', colQty, y + 1, { align: 'right' });
  doc.text('Rate', colRate, y + 1, { align: 'right' });
  doc.text('Amount', colAmt, y + 1, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  y += 8;

  // Items
  const items = bill.items.filter((it) => it.kind !== 'charge');
  const charges = bill.items.filter((it) => it.kind === 'charge');
  const goodsSum = goodsTotal(bill.items);
  const chargesSum = chargesTotal(bill.items);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (y > pageH - 40) { doc.addPage(); y = margin; }
    const name = it.name.length > 35 ? it.name.slice(0, 35) + '…' : it.name;
    doc.text(String(i + 1), margin + 3, y);
    doc.text(name, margin + 12, y);
    doc.text(it.qty || '-', colQty, y, { align: 'right' });
    doc.text(it.rate || '-', colRate, y, { align: 'right' });
    doc.text(money(it.amount), colAmt, y, { align: 'right' });
    y += 6;
    // Light row separator
    doc.setLineWidth(0.1);
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y - 2, pageW - margin, y - 2);
  }

  // Goods total
  y += 2;
  doc.setFillColor(238, 242, 247);
  doc.rect(margin, y - 4, tableW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Goods Total', margin + 3, y + 1);
  doc.text(money(goodsSum), colAmt, y + 1, { align: 'right' });
  y += 8;

  // Charges
  if (charges.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Charges', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    for (const it of charges) {
      doc.text(it.name, margin + 5, y);
      doc.text(money(it.amount), colAmt, y, { align: 'right' });
      y += 5;
    }
    doc.setFont('helvetica', 'bold');
    doc.text('Total Charges', margin + 5, y);
    doc.text(money(chargesSum), colAmt, y, { align: 'right' });
    y += 6;
  }

  // Grand total
  y += 5;
  doc.setFillColor(44, 62, 80);
  doc.rect(pageW - margin - 60, y - 5, 60, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('GRAND TOTAL:', pageW - margin - 55, y + 3);
  doc.text(money(bill.total), pageW - margin - 2, y + 3, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // Signatures
  y += 30;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + 60, y);
  doc.text('Customer Signature', margin + 20, y + 5);
  doc.line(pageW - margin - 60, y, pageW - margin, y);
  doc.text(`For ${shop.shopName || 'Shop'}`, pageW - margin - 45, y + 5);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Computer-generated invoice | ${new Date().toLocaleString('en-IN')}`,
    pageW / 2, pageH - 10, { align: 'center' }
  );

  return doc.output('blob');
}

/**
 * Generate Compact Bills PDF (6 bills per A4 page, 2 columns x 3 rows).
 * All text is carefully padded inside borders to prevent overlap.
 */
export function generatePattiPdf(bills: BillPrintData[], shop: ShopProfile): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  const margin = 8;
  const colGap = 3;
  const rowGap = 3;
  const colW = (pageW - margin * 2 - colGap) / 2;
  const rowH = (pageH - margin * 2 - rowGap * 2) / 3;
  const pad = 5; // inner padding from border

  // Group bills into pages of 6
  for (let page = 0; page < Math.ceil(bills.length / 6); page++) {
    if (page > 0) doc.addPage();
    const pageBills = bills.slice(page * 6, page * 6 + 6);

    for (let i = 0; i < 6; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = margin + col * (colW + colGap);
      const y0 = margin + row * (rowH + rowGap);
      const innerLeft = x + pad;
      const innerRight = x + colW - pad;
      const innerW = colW - pad * 2;

      // Draw border
      doc.setLineWidth(0.3);
      doc.rect(x, y0, colW, rowH);

      if (i >= pageBills.length) continue;

      const bill = pageBills[i];
      const items = bill.items.filter((it) => it.kind !== 'charge');
      const charges = bill.items.filter((it) => it.kind === 'charge');
      const goodsSum = goodsTotal(bill.items);

      // Start content well below the top border
      let cy = y0 + 7;

      // Shop name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      const shopName = shop.shopName || 'RVC Vegetable Shop';
      doc.text(shopName.length > 26 ? shopName.slice(0, 26) : shopName, x + colW / 2, cy, { align: 'center' });
      cy += 4.5;

      // Address
      if (shop.shopAddress) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        const addr = shop.shopAddress.length > 34 ? shop.shopAddress.slice(0, 34) : shop.shopAddress;
        doc.text(addr, x + colW / 2, cy, { align: 'center' });
        cy += 3.5;
      }

      // Separator line after header
      cy += 1.5;
      doc.setLineWidth(0.2);
      doc.line(innerLeft, cy, innerRight, cy);
      cy += 5;

      // Meta: bill no and date
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`No: ${bill.billNo || '-'}`, innerLeft, cy);
      doc.text(fmtDate(bill.date), innerRight, cy, { align: 'right' });
      cy += 4.5;

      // Customer name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      const custName = bill.customerName.length > 30 ? bill.customerName.slice(0, 30) + '…' : bill.customerName;
      doc.text(custName, innerLeft, cy);
      cy += 4.5;

      // Table header with line below
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setLineWidth(0.15);
      doc.line(innerLeft, cy - 2, innerRight, cy - 2);
      doc.text('Item', innerLeft, cy);
      doc.text('Bags', innerRight - 30, cy, { align: 'right' });
      doc.text('Qty', innerRight - 20, cy, { align: 'right' });
      doc.text('Rate', innerRight - 10, cy, { align: 'right' });
      doc.text('Amt', innerRight, cy, { align: 'right' });
      cy += 2;
      doc.line(innerLeft, cy, innerRight, cy);
      cy += 4.5;

      // Items (max 8 to fit with comfortable spacing)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const maxItems = 8;
      const showItems = items.slice(0, maxItems);
      const itemH = 4.5;
      const bottomLimit = y0 + rowH - 22; // leave room for total + signature
      for (const it of showItems) {
        if (cy > bottomLimit) break;
        const name = it.name.length > 14 ? it.name.slice(0, 14) : it.name;
        doc.text(name, innerLeft, cy);
        doc.text(it.bags || '', innerRight - 30, cy, { align: 'right' });
        doc.text(it.qty || '', innerRight - 20, cy, { align: 'right' });
        doc.text(it.rate || '', innerRight - 10, cy, { align: 'right' });
        doc.text(money(it.amount), innerRight, cy, { align: 'right' });
        cy += itemH;
      }
      if (items.length > maxItems) {
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        doc.text(`+ ${items.length - maxItems} more items`, x + colW / 2, cy, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        cy += 4;
        doc.setFontSize(8);
      }

      // Charges
      if (charges.length > 0 && cy < bottomLimit) {
        cy += 1;
        for (const it of charges) {
          if (cy > bottomLimit) break;
          doc.setFontSize(7);
          doc.text(it.name, innerLeft, cy);
          doc.text(money(it.amount), innerRight, cy, { align: 'right' });
          cy += 4;
        }
        if (charges.length > 0) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.text('Goods', innerLeft, cy);
          doc.text(money(goodsSum), innerRight, cy, { align: 'right' });
          cy += 4;
          doc.setFont('helvetica', 'normal');
        }
      }

      // Total — anchored at bottom with clear space from border
      const totalY = y0 + rowH - 10;
      doc.setLineWidth(0.3);
      doc.line(innerLeft, totalY - 4, innerRight, totalY - 4);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('TOTAL', innerLeft, totalY);
      doc.text(money(bill.total), innerRight, totalY, { align: 'right' });

      // Signature — well inside the bottom border
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(130, 130, 130);
      doc.text('Authorized Signatory', x + colW / 2, y0 + rowH - 3.5, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }
  }

  return doc.output('blob');
}

/**
 * Generate bills PDF for a customer in the specified format.
 * For simple/itemized: each bill on its own page.
 * For patti: 6 bills per A4 page.
 */
export function generateBillsPdf(
  bills: BillPrintData[],
  shop: ShopProfile,
  format: 'simple' | 'itemized' | 'patti'
): Blob {
  if (format === 'patti') {
    return generatePattiPdf(bills, shop);
  }

  if (bills.length === 0) {
    // Return empty PDF
    return new jsPDF().output('blob');
  }

  // For simple/itemized with multiple bills, use patti format
  if (bills.length > 1) {
    return generatePattiPdf(bills, shop);
  }

  // Single bill
  return format === 'simple'
    ? generateSimpleBillPdf(bills[0], shop)
    : generateItemizedBillPdf(bills[0], shop);
}

/**
 * Share a PDF blob via WhatsApp using the Web Share API (mobile).
 * On desktop: opens WhatsApp Web FIRST (synchronously to avoid popup
 * blocker), then downloads the PDF for manual attachment.
 */
export async function sharePdfViaWhatsApp(
  blob: Blob,
  filename: string,
  fallbackText?: string
): Promise<'shared' | 'downloaded' | 'text'> {
  const file = new File([blob], filename, { type: 'application/pdf' });

  // Mobile: use Web Share API which opens the native share sheet
  // (WhatsApp appears as an option on mobile)
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: filename,
        text: fallbackText || '',
      });
      return 'shared';
    } catch (err: any) {
      if (err.name === 'AbortError') return 'text';
    }
  }

  // Desktop fallback: open WhatsApp Web FIRST (synchronously, before
  // any async operations, so popup blockers don't block it)
  const text = encodeURIComponent(fallbackText || filename);
  const waWin = window.open(`https://web.whatsapp.com/send?text=${text}`, '_blank');

  // Then download the PDF
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  // If popup was blocked, show a clickable link
  if (!waWin || waWin.closed) {
    alert(
      `WhatsApp Web was blocked by your browser popup blocker.\n\n` +
      `The PDF has been downloaded.\n\n` +
      `Please open WhatsApp Web manually: https://web.whatsapp.com\n` +
      `Then attach the downloaded file: ${filename}`
    );
  }

  return 'downloaded';
}

/**
 * Print a PDF blob by opening it in a new window and triggering print.
 */
export function printPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    alert('Please allow popups to print');
    return;
  }
  // The browser's PDF viewer has its own print button, but we can
  // try to trigger print automatically after a short delay
  setTimeout(() => {
    try { win.print(); } catch { /* user can print manually */ }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }, 1000);
}

/**
 * Copy a PDF blob to the clipboard so the user can paste (Cmd+V)
 * into WhatsApp Web to attach the file.
 *
 * Tries PDF first. If the browser doesn't support PDF in clipboard
 * (e.g. Safari), falls back to trying text/plain with filename.
 * Returns true if any copy succeeded.
 */
export async function copyPdfToClipboard(blob: Blob): Promise<boolean> {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    return false;
  }
  // Try PDF directly (works in Chrome)
  try {
    const item = new ClipboardItem({ 'application/pdf': blob });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    // Safari doesn't support application/pdf in clipboard
  }
  // Fallback: try with text/plain containing a note
  try {
    const textBlob = new Blob(['PDF file — paste from Downloads'], { type: 'text/plain' });
    const item = new ClipboardItem({ 'text/plain': textBlob });
    await navigator.clipboard.write([item]);
    return false; // text copy worked but it's not the PDF
  } catch {
    return false;
  }
}
