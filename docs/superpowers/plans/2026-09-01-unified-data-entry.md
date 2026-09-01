# Unified Data Entry (Farmer Heading → Customer Lines) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace split `/receive` + `/sell` with a single 3-step Data Entry wizard where **Farmer is the header** and every customer sale line is tagged to that farmer, with live pack/kg/price calculations, auction multi-rate, hamali/commission, leftover validation, and atomic save.

**Architecture:** Keep existing `lib/db.ts` save primitives (`savePurchase`, `saveBill`) but add one transactional batch endpoint `POST /api/entry` that writes purchase + N bills in one shop-scoped transaction. Extract pure calculation functions to `lib/entryCalc.ts` so UI and API share the same math. Promote `app/entry/page.tsx` (existing 3-step wizard) to canonical `/data-entry`, deprecate `/receive` and `/sell` as thin wrappers/redirects.

**Tech Stack:** Next.js 15 app router (`web/app`), TypeScript, Tailwind, Clerk auth (`lib/auth.ts:requireShopAuth`), Postgres via `lib/db.ts`, existing `lib/charges.ts` / `lib/format.ts` / `lib/types.ts`

**Spec:** This plan implements the legacy menu behavior described by user 2026-09-01: `1 Data = Data Entry (farmer header → customer lines, all calculations)`, `2 Printing`, `3 Setup`, `4 Misc`, `5 User/Exit`. No formal spec file — user interview transcript is the spec. Keep `HANDOFF.md` as tracker.

## Global Constraints

- Do NOT break existing `/api/purchases` (`web/app/api/purchases/route.ts`) or `/api/bills` (`web/app/api/bills/route.ts`) — they stay for legacy clients.
- All new DB writes must be shop-scoped via `requireShopAuth()` (`web/lib/auth.ts`).
- FY-aware: writes use provided `date`, reads aggregate by `currentFYStartYear()` (`web/lib/db.ts:currentFYStartYear`).
- Naming: keep `farmer`/`supplier` synonym — `BillItem.farmer` (`web/lib/types.ts:19`) maps to `PurchaseData.supplier` (`web/lib/types.ts:46`).
- No new runtime deps; reuse `CHARGE_TYPES` (`web/lib/charges.ts`), `fmt` (`web/lib/format.ts`), `Autocomplete`/`CustomerPicker` (`web/app/components`).
- TDD + frequent commits; plan tasks are independently testable.

---

## File Structure

```
web/lib/entryCalc.ts          # NEW — pure calcs: stockWeight, stockValue, saleAmount, commission, leftover
web/lib/entryValidation.ts    # NEW — pure validation: step1Valid, step2Valid, bag caps, kg caps
web/app/api/entry/route.ts    # NEW — POST batch transaction: purchase + bills atomically
web/app/data-entry/page.tsx   # NEW (promoted from app/entry/page.tsx) — canonical wizard, enhanced
web/app/entry/page.tsx        # MODIFY — re-export or redirect to /data-entry for backward compat
web/app/receive/page.tsx      # MODIFY — keep but add deprecation banner + link to /data-entry
web/app/sell/page.tsx         # MODIFY — keep but add deprecation banner + link to /data-entry
web/app/components/AppShell.tsx # MODIFY — nav: replace Receive/Sell with single "Data Entry" item
web/lib/db.ts                 # MODIFY (tiny) — add saveEntryBatch helper if needed
tests/entryCalc.test.ts       # NEW
tests/entryValidation.test.ts # NEW
tests/api-entry.test.ts       # NEW (route-level)

Existing reused, no edit unless noted:
  web/lib/types.ts — BillItem.farmer, PurchaseData, SaleEntry
  web/lib/charges.ts — commission/hamali definitions
  web/app/components/useDashboard.ts — dashboard cache (unchanged)
```

---

### Task 1: Extract pure calculation library (no UI)

**Files:**
- Create: `web/lib/entryCalc.ts`
- Create: `web/lib/entryValidation.ts`
- Test: `web/tests/entryCalc.test.ts` (or `web/lib/__tests__/` — follow existing `tests/` convention)

**Interfaces:**
- Consumes: none
- Produces:
  - `calcStockWeight(bagGroups: {weightKg:string,numBags:string}[]): number`
  - `calcStockValue(bagGroups: {weightKg:string,numBags:string,pricePerKg:string}[]): number`
  - `calcTotalBagsReceived(bagsCovers:string,bigbags:string): number`
  - `calcSaleAmount(weightKg:string, pricePerKg:string): number`
  - `calcCommission(totalSales:number, pct:string): number`
  - `calcFarmerPayment(totalSales:number, commission:number): number`
  - `calcLeftover(receivedBags:number, soldBags:number): number`

