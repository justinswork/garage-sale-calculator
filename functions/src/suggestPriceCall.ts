import Anthropic from '@anthropic-ai/sdk';
import { SUGGEST_PRICE_PROMPT } from './prompts';
import type { Comp, IdentifiedItem, PriceSuggestion } from './types';

// Second Claude call: reasons over the comps and suggests a garage-sale
// price. Phase 1 stub.

const PRICE_SCHEMA = {
  type: 'object',
  properties: {
    suggestedPrice: { type: 'integer' },
    priceLow: { type: 'integer' },
    priceHigh: { type: 'integer' },
    reasoning: { type: 'string' },
    usedCompIds: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
  },
  required: ['suggestedPrice', 'priceLow', 'priceHigh', 'reasoning', 'usedCompIds', 'confidence'],
  additionalProperties: false
};

export async function suggestPriceCall(
  _client: Anthropic,
  _identified: IdentifiedItem,
  _comps: Comp[]
): Promise<PriceSuggestion> {
  // TODO (Phase 3): replace with the actual reasoning call.
  //
  // Sketch:
  //   const userContent = formatPricingPrompt(identified, comps);
  //   const response = await client.messages.create({
  //     model: 'claude-opus-4-7',
  //     max_tokens: 1024,
  //     system: SUGGEST_PRICE_PROMPT,
  //     output_config: { format: { type: 'json_schema', schema: PRICE_SCHEMA } },
  //     messages: [{ role: 'user', content: userContent }]
  //   });
  //   return JSON.parse(textBlockOf(response));
  void SUGGEST_PRICE_PROMPT;
  void PRICE_SCHEMA;
  throw new Error('suggestPriceCall: not implemented (Phase 3)');
}
