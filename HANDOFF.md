# RVC Ledger — Handoff Document

*Last updated: 2026-09-01*

---

## What is RVC

RVC is a vegetable shop in **Bowenpally APMC market, Hyderabad, Telangana**. The owner (Vikas) is a **commission agent (arhtiya)** — farmers bring produce, he auctions it to retailers, takes a commission, and pays the rest to farmers. Leftover stock sells the next morning.

## Business flow (confirmed by user)

1. Farmer delivers produce → recorded as bags/covers + bigbags/bastas
2. Produce auctioned to retailers throughout the day
3. Each sale: customer name, bags, weight (kg), price/kg, amount
4. Commission + charges deducted from farmer's payment
5. Leftover stock carries to next morning
6. Customer payments tracked (cash vs credit, collections on later days)

## Legacy application mental model (user interview 2026-09-01)

The old desktop app had a 5-item menu:
1. **Data Entry** — farmer is the header, customer sales are sub-lines under that farmer. All calculations (bags, kgs, price, amount, auction multi-rate, hamali, commission, farmer payment, leftover) happen here.
2. **Printing** — patti, ledger, dues summary
3. **Setup** — configuration
4. **Misc** — miscellaneous operations
5. **User/Exit** — user management, exit

**Key insight:** Farmer is the parent record. Customer sales roll up under that farmer. The user wants to replicate this flow in RVC Ledger.

## Key files

| File | Purpose |
|------|---------|
| `web/app/receive/page.tsx` | Stock received from farmer (bags, weights, prices, optional charges) |
| `web/app/sell/page.tsx` | Sales to retailers (customer rows, image upload, day grid, Patti printing, reports) |
| `web/app/entry/page.tsx` | **Patti Book (canonical daily entry).** Farmer header + customer lines + Comm/Hamali/Bardan/Freight/Advance/Packing. Saves `farmer`, `customerId`, cash/credit, hamali. |
| `web/app/print/page.tsx` | Print hub: farmer patti, customer bills, party ledger, dues, docket |
| `web/app/misc/page.tsx` | More menu — Receive, Sell, stock, expenses, settings |
| `web/app/payment/page.tsx` | Payment collection from customers |
| `web/app/upload/page.tsx` | Old upload page (still exists, not in navigation) |
| `web/app/components/AppShell.tsx` | Navigation — Data Entry, Print, Payment. Mobile bottom bar + desktop header. |
| `web/app/components/CustomerPicker.tsx` | UUID-based customer picker with search, add-new, multilingual display |
| `web/app/api/ocr/gemini/route.ts` | Gemini OCR server route (for image upload in Sell) |
| `web/app/api/bills/route.ts` | POST saves a bill (customer sale). Uses `requireShopAuth()`. |
| `web/app/api/purchases/route.ts` | POST saves a purchase (farmer stock intake). Uses `requireShopAuth()`. |
| `web/app/api/customers/route.ts` | GET/POST customers. UUID identity. |
| `web/app/api/suppliers/route.ts` | GET/POST suppliers (farmers). Supports `action:'create'`. |
| `web/lib/ocr.ts` | Client OCR orchestration (Tesseract → Gemini fallback) |
| `web/lib/types.ts` | TypeScript types — `BillItem.farmer` (line 19), `PurchaseData.supplier` (line 46), `BagGroup`, `BillData`, `Customer` |
| `web/lib/db.ts` | Database layer (Neon Postgres, multi-tenant with shops). `saveBill`, `savePurchase`, `addCustomer`, `createSupplier` |
| `web/lib/auth.ts` | Clerk auth + admin cookie auth. `requireShopAuth()`, `getAuth()`. |
| `web/lib/charges.ts` | Charge type definitions (hamali, commission, market fee, etc.) |
| `web/lib/i18n.ts` | English, Telugu, Hindi translations |
| `web/data/vegetable-catalog.json` | 40 vegetables with codes, Telugu/Hindi names, aliases |
| `web/proxy.ts` | Next.js 16 proxy — `clerkMiddleware` wraps admin cookie auth for `/admin/*`, Clerk handles shop routes |
| `web/public/sw.js` | Service worker, cache version `v7`, network-first for all assets |

## Current navigation

**Mobile bottom bar + desktop header actions:**
1. **Data Entry** (`/entry`) — Patti Book: farmer header, customer sale lines, charges, save + print
2. **Print** (`/print`) — farmer patti, customer bills, party ledger, dues list, docket
3. **Payment** (`/payment`) — collections

**More** (`/misc`): Receive, Sell (day grid), stock, expenses, settings, upload.

Overview + Customers stay in the top nav. Reports + Settings remain in the secondary row.

## Authentication (configured 2026-09-01)

