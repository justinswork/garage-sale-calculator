import type Anthropic from '@anthropic-ai/sdk';

// With `output_config.format: { type: 'json_schema', schema: ... }` Claude
// returns the JSON as the text of a single content block. We extract and
// parse that here; the caller does the type assertion.

export function parseStructuredOutput<T>(
  response: Anthropic.Message,
  caller: string
): T {
  if (response.stop_reason === 'refusal') {
    throw new Error(
      `${caller}: model refused (${response.stop_details?.explanation ?? 'no explanation'})`
    );
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error(`${caller}: response was truncated (max_tokens hit)`);
  }

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text'
  );
  if (!textBlock?.text) {
    throw new Error(
      `${caller}: response had no text block (stop_reason=${response.stop_reason})`
    );
  }

  try {
    return JSON.parse(textBlock.text) as T;
  } catch {
    throw new Error(
      `${caller}: response was not valid JSON. First 200 chars: ${textBlock.text.slice(0, 200)}`
    );
  }
}
