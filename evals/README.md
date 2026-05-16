# Evals

End-to-end evaluation for the photo-to-price feature.

## Files

- `testcases.json` — 3 placeholder cases. Grow to 10–20 before shipping.
- `images/` — referenced from `testcases.json`. **Not committed.** Drop
  photos here that match each case's `image` field.
- `rubric.md` — scoring rubric (identification y/n, price in range y/n,
  reasoning 1–3).
- `run-evals.mjs` — runner. Calls the deployed `suggestPrice` callable for
  every case, scores identification and price automatically, leaves
  `reasoning_quality` blank for manual grading.
- `results/<timestamp>.csv` — one row per case. Generated, gitignored.

## Running

```bash
# Against the deployed function:
FN_URL="https://us-central1-<project-id>.cloudfunctions.net/suggestPrice" \
FN_TOKEN="$(gcloud auth print-identity-token)" \
node evals/run-evals.mjs

# Against the local emulator:
FN_URL="http://127.0.0.1:5001/<project-id>/us-central1/suggestPrice" \
node evals/run-evals.mjs
```

Then open the CSV and fill in `reasoning_quality` for each row.

## Adding a test case

1. Drop a photo in `evals/images/`.
2. Append an object to `testcases.json` with the canonical description,
   category/brand, and the price range a real shopper would consider
   reasonable.
3. Re-run.

A good test case is one you have a strong opinion about. If you can't
write the price range without hedging, the case is too ambiguous — find a
clearer photo.
