# Photo-to-price — Phase 1 setup

This is the manual checklist for the Phase 1 scaffold. Everything in code
is done; these steps require account access or external approvals I can't
do for you. Work through them in order; nothing later in the list works
until the earlier items are done.

## What's already scaffolded

- `prompts/identify-item.md`, `prompts/suggest-price.md` — system prompts
  the function imports at cold-start.
- `functions/` — Firebase Functions (TypeScript), Node 20 runtime, with
  `@anthropic-ai/sdk`, `voyageai`, and `firebase-functions` installed.
- `functions/src/index.ts` — the `suggestPrice` callable, validates the
  request, wires together identification → retrieval → pricing. Identify
  and price call sites are stubbed; Phase 3 fills them in.
- `functions/src/corpus/corpus.json` — empty array placeholder; Phase 2
  populates it.
- `evals/` — 3 placeholder test cases, runner script, rubric.
- `firebase.json` — Functions block added, emulator config added.

## 1. Upgrade to Blaze (Firebase pay-as-you-go)

Cloud Functions and Secret Manager both require Blaze. Spark (free tier)
cannot deploy callable functions.

1. https://console.firebase.google.com → select **garage-sale-calculator**.
2. Bottom-left: **Upgrade** → **Blaze**.
3. Add a billing account.
4. Set a budget alert (recommended: $10/month so you find out before
   anything goes sideways).

## 2. API keys

### Anthropic
1. https://console.anthropic.com → API Keys → Create Key.
2. Copy the `sk-ant-...` value.
3. From the repo root:
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
   Paste the value when prompted.

### Voyage AI
1. https://www.voyageai.com/ → sign up → API Keys.
2. Copy the `pa-...` value.
3. ```bash
   firebase functions:secrets:set VOYAGE_API_KEY
   ```

You'll only see the key once per provider — save it in a password manager
in case you need to reset secrets later.

## 3. eBay Browse API access (for Phase 2)

We pivoted from Marketplace Insights (sold listings, gated, denied us
access) to **Browse API** (active listings, public, self-serve). The
corpus we build will contain *asking* prices rather than *sold* prices;
the pricing prompt accounts for this with an extra discount step
(asking → sold ≈ 70–85% → garage-sale ≈ 25–40% of sold).

1. https://developer.ebay.com → create a developer account if you don't
   have one.
2. **Application Keysets** → create a Production keyset.
3. Note the **App ID (Client ID)** and **Cert ID (Client Secret)** —
   Browse API uses OAuth client-credentials flow, both are required.
4. Store as secrets (only used by the Phase 2 corpus builder, not by the
   live callable — the corpus is built offline and shipped as JSON):
   ```bash
   firebase functions:secrets:set EBAY_APP_ID
   firebase functions:secrets:set EBAY_CERT_ID
   ```

Rate limits on Browse API are generous (5K calls/day on the default
tier) — we won't come close. No gated approval, no waiting.

**Phase 2 plan tweaks driven by this pivot:**
- Corpus builder queries `/buy/browse/v1/item_summary/search` across a
  fixed list of garage-sale categories.
- Filter to `buyingOptions=FIXED_PRICE` and a recent `itemEndDate` so we
  don't ingest stuck listings at unrealistic prices.
- Each corpus row records `priceType: 'asking'` so the suggest-price
  prompt knows what it's looking at.

## 4. Confirm the callable is deployable

After steps 1–2:

```bash
cd functions
npm install
npm run build
firebase deploy --only functions:suggestPrice
```

Expected: a successful deploy and a function URL printed at the end. The
function will throw `Error: identifyItem: not implemented (Phase 3)` if
you call it now — that's expected; we're confirming deployment plumbing
works, not behavior.

## 5. Run the emulator (optional, for Phase 3 development)

```bash
firebase emulators:start --only functions
```

The emulator runs on `http://127.0.0.1:5001/<project-id>/us-central1/suggestPrice`
and doesn't require deployed secrets — it picks them up from the local
`.secret.local` file. Create it now so it's ready:

```bash
# functions/.secret.local — not committed
ANTHROPIC_API_KEY=sk-ant-...
VOYAGE_API_KEY=pa-...
```

## When you're done

Reply with whatever's not on this list. Common gotchas:
- Blaze upgrade still propagating ("billing not enabled" errors for ~10
  minutes after upgrade).
- Anthropic account doesn't have credits — Console → Billing → add a
  payment method (separate from Firebase billing).
- `firebase deploy` complaining about Node version — Node 20 is required
  locally for the function build; install via nvm if needed.

Once steps 1–4 are done we can move to Phase 2 (corpus build).
