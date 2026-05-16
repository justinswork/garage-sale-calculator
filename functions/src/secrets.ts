import { defineSecret } from 'firebase-functions/params';

// Cloud Secret Manager values. Set via:
//   firebase functions:secrets:set ANTHROPIC_API_KEY
//   firebase functions:secrets:set VOYAGE_API_KEY
//   firebase functions:secrets:set EBAY_APP_ID         # only used by corpus builder
//   firebase functions:secrets:set EBAY_CERT_ID        # only used by corpus builder
//
// Any function that needs a secret must declare it in its runWith config
// (see index.ts).

export const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
export const VOYAGE_API_KEY = defineSecret('VOYAGE_API_KEY');