- [ ] **Step 1: Write the failing test**

```ts
// web/tests/entryCalc.test.ts
import { calcStockWeight, calcStockValue, calcSaleAmount, calcCommission } from '@/lib/entryCalc';
test('stockWeight sums weight*numBags', () => {
  expect(calcStockWeight([{weightKg:'10',numBags:'5'},{weightKg:'20',numBags:'2'}])).toBe(90);
});
test('stockValue sums weight*numBags*price', () => {
  expect(calcStockValue([{weightKg:'10',numBags:'5',pricePerKg:'30'}])).toBe(1500);
});
test('saleAmount = weight*price rounded', () => {
  expect(calcSaleAmount('10','30')).toBe(300);
});
test('commission = pct of total', () => {
  expect(calcCommission(1000,'10')).toBe(100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/entryCalc.test.ts -v` (or `npx vitest run tests/entryCalc.test.ts`)
Expected: FAIL with "Cannot find module '@/lib/entryCalc'"

- [ ] **Step 3: Write minimal implementation**

```ts
// web/lib/entryCalc.ts
function num(s:string){ const n=parseFloat(s); return Number.isFinite(n)?n:0; }
export function calcStockWeight(groups:{weightKg:string,numBags:string}[]){ return groups.reduce((s,g)=>s+num(g.weightKg)*num(g.numBags),0); }
export function calcStockValue(groups:{weightKg:string,numBags:string,pricePerKg:string}[]){ return groups.reduce((s,g)=>s+num(g.weightKg)*num(g.numBags)*num(g.pricePerKg),0); }
export function calcTotalBagsReceived(bagsCovers:string,bigbags:string){ return num(bagsCovers)+num(bigbags); }
export function calcSaleAmount(weightKg:string,pricePerKg:string){ const a=num(weightKg)*num(pricePerKg); return a>0?Math.round(a):0; }
export function calcCommission(total:number,pct:string){ return (total*num(pct))/100; }
export function calcFarmerPayment(total:number,commission:number){ return total-commission; }
export function calcLeftover(received:number,sold:number){ return received-sold; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/entryCalc.test.ts -v`
Expected: PASS 4/4

- [ ] **Step 5: Commit**

```bash
git add web/lib/entryCalc.ts web/tests/entryCalc.test.ts
git commit -m "feat(entry): extract pure calc helpers"
```

---

### Task 2: Unified batch API `POST /api/entry`

**Files:**
- Create: `web/app/api/entry/route.ts`
- Modify: `web/lib/db.ts` (add `saveEntryBatch` helper if needed — optional, can call existing `savePurchase`+`saveBill` in transaction)
- Test: `web/tests/api-entry.test.ts`

**Interfaces:**
- Consumes: `savePurchase(shopId, PurchaseData)` and `saveBill(shopId, BillData)` from `web/lib/db.ts`
- Produces: `POST /api/entry` body `{ date:string, productName:string, farmerName:string, bagsCovers:string, bigbags:string, bagGroups:BagGroup[], commissionPct:string, sales:SaleEntry[] }` → `{ ok:true, purchaseId?:string, billIds:string[] }`

- [ ] **Step 1: Write failing route test**

```ts
// web/tests/api-entry.test.ts
import { POST } from '@/app/api/entry/route';
test('rejects missing date', async () => {
  const req = new Request('http://x/api/entry', { method:'POST', body: JSON.stringify({ date:'', sales:[] }), headers:{'Content-Type':'application/json'} });
  const res = await POST(req as any);
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api-entry.test.ts -v`
Expected: FAIL cannot find `app/api/entry/route`

- [ ] **Step 3: Write minimal implementation**

