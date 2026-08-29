# RVC Ledger — Handoff Document

*Last updated: 2026-08-21*

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

## Key files

| File | Purpose |
|------|---------|
| `web/app/receive/page.tsx` | Stock received from farmer (bags, weights, prices, optional charges) |
| `web/app/sell/page.tsx` | Sales to retailers (customer rows, image upload inside) |
| `web/app/payment/page.tsx` | Payment collection from customers |
| `web/app/upload/page.tsx` | Old upload page (still exists, not in navigation) |
| `web/app/entry/page.tsx` | Old 3-step wizard (still exists, not in navigation) |
| `web/app/components/AppShell.tsx` | Navigation — 3 buttons: Receive, Sell, Payment |
| `web/app/api/ocr/gemini/route.ts` | Gemini OCR server route (for image upload in Sell) |
| `web/lib/ocr.ts` | Client OCR orchestration (Tesseract → Gemini fallback) |
| `web/lib/types.ts` | TypeScript types (BillData, PurchaseData, DailySummary, etc.) |
| `web/lib/db.ts` | Database layer (Neon Postgres, multi-tenant with shops) |
| `web/lib/i18n.ts` | English, Telugu, Hindi translations |
| `web/data/vegetable-catalog.json` | 40 vegetables with codes, Telugu/Hindi names, aliases |

## Current navigation (3 buttons only)

**Mobile bottom bar + desktop header — both show:**
1. 🚚 **Receive** (`/receive`) — stock from farmers
2. 🏪 **Sell** (`/sell`) — sales to retailers (image upload is inside this page)
3. 💰 **Payment** (`/payment`) — payments received

Old pages (`/upload`, `/quick-bill`, `/entry`) still exist but are NOT in navigation.

## What's done and working

- ✅ Manual entry flow for commission agent business
- ✅ Receive page: product, farmer, bags/covers, bigbags, bag weight groups, prices
- ✅ Receive page: optional charges (Hamali, Tulai, Bardana, Safai, Jhadai, Dami, Commission, Market Fee, Advance, Other) — each auto-calculates, all skippable
- ✅ Sell page: customer rows with bags, weight, price/kg, amount
- ✅ Sell page: image upload inside (collapsible), uses Tesseract → Gemini fallback
- ✅ Payment page: existing, unchanged
- ✅ Service worker fixed (v3, network-first for pages)
- ✅ Vegetable catalog with 40 items, 3-letter codes, Telugu/Hindi names
- ✅ Deployed to https://rvc-ledger-web.vercel.app

## What's NOT done yet (priority order)

### 1. Sell page needs optional charges (same as Receive)
The Sell page currently only captures customer sales without charges. It needs the same optional charges system as Receive — commission, hamali, market fee, etc. — so the user can record deductions from the sale.

### 2. Vegetable catalog not wired into the app
`web/data/vegetable-catalog.json` exists with 40 vegetables but is NOT loaded into the app. The product field on Receive/Sell is a free-text input with a datalist from the existing `/api/catalog`. Need to:
- Seed the catalog API with these 40 vegetables on first run
- Or create an API route to import them
- Show the 3-letter code alongside the name for quick entry

### 3. No leftover stock tracking
When stock is received and partially sold, the system doesn't track how much is left. Need:
- A daily stock balance (received - sold = leftover)
- Carry forward to next day
- Show on dashboard or daily ops page

### 4. No farmer patti generation
The patti (settlement receipt for farmer) is the core document in a commission agent's business. It shows:
- Gross sale value
- All deductions (commission, hamali, tulai, bardana, market fee, etc.)
- Net payable to farmer
- Should be printable and shareable on WhatsApp

### 5. No commission tracking/reporting
The system doesn't track how much commission the agent earned. Need:
- Commission earned per sale
- Daily/monthly commission summary
- Party-wise (farmer) commission statements

### 6. AGMARKNET API integration
Bowenpally APMC reports daily prices to AGMARKNET (data.gov.in API). Could pull daily modal prices to show today's market rate for each vegetable. API key needed from data.gov.in.

### 7. HSN codes for GST
If turnover crosses ₹5 Cr, GST invoicing with HSN codes becomes mandatory. The vegetable catalog should include HSN codes (Chapter 07 for vegetables, mostly 0% GST).

### 8. Telangana APMC charges pre-config
Telangana APMC Act 2017 rates for Bowenpally:
- Market Fee: 1% (buyer pays)
- Cess: 0.5% (buyer pays)
- Commission: 5-8% for vegetables (farmer pays)
- Hamali: ₹2-4/bag (farmer pays)
These could be pre-filled defaults (still editable) instead of empty fields.

## Technical notes

- **Next.js 16.3.2** — App Router, Turbopack. Read `node_modules/next/dist/docs/` before changing Next.js behavior.
- **Database**: Neon Postgres (serverless). Multi-tenant via `shop_id` column on all tables.
- **Auth**: Clerk (production keys configured).
- **OCR**: Tesseract.js (local, free) → Gemini API (server-side only, key in env).
- **Deployment**: Vercel, production alias `https://rvc-ledger-web.vercel.app`.
- **GitHub**: `https://github.com/vikas8520-coder/rvc-ledger.git`, branch `main`.
- **Service worker**: `web/public/sw.js`, cache version `v3`, network-first for pages.

## Deploy commands

```bash
cd /Users/vikasreddy/Projects/rvc-ledger/web
npm run build                    # type check + build
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
