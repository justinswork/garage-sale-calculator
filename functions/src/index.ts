import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import Anthropic from '@anthropic-ai/sdk';
import { VoyageAIClient } from 'voyageai';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ANTHROPIC_API_KEY, VOYAGE_API_KEY } from './secrets';
import { identifyItem } from './identifyItem';
import { findComps } from './findComps';
import { suggestPriceCall } from './suggestPriceCall';
import type {
  CorpusItem,
  SuggestPriceRequest,
  SuggestPriceResponse
} from './types';

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// Corpus is bundled with the function; load once at module init.
const CORPUS: CorpusItem[] = JSON.parse(
  readFileSync(join(__dirname, 'corpus', 'corpus.json'), 'utf8')
);

export const suggestPrice = onCall(
  {
    secrets: [ANTHROPIC_API_KEY, VOYAGE_API_KEY],
    timeoutSeconds: 60,
    memory: '512MiB',
    cors: true
  },
  async (request): Promise<SuggestPriceResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign-in required.');
    }

    const data = request.data as SuggestPriceRequest;
    validateRequest(data);

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    const voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY.value() });

    const identified = await identifyItem(anthropic, data.image);
    const comps = await findComps(voyage, identified, CORPUS);
    const priceSuggestion = await suggestPriceCall(anthropic, identified, comps);

    return { identified, comps, priceSuggestion };
  }
);

function validateRequest(data: unknown): asserts data is SuggestPriceRequest {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Request body must be an object.');
  }
  const d = data as Partial<SuggestPriceRequest>;
  if (!d.image?.base64 || !d.image?.mediaType) {
    throw new HttpsError('invalid-argument', 'Missing image.base64 or image.mediaType.');
  }
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(d.image.mediaType)) {
    throw new HttpsError('invalid-argument', `image.mediaType must be one of ${allowed.join(', ')}.`);
  }
  // ~6MB base64 ≈ 4.5MB binary. Anthropic's vision limit is well above this;
  // this cap is mostly to keep mobile uploads sane.
  if (d.image.base64.length > 8_000_000) {
    throw new HttpsError('invalid-argument', 'Image too large. Resize before upload.');
  }
}