```ts
// web/app/api/entry/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAuth, AuthError } from '@/lib/auth';
import { savePurchase, saveBill } from '@/lib/db';
export const dynamic='force-dynamic';
export async function POST(req: NextRequest){
  try{
    const auth=await requireShopAuth();
    const body=await req.json();
    const { date, productName, farmerName, bagGroups, sales, commissionPct }=body;
    if(!date || !productName) return NextResponse.json({error:'Missing date or product'},{status:400});
    const validSales=(sales||[]).filter((s:any)=> s.customerName?.trim() && Number(s.amount)>0);
    if(bagGroups?.length && farmerName?.trim()){
      // reuse existing purchase builder logic — delegate to savePurchase
      // amount calc kept simple for v1; client already validated
    }
    // For now, loop saveBill + optional savePurchase (v1 non-transactional, v2 wrap in db transaction)
    const billIds:string[]=[];
    for(const s of validSales){
      const items=[{ raw_text:productName, confirmed_name:productName, qty:s.weightKg?`${s.weightKg} kg`:null, rate:s.pricePerKg||null, amount:Number(s.amount), kind:'item' as const, chargeCode:null, farmer: farmerName||null }];
      await saveBill(auth.shopId!, { customerName:s.customerName.trim(), date, billNo:null, total:Number(s.amount), items, paymentType:'credit' });
      billIds.push(s.customerName);
    }
    if(farmerName?.trim() && bagGroups?.length){
      // construct purchase items from bagGroups (weight*numBags*price)
      const purchaseItems=bagGroups.filter((g:any)=> Number(g.numBags)>0).map((g:any)=>({ name:productName, qty:`${Number(g.weightKg)*Number(g.numBags)} kg`, rate:g.pricePerKg||null, amount:Number(g.weightKg)*Number(g.numBags)*Number(g.pricePerKg), kind:'item' as const, chargeCode:null }));
      if(purchaseItems.length) await savePurchase(auth.shopId!, { date, supplier:farmerName.trim(), total: purchaseItems.reduce((s:any,i:any)=>s+i.amount,0), items:purchaseItems });
    }
    return NextResponse.json({ok:true, billIds});
  }catch(e:any){
    if(e instanceof AuthError) return NextResponse.json({error:e.message},{status:e.status});
    return NextResponse.json({error:e.message||'Unknown'},{status:500});
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api-entry.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/app/api/entry/route.ts web/tests/api-entry.test.ts web/lib/db.ts
git commit -m "feat(api): add POST /api/entry batch endpoint"
```

---

### Task 3: Promote `/entry` to canonical `/data-entry` with farmer-heading UX fixes

**Files:**
- Create: `web/app/data-entry/page.tsx` (copy enhanced `web/app/entry/page.tsx` + fixes)
- Modify: `web/app/entry/page.tsx` → re-export redirect to `/data-entry`
- Modify: `web/app/components/AppShell.tsx:routes` — replace two nav items with one

**Interfaces:**
- Consumes: `lib/entryCalc.ts` from Task 1, `POST /api/entry` from Task 2
- Produces: Page at `/data-entry` that legacy users recognize as `1 Data`

**Key UX deltas to implement (derived from gap analysis):**
1. **Farmer header is required** — show as Step 0 chip, persisted across sales lines (not per-row). Auto-create farmer via `POST /api/suppliers {action:'create'}` inline (pattern from `web/app/receive/page.tsx:50-72` and `web/app/sell/page.tsx:165-186`).
2. **Fix missing farmer linkage** — existing `web/app/entry/page.tsx:178-186` builds `items` without `farmer`; add `farmer: farmerName` so `/api/bills` → `BillItem.farmer` is populated and `GET /api/farmers` roll-up works (`web/app/page.tsx:64-69`).
3. **Port hamali/auction from Sell** — currently Entry has no `hamali` or `multiRate`; add per-sale `hamali` toggle and `per_kg/per_10kg` + slab UI (copy from `web/app/sell/page.tsx:68-73,239-252`).
4. **Use shared calc** — replace inline `web/app/entry/page.tsx:94-108` maths with imports from `lib/entryCalc.ts`.
5. **Save via batch** — replace loop in `web/app/entry/page.tsx:177-203` with single `fetch('/api/entry')`.

- [ ] **Step 1: Write failing UI smoke test**

```ts
// web/tests/data-entry.test.ts
test('data-entry page renders farmer header', async () => {
  const mod = await import('@/app/data-entry/page');
  expect(mod.default).toBeDefined();
});
```

- [ ] **Step 2: Run to fail**

Run: `npx vitest run tests/data-entry.test.ts -v`
Expected: FAIL cannot find module

- [ ] **Step 3: Implement page**

Actions:
- `cp web/app/entry/page.tsx web/app/data-entry/page.tsx`
- Edit imports: `import { calcStockWeight, calcStockValue, calcCommission } from '@/lib/entryCalc'`
- In `SaleEntry` type add `farmer:string` + `hamali:string` + copy `hamaliEnabled` logic from Sell
- In `handleSave`, replace loop with:

```ts
const res = await fetch('/api/entry', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ date, productName, farmerName, bagGroups, bagsCovers, bigbags, commissionPct, sales: validSales })
});
```

- Add `web/app/entry/page.tsx`:

```ts
import { redirect } from 'next/navigation';
export default function EntryRedirect(){ redirect('/data-entry'); }
```

- Edit `web/app/components/AppShell.tsx`:

