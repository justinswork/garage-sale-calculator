import type Anthropic from '@anthropic-ai/sdk';
import { SUGGEST_PRICE_PROMPT } from './prompts';
import { parseStructuredOutput } from './parseStructuredOutput';
import type { Comp, IdentifiedItem, PriceSuggestion } from './types';

// Second Claude call. Takes the identified item + retrieved comps and
// reasons over them to suggest a garage-sale price.

const MODEL: Anthropic.Model = 'claude-opus-4-7';
const MAX_TOKENS = 1024;

const PRICE_SCHEMA: { [key: string]: unknown } = {
  type: 'object',
  properties: {
    suggestedPrice: { type: 'integer' },
    priceLow: { type: 'integer' },
    priceHigh: { type: 'integer' },
    reasoning: { type: 'string' },
    usedCompIds: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
  },
  required: [
    'suggestedPrice',
    'priceLow',
    'priceHigh',
    'reasoning',
    'usedCompIds',
    'confidence'
  ],
  additionalProperties: false
};

export async function suggestPriceCall(
  client: Anthropic,
  identified: IdentifiedItem,
  comps: Comp[]
): Promise<PriceSuggestion> {
  const userText = formatPricingPrompt(identified, comps);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SUGGEST_PRICE_PROMPT,
    output_config: {
      format: { type: 'json_schema', schema: PRICE_SCHEMA }
    },
    messages: [{ role: 'user', content: userText }]
  });

  return parseStructuredOutput<PriceSuggestion>(response, 'suggestPriceCall');
}

// User-message body. Kept boring on purpose — the model has clearer
// instructions in the system prompt; this just hands it the inputs.
export function formatPricingPrompt(identified: IdentifiedItem, comps: Comp[]): string {
  const lines: string[] = [];

  lines.push('## Identified item');
  lines.push('');
  lines.push(`Name: ${identified.name}`);
  lines.push(`Description: ${identified.description}`);
  lines.push(`Condition: ${identified.condition}`);
  lines.push(`Identification confidence: ${identified.confidence}`);
  if (identified.notes) lines.push(`Notes: ${identified.notes}`);

  const attrEntries = Object.entries(identified.attributes).filter(([, v]) => Boolean(v));
  if (attrEntries.length > 0) {
    lines.push('');
    lines.push('Attributes:');
    for (const [k, v] of attrEntries) lines.push(`  ${k}: ${v}`);
  }

  lines.push('');
  lines.push(`## Comparable listings (${comps.length})`);
  lines.push('');

  if (comps.length === 0) {
    lines.push('NO COMPS FOUND. The retrieval corpus had no items similar enough');
    lines.push('to this one. Price from your own knowledge of typical garage-sale');
    lines.push('values for this kind of item and set `confidence: "low"`. Note');
    lines.push('this explicitly in `reasoning` and leave `usedCompIds` empty.');
  } else {
    for (const c of comps) {
      const dollars = (c.priceCents / 100).toFixed(2);
      lines.push(
        `[${c.id}] $${dollars} (${c.priceType}, ${c.condition}, similarity=${c.similarity.toFixed(2)}): ${c.title}`
      );
    }
  }

  lines.push('');
  lines.push('Suggest a fair garage-sale price for this item per the rules in your');
  lines.push('system prompt. Return JSON only.');

  return lines.join('\n');
}