- **Clerk** is configured with test keys (`pk_test_` / `sk_test_`) on Vercel.
- `proxy.ts` uses `clerkMiddleware` — shop routes require Clerk auth, admin routes require admin cookie.
- Unauthenticated visitors see the Clerk sign-in page (Google login + email/password).
- Admin login at `/admin/login` is separate (username/password cookie).
- User profile / change password at `/user-profile` (Clerk `<UserProfile>` component).
- **No-auth fallback was removed** — `getAuth()` returns `null` when Clerk is not configured (was previously returning a default-shop owner, which was insecure).
- `AppShell.tsx` uses `CLERK_CONFIGURED` (not `CLERK_PRODUCTION`) so test keys trigger auth.

## What's done and working

- ✅ **Patti Book (`/entry`)** — farmer header, customer lines, cash/credit, hamali, charges, leftover, farmer-tagged bills
- ✅ **Print hub (`/print`)** — farmer patti, customer bills, party ledger, dues, docket/gate pass
- ✅ **More (`/misc`)** — Receive, Sell day-grid, stock, expenses, settings
- ✅ Manual entry flow for commission agent business
- ✅ Receive page: product, farmer, bags/covers, bigbags, bag weight groups, prices, optional charges
- ✅ Sell page: customer rows with bags, weight, price/kg, amount, hamali, multi-rate auction, day grid, Patti printing, reports, stock display, inline farmer creation, inline customer creation
- ✅ Payment page: existing, unchanged
- ✅ Clerk authentication with Google login + email/password + change password
- ✅ Admin login separate from shop login
- ✅ Service worker fixed (v7, network-first for all assets including static)
- ✅ Patti save is one DB transaction (`POST /api/entry`) — no half-saved patti
- ✅ Bill qty stored as a number so farmer kg totals work
- ✅ Vegetable catalog with 40 items, 3-letter codes, Telugu/Hindi names
- ✅ Deployed to https://rvc-ledger-web.vercel.app
- ✅ Multilingual (English, Telugu, Hindi) with transliteration

## Unified Data Entry — shipped 2026-09-01

Daily work is **Patti Book** at `/entry` (matches ADAT Patti Book Entry): farmer on top, one row per customer sale, footer charges, Save + Print.

- Bills save `farmer`, `customerId`, `paymentType` (cash/credit), `hamali`, `bags`.
- One purchase is written for the farmer from the sold lines.
- Farmer patti print is farmer-centric (not the old 6-up customer slip).
- Receive/Sell remain under **More**. Receive shows a banner pointing at Data Entry.

### What we still did not see in the shop screenshots

Printing / Setup / Misc / User Menu **submenus were not in the photos or video**. Print hub is inferred from ADAT/AdatSoft + what already existed in this app:

1. Farmer patti
2. Customer bills
3. Party ledger
4. Dues list
5. Docket / gate pass

If the shop PC has different print items, send those screens and we match them.

## Previous plan notes (kept for context)

### The original problem

The legacy app had a single "Data Entry" screen where:
- Farmer is the header (parent)
- Customer sales are sub-lines under that farmer
- All calculations happen in one place

The app used to split this into `/receive` + `/sell`. The old `/entry` wizard also dropped `farmer` on bill items.

### What was analyzed

A detailed 5-task plan was generated (saved at `docs/superpowers/plans/2026-09-01-unified-data-entry.md`) but was found to over-engineer the solution:

| Plan's approach | Problem |
|---|---|
| TDD with Vitest | Project uses Playwright, not Vitest — no Vitest installed |
| New `lib/entryCalc.ts` with 7 pure functions | Existing pages already have this math inline; refactoring 3 files is a distraction |
| New `lib/entryValidation.ts` | One-liner `sold > received` doesn't need its own file |
| New `POST /api/entry` batch endpoint | Existing loop-of-fetches works; batch adds maintenance burden for no v1 benefit |
| New `/data-entry` route + redirect from `/entry` | Route rename breaks bookmarks; just fix `/entry` in place |
| Replace Receive+Sell nav with Data Entry | Sell has day grid, Patti printing, reports — would lose functionality |

### Approved approach (simplified, 3 phases)

#### Phase 1 — Fix broken farmer linkage (small, high-value)

**File:** `web/app/entry/page.tsx` lines 178-186

**Change:** Add `farmer: farmerName || null` to each bill item in the save loop.

**Why:** Without this, `BillItem.farmer` is undefined, so `GET /api/farmers` can't group sales by farmer, and the dashboard farmer roll-up (`web/app/page.tsx:64-69`) shows nothing.

**Verification:** After fix, save an entry with farmer "SK 170" + 2 customer sales → check `/api/farmers` shows SK 170 with correct totals.

#### Phase 2 — Add hamali, paymentType, customerId to /entry (medium)

**File:** `web/app/entry/page.tsx`

