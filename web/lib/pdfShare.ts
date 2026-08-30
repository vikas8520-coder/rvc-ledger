import { jsPDF } from 'jspdf';
import { CreditLedgerEntry, ShopProfile, renderCreditLedgerHtml } from './billPrint';
import { Customer } from './types';
import { fmt, fmtDate } from './format';
import { formatCustomerName } from './i18n';

/**
 * Generate a credit ledger PDF as a blob.
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
  const colW = (pageW - margin * 2 - 10) / 2; // two columns with 10mm gap
  let y = margin;

  // Header
  doc.setFont('courier', 'bold');
  doc.setFontSize(16);
  doc.text((shop.shopName || 'RVC').toUpperCase(), pageW / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(11);
  doc.text(title.toUpperCase(), pageW / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(10);
  doc.text(`Date: ${date}`, pageW / 2, y, { align: 'center' });
  y += 4;
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // Split entries into two columns
  const mid = Math.ceil(entries.length / 2);
  const leftCol = entries.slice(0, mid);
  const rightCol = entries.slice(mid);
  const startY = y;
  const lineH = 6;

  const drawColumn = (col: CreditLedgerEntry[], x: number, startY: number) => {
    let cy = startY;
    for (const e of col) {
      if (cy > pageH - 25) {
        doc.addPage();
        cy = margin;
      }
      const code = (e.code || '').padEnd(4).slice(0, 4);
      const amtStr = e.isCredit ? `${e.amount} Cr` : String(e.amount);
      const name = e.name.toUpperCase();
      // Truncate name if too long
      const maxNameLen = 28;
      const displayName = name.length > maxNameLen ? name.slice(0, maxNameLen) : name;
      doc.setFont('courier', 'normal');
      doc.setFontSize(10);
      doc.text(code, x, cy);
      doc.text(displayName, x + 8, cy);
      const amtX = x + colW - 2;
      doc.text(amtStr, amtX, cy, { align: 'right' });
      cy += lineH;
      if (e.phone) {
        doc.setFontSize(8);
        doc.text(e.phone, x + 8, cy);
        doc.setFontSize(10);
        cy += lineH - 1;
      }
    }
    return cy;
  };

  const leftEnd = drawColumn(leftCol, margin, startY);
  const rightEnd = drawColumn(rightCol, margin + colW + 10, startY);
  y = Math.max(leftEnd, rightEnd) + 4;

  // Total
  if (y > pageH - 20) {
    doc.addPage();
    y = margin;
  }
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 6;
  const total = entries.reduce((s, e) => s + (e.isCredit ? -e.amount : e.amount), 0);
  doc.setFont('courier', 'bold');
  doc.setFontSize(14);
  doc.text(`Total :`, pageW - margin - 40, y);
  doc.text(total.toLocaleString('en-IN'), pageW - margin, y, { align: 'right' });
  y += 4;
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);

  // Footer
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.text(
    `${shop.shopName || 'RVC Ledger'} · ${entries.length} customers · Generated ${new Date().toLocaleString('en-IN')}`,
    pageW / 2,
    pageH - 8,
    { align: 'center' }
  );

  return doc.output('blob');
}

/**
 * Generate a customer statement PDF as a blob.
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

  // Shop header
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  if (shop.shopAddress) doc.text(shop.shopAddress, pageW - margin, y, { align: 'right' });
  doc.text(shop.shopName || 'RVC Vegetable Shop', pageW - margin, y - 4, { align: 'right' });
  if (shop.shopPhone) doc.text(shop.shopPhone || '', pageW - margin, y + 4, { align: 'right' });

  // Title
  y += 15;
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(139, 46, 46);
  doc.text('Customer Statement', margin, y);
  doc.setTextColor(0, 0, 0);

  // Customer info
  y += 10;
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.text(displayName, margin, y);
  y += 6;
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, margin, y);

  // Summary
  y += 10;
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.text('Summary', margin, y);
  y += 5;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.text('Total Billed', margin, y);
  doc.text(fmt(customer.billed), pageW - margin, y, { align: 'right' });
  y += 5;
  doc.text('Total Paid', margin, y);
  doc.text(fmt(customer.paid), pageW - margin, y, { align: 'right' });
  y += 5;
  doc.setFont('times', 'bold');
  doc.setTextColor(139, 46, 46);
  doc.text('Outstanding', margin, y);
  doc.text(fmt(customer.due), pageW - margin, y, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  y += 5;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);

  // Ledger
  y += 10;
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.text('Ledger', margin, y);
  y += 5;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  // Table header
  doc.setFont('times', 'bold');
  doc.setFontSize(9);
  doc.text('Date', margin, y);
  doc.text('Type', margin + 30, y);
  doc.text('Bill No', margin + 55, y);
  doc.text('Amount', pageW - margin, y, { align: 'right' });
  y += 4;
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  // Transactions
  doc.setFont('times', 'normal');
  for (const tx of customer.txns) {
    if (y > pageH - 20) {
      doc.addPage();
      y = margin;
    }
    const type = tx.type === 'bill' ? 'Bill' : 'Payment';
    const sign = tx.type === 'payment' ? '-' : '+';
    doc.text(fmtDate(tx.date), margin, y);
    doc.text(type, margin + 30, y);
    doc.text(tx.billNo || '', margin + 55, y);
    doc.text(`${sign}${fmt(tx.amount)}`, pageW - margin, y, { align: 'right' });
    y += 5;
  }

  // Footer
  y += 5;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 5;
  doc.setFont('times', 'italic');
  doc.setFontSize(8);
  doc.text(
    `Generated by ${shop.shopName || 'RVC Vegetable Shop'} on ${new Date().toLocaleString('en-IN')}`,
    pageW / 2,
    pageH - 10,
    { align: 'center' }
  );

  return doc.output('blob');
}

/**
 * Generate a full customer outstanding list PDF as a blob.
 */