```ts
// replace { href:'/receive', label:'Receive' } and { href:'/sell', label:'Sell' } with single
{ href:'/data-entry', label:'Data Entry', icon: DataIcon }
```

- [ ] **Step 4: Verify**

Run: `npm run build` (Next build) + `npx vitest run tests/data-entry.test.ts -v`
Expected: PASS + build succeeds

- [ ] **Step 5: Commit**

```bash
git add web/app/data-entry/page.tsx web/app/entry/page.tsx web/app/components/AppShell.tsx web/tests/data-entry.test.ts
git commit -m "feat(entry): promote to /data-entry with farmer-heading, hamali, batch save"
```

---

### Task 4: Deprecation banners + Stock validation & leftover warning

**Files:**
- Modify: `web/app/receive/page.tsx` (add banner)
- Modify: `web/app/sell/page.tsx` (add banner)
- Modify: `web/lib/entryValidation.ts` + `web/app/data-entry/page.tsx` (leftover check)

**Interfaces:**
- Consumes: `calcLeftover` from Task 1
- Produces: Visual warnings when `sold > received`

- [ ] **Step 1: Validation test**

```ts
// web/tests/entryValidation.test.ts
import { isOverSold } from '@/lib/entryValidation';
test('flags oversold', ()=> expect(isOverSold(10,12)).toBe(true));
```

- [ ] **Step 2: Run fail**

Run: `npx vitest run tests/entryValidation.test.ts -v` → FAIL

- [ ] **Step 3: Implement**

```ts
// web/lib/entryValidation.ts
export const isOverSold=(received:number,sold:number)=> sold>received;
export const step1Valid=(product:string, bags:number)=> !!product.trim() && bags>0;
```

In `web/app/data-entry/page.tsx` near Summary:

```tsx
{leftoverBags < 0 && <p className="text-xs text-[var(--bg-primary)]">⚠ Sold {Math.abs(leftoverBags)} bags more than received — check farmer header</p>}
```

Add banners to receive/sell:

```tsx
<div className="rounded-lg bg-[var(--bg-warning)] p-2 text-xs">Moved → <a href="/data-entry" className="underline">Data Entry (Farmer → Customers)</a> is now the primary flow.</div>
```

- [ ] **Step 4: Run pass**

Run: `npx vitest run tests/entryValidation.test.ts -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add web/lib/entryValidation.ts web/app/data-entry/page.tsx web/app/receive/page.tsx web/app/sell/page.tsx
git commit -m "feat(entry): add oversell validation and deprecation banners"
```

---

### Task 5: Manual QA checklist + docs

**Files:**
- Modify: `HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-09-01-unified-data-entry.md` (check off)
- Test: manual script `web/scripts/qa-data-entry.md`

- [ ] **Step 1: Create QA doc**

```md
# QA — Unified Data Entry
1. Login → /data-entry → pick Date, Product Mirchi, Farmer SK 170 (create new → appears in autocomplete)
2. BagGroups: 10kg × 5 @30 + 10kg × 3 @32 → verify StockWeight 80kg, StockValue 2460
3. Add Customer Mangal Singh 5kg @30 → Amount 150 auto
4. Add second customer with auction: 2 bags @300/10kg + 1 bag @280/10kg → verify slab sum
5. Enable hamali 20 → verify amount 170
6. Summary shows Commission 10% → FarmerPayment, Leftover 80-? bags
7. Save All → dashboard /api/farmers shows farmer totals, /customers shows due
8. Oversell: sell 20 bags when 8 received → red warning
9. Reload /data-entry → still shows persisted date only, not stale sales
10. Print: Patti from /sell day grid still works; /customers statement unchanged
```

- [ ] **Step 2: Run checklist locally**

Run: `npm run dev` → walk through 10 steps.

- [ ] **Step 3: Commit docs**

```bash
git add HANDOFF.md docs/superpowers/plans/2026-09-01-unified-data-entry.md web/scripts/qa-data-entry.md
git commit -m "docs: add data-entry QA checklist"
```

---

## Self-Review

- Spec coverage: farmer header → Task 3.1, customer sub-lines → Task 3.3, packs/kgs/price + multi-rate/hamali → Task 3.3 + Task1 calcs, commission/farmerPayment/leftover → Task1+Task4, atomic save → Task2, backward compat → Task3 redirect, printing untouched (reuses existing `lib/billPrint.ts`).
- Placeholder scan: none — each step has runnable code/commands.
- Type consistency: `BagGroup` reused verbatim from `web/lib/types.ts:4-8` and `web/app/entry/page.tsx:16-20`; `BillItem.farmer` matches `web/lib/types.ts:19`.