**Changes:**
1. Add `hamali` field per sale line — toggle + amount input, same pattern as `web/app/sell/page.tsx:68-73`
2. Add `paymentType` (cash/credit) per sale line — radio/select, same as `web/app/sell/page.tsx:72-73`
3. Replace plain text `customerName` input with `CustomerPicker` component (`web/app/components/CustomerPicker.tsx`) — gives UUID identity, search, inline add-new
4. Add `customerId` to the bill save payload so customer dues are tracked properly
5. Add `per_kg` / `per_10kg` rate unit toggle (same as Sell)
6. Add multi-rate auction slabs (same as Sell's `rateSlabs`)

**Why:** These are the feature gaps that make `/entry` unusable compared to `/sell`. Without them, users would still need `/sell` for real work.

**Verification:** Create an entry with cash sale + credit sale + hamali + auction slabs → verify amounts match, customer dues update, day grid equivalent works.

#### Phase 3 — Add "Data Entry" to navigation (small)

**File:** `web/app/components/AppShell.tsx`

**Changes:**
1. Add a new nav item: `{ href: '/entry', label: 'Data Entry', icon: <some icon> }` to `SECONDARY_NAV` or `PRIMARY_NAV`
2. Keep Receive and Sell nav items as-is (Sell has day grid + printing that Entry doesn't)
3. Add a deprecation banner on Receive page: "Data Entry now covers stock intake too → [Go to Data Entry]"
4. Do NOT deprecate Sell — it has features Entry doesn't (day grid, Patti, reports)

**Why:** Makes the unified flow discoverable without breaking existing workflows.

**Verification:** Nav shows Data Entry, clicking it opens the wizard, Receive/Sell still work.

#### Phase 4 (optional, later) — Batch save endpoint

Only if the loop-of-fetches in `/entry/page.tsx` proves problematic in practice. Would create `POST /api/entry` wrapping `savePurchase` + N × `saveBill` in a single Postgres transaction.

### What was explicitly skipped

- `lib/entryCalc.ts` — pure functions already work inline in each page
- `lib/entryValidation.ts` — `sold > received` is a one-liner inline check
- `/data-entry` route — just fix `/entry` in place
- Vitest setup — project uses Playwright for E2E tests
- Replacing Receive/Sell nav items — would lose Sell's day grid + printing + reports

## What's NOT done yet (priority order, post-data-entry)

### 1. Vegetable catalog not wired into the app
`web/data/vegetable-catalog.json` exists with 40 vegetables but is NOT loaded into the app. Need to seed the catalog API or create an import route.

### 2. No leftover stock tracking
When stock is received and partially sold, the system doesn't track how much is left. Need daily stock balance + carry forward + dashboard display.

### 3. No farmer patti generation
The patti (settlement receipt for farmer) shows gross sale value, all deductions, net payable to farmer. Should be printable and shareable on WhatsApp.

### 4. No commission tracking/reporting
System doesn't track commission earned. Need per-sale, daily, monthly, and party-wise commission statements.

### 5. AGMARKNET API integration
Bowenpally APMC reports daily prices to AGMARKNET. Could pull daily modal prices for each vegetable.

### 6. HSN codes for GST
If turnover crosses ₹5 Cr, GST invoicing with HSN codes becomes mandatory.

### 7. Telangana APMC charges pre-config
Telangana APMC Act 2017 rates: Market Fee 1%, Cess 0.5%, Commission 5-8%, Hamali ₹2-4/bag. Could be pre-filled defaults.

## Technical notes

- **Next.js 16.3.2** — App Router, Turbopack. `proxy.ts` replaces `middleware.ts`. Read `node_modules/next/dist/docs/` before changing Next.js behavior.
- **Database**: Neon Postgres (serverless). Multi-tenant via `shop_id` column on all tables.
- **Auth**: Clerk (test keys configured on Vercel). `proxy.ts` uses `clerkMiddleware`. Admin auth separate (cookie-based).
- **OCR**: Tesseract.js (local, free) → Gemini API (server-side only, key in env).
- **Deployment**: Vercel, production alias `https://rvc-ledger-web.vercel.app`.
- **GitHub**: `https://github.com/vikas8520-coder/rvc-ledger.git`, branch `main`.
- **Service worker**: `web/public/sw.js`, cache version `v7`, network-first for all assets.
- **Testing**: Playwright (`npm test` = `playwright test`). No Vitest. Test file: `tests/full-flow.spec.ts`.
- **Knowledge graph**: Use `code-review-graph` MCP tools before Grep/Glob/Read for codebase exploration.

## Deploy commands

```bash
cd /Users/vikasreddy/Projects/rvc-ledger/web
npx tsc --noEmit                     # typecheck
cd .. && git add -A && git commit -m "..." && git push origin main
cd web && npx vercel --prod --yes
```

## User preferences (important)

- **No excuses/reasons** — if something breaks, fix it, don't explain why.
- **Nothing uncertain gets written silently** — OCR must be reviewed before saving.
- **Yearly pricing** (not monthly) — will decide later, not now.
- **Focus on process first** — get the flow right before adding features.
- **Visually simple** — the UI must be easy to understand for market workers.
- **API key restriction** — Gemini key only for Telugu/Hindi translation of images, not for printed bills.
- **Cannot see images** — Devin CLI runs GLM-5.2 with no vision. Route screenshots to `claude` CLI for analysis.
- **Shell is zsh** — use `bash <<'EOF'` for loops over whitespace-separated lists.
