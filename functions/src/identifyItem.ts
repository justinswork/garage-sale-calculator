import Anthropic from '@anthropic-ai/sdk';
import { IDENTIFY_ITEM_PROMPT } from './prompts';
import type { IdentifiedItem, SuggestPriceRequest } from './types';

// Claude vision call. Sends the photo + system prompt and asks for a
// structured identification of the item.
//
// Uses Opus 4.7 because pricing depends heavily on getting brand/model right
// — running this on a smaller model would be a false economy.
//
// NOTE: Phase 1 stub. Wire up the actual SDK call in Phase 3.

const IDENTIFY_SCHEMA = {
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
  _client: Anthropic,
  _image: SuggestPriceRequest['image']
): Promise<IdentifiedItem> {
  // TODO (Phase 3): replace this stub with an actual Claude vision call.
  //
  // Sketch:
  //   const response = await client.messages.create({
  //     model: 'claude-opus-4-7',
  //     max_tokens: 1024,
  //     system: IDENTIFY_ITEM_PROMPT,
  //     output_config: { format: { type: 'json_schema', schema: IDENTIFY_SCHEMA } },
  //     messages: [{
  //       role: 'user',
  //       content: [
  //         { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
  //         { type: 'text', text: 'Identify the item in this photo.' }
  //       ]
  //     }]
  //   });
  //   return JSON.parse(textBlockOf(response));
  void IDENTIFY_ITEM_PROMPT;
  void IDENTIFY_SCHEMA;
  throw new Error('identifyItem: not implemented (Phase 3)');
}