export function generateOutstandingListPdf(
  customers: Customer[],
  shop: ShopProfile,
  uiLang: string
): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  // Header
  doc.setFont('courier', 'bold');
  doc.setFontSize(16);
  doc.text((shop.shopName || 'RVC').toUpperCase(), pageW / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(11);
  doc.text('CUSTOMER OUTSTANDING LIST', pageW / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(10);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, pageW / 2, y, { align: 'center' });
  y += 4;
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  const dueCustomers = customers.filter((c) => c.due > 0).sort((a, b) => b.due - a.due);

  // Table header
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.text('#', margin, y);
  doc.text('Customer Name', margin + 10, y);
  doc.text('Billed', pageW - margin - 50, y, { align: 'right' });
  doc.text('Paid', pageW - margin - 25, y, { align: 'right' });
  doc.text('Due', pageW - margin, y, { align: 'right' });
  y += 4;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  // Rows
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  for (let i = 0; i < dueCustomers.length; i++) {
    const c = dueCustomers[i];
    if (y > pageH - 20) {
      doc.addPage();
      y = margin;
    }
    const name = formatCustomerName(c, uiLang).toUpperCase();
    const displayName = name.length > 35 ? name.slice(0, 35) : name;
    doc.text(String(i + 1), margin, y);
    doc.text(displayName, margin + 10, y);
    doc.text(fmt(c.billed), pageW - margin - 50, y, { align: 'right' });
    doc.text(fmt(c.paid), pageW - margin - 25, y, { align: 'right' });
    doc.setFont('courier', 'bold');
    doc.text(fmt(c.due), pageW - margin, y, { align: 'right' });
    doc.setFont('courier', 'normal');
    y += 5;
  }

  // Total
  y += 3;
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 6;
  const totalDue = dueCustomers.reduce((s, c) => s + c.due, 0);
  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.text(`Total Customers: ${dueCustomers.length}`, margin, y);
  doc.text(`Total Outstanding: ${fmt(totalDue)}`, pageW - margin, y, { align: 'right' });

  // Footer
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.text(
    `${shop.shopName || 'RVC Ledger'} · Generated ${new Date().toLocaleString('en-IN')}`,
    pageW / 2,
    pageH - 8,
    { align: 'center' }
  );

  return doc.output('blob');
}

/**
 * Share a PDF blob via WhatsApp using the Web Share API (mobile).
 * Falls back to download on desktop.
 */
export async function sharePdfViaWhatsApp(
  blob: Blob,
  filename: string,
  fallbackText?: string
): Promise<'shared' | 'downloaded' | 'text'> {
  // Check if Web Share API with files is supported
  const file = new File([blob], filename, { type: 'application/pdf' });

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
      // Fall through to download
    }
  }

  // Fallback: download the PDF
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
