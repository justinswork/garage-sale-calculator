import type Anthropic from '@anthropic-ai/sdk';
import { IDENTIFY_ITEM_PROMPT } from './prompts';
import { parseStructuredOutput } from './parseStructuredOutput';
import type { IdentifiedItem, SuggestPriceRequest } from './types';

// Vision call. Sends the photo + system prompt and asks for a structured
// identification. Uses Opus 4.7 because pricing accuracy is bottlenecked
// on getting brand/model right.
//
// No `thinking` block — we want low latency on the user-facing path.
// No `temperature`/`top_p` — removed on Opus 4.7.

const MODEL: Anthropic.Model = 'claude-opus-4-7';
const MAX_TOKENS = 1024;

const IDENTIFY_SCHEMA: { [key: string]: unknown } = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    attributes: {
      type: 'object',
      properties: {
        brand: { type: 'string' },
        model: { type: 'string' },
        category: { type: 'string' },
        material: { type: 'string' },
        color: { type: 'string' },
        size: { type: 'string' },
        era: { type: 'string' }
      },
      additionalProperties: false
    },
    condition: { type: 'string', enum: ['like-new', 'good', 'fair', 'poor'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    notes: { type: 'string' }
  },
  required: ['name', 'description', 'attributes', 'condition', 'confidence', 'notes'],
  additionalProperties: false
};

export async function identifyItem(
  client: Anthropic,
  image: SuggestPriceRequest['image']
): Promise<IdentifiedItem> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: IDENTIFY_ITEM_PROMPT,
    output_config: {
      format: { type: 'json_schema', schema: IDENTIFY_SCHEMA }
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: image.mediaType,
              data: image.base64
            }
          },
          { type: 'text', text: 'Identify the item in this photo.' }
        ]
      }
    ]
  });

  return parseStructuredOutput<IdentifiedItem>(response, 'identifyItem');
}
