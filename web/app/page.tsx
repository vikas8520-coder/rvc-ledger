import { getCustomers, isDbConfigured } from '@/lib/db';
import { Customer } from '@/lib/types';

export const dynamic = 'force-dynamic';

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(y, m - 1, day);
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function Home() {
  const customers: Customer[] = await getCustomers().catch(() => []);
  const totalBilled = customers.reduce((s, c) => s + c.billed, 0);
  const totalPaid = customers.reduce((s, c) => s + c.paid, 0);
  const totalDue = customers.reduce((s, c) => s + c.due, 0);
  const configured = isDbConfigured();

  return (
    <main className="min-h-screen bg-[#f5f0e6] p-6 text-[#3a2f2f]">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">RVC Ledger</h1>
          <p className="text-sm text-[#8a7a6a]">
            {configured ? 'Live from Neon' : 'Preview from local CSV'}
          </p>
        </div>
        <a
          href="/upload"
          className="rounded-lg bg-[#8b2e2e] px-4 py-2 text-white hover:bg-[#6b2222]"
        >
          Upload bill
        </a>
      </header>

      <section className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#e8e0d2] p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-[#7a6a5a]">Billed</p>
          <p className="text-2xl font-bold">{fmt(totalBilled)}</p>
        </div>
        <div className="rounded-2xl bg-[#e8e0d2] p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-[#7a6a5a]">Paid</p>
          <p className="text-2xl font-bold">{fmt(totalPaid)}</p>
        </div>
        <div className="rounded-2xl bg-[#e8e0d2] p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-[#7a6a5a]">Due</p>
          <p className="text-2xl font-bold text-[#8b2e2e]">{fmt(totalDue)}</p>
        </div>
      </section>

      {customers.length === 0 && (
        <p className="text-center text-[#8a7a6a]">No bills yet. Upload your first bill to get started.</p>
      )}

      <section className="space-y-4">
        {customers.map((cust) => (
          <div key={cust.id} className="rounded-2xl bg-[#e8e0d2] p-4">
            <div className="mb-2 flex items-center justify-between border-b border-[#d9d0c2] pb-2">
              <h2 className="text-lg font-semibold">{cust.name}</h2>
              <div className="text-right text-sm">
                <p>Billed: {fmt(cust.billed)}</p>
                <p>Paid: {fmt(cust.paid)}</p>
                <p className="font-semibold text-[#8b2e2e]">Due: {fmt(cust.due)}</p>
              </div>
            </div>
            <div className="space-y-3">
              {cust.txns.map((t) => (
                <div key={t.id} className="rounded-xl bg-[#f5f0e6] p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#7a6a5a]">{fmtDate(t.date)}</p>
                      <p className="font-medium">{t.title}</p>
                    </div>
                    <p className={`font-semibold ${t.type === 'payment' ? 'text-[#2d6b4f]' : 'text-[#3a2f2f]'}`}>
                      {t.type === 'payment' ? '−' : '+'}
                      {fmt(t.amount)}
                    </p>
                  </div>
                  {t.items.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t border-[#e8e0d2] pt-2 text-sm">
                      {t.items.map(([name, detail], idx) => (
                        <li key={idx} className="flex justify-between">
                          <span>{name}</span>
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-right text-xs text-[#8a7a6a]">
                    balance after: {fmt(t.balanceAfter)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
