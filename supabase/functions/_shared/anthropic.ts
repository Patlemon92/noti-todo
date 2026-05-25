/**
 * Thin wrapper around Anthropic Messages API.
 * No SDK — keeps the deno bundle tiny and fast cold-starts.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5';

const TONE_RULES = `tone rules — these are absolute:
- output lowercase always, except proper nouns and acronyms
- be brief. no preamble like "sure!" "great task!" "here you go"
- never patronizing; assume a competent adult
- no emoji unless the user already used one
- no advice on motivation. just questions or actions
- prefer 1 specific verb-led instruction over 3 generic ones`;

export interface AnthropicImage {
  /** Public/signed URL the model can fetch. Use for vision calls. */
  url?: string;
  /** Or a base64 data string + its media type (e.g. 'image/jpeg'). */
  base64?: string;
  mediaType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export interface AnthropicCall {
  system: string;
  user: string;
  maxTokens: number;
  jsonMode?: boolean; // if true, instruct the model to return strict JSON only
  /** Optional images to send alongside `user` as vision input. */
  images?: AnthropicImage[];
}

export interface AnthropicResult<T = unknown> {
  parsed: T;
  raw: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export async function callAnthropic<T = unknown>(
  opts: AnthropicCall,
): Promise<AnthropicResult<T>> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');

  const started = Date.now();

  const systemFinal = [
    TONE_RULES,
    opts.system,
    opts.jsonMode
      ? 'respond with strict valid JSON only. no markdown, no commentary, no fences.'
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  // Build user content: images (if any) + text. When images is empty we
  // pass the bare string to keep the request shape identical to before.
  const userContent: unknown = opts.images && opts.images.length
    ? [
        ...opts.images.map((img) => {
          if (img.url) {
            return { type: 'image', source: { type: 'url', url: img.url } };
          }
          if (img.base64) {
            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: img.mediaType ?? 'image/jpeg',
                data: img.base64,
              },
            };
          }
          throw new Error('image must have url or base64');
        }),
        { type: 'text', text: opts.user },
      ]
    : opts.user;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens,
      system: systemFinal,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  const durationMs = Date.now() - started;

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`anthropic ${res.status}: ${errText.slice(0, 400)}`);
  }

  const body = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const text =
    body.content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('') ?? '';

  let parsed: T;
  if (opts.jsonMode) {
    parsed = safeJsonParse<T>(text);
  } else {
    parsed = text as unknown as T;
  }

  return {
    parsed,
    raw: text,
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
    durationMs,
  };
}

function safeJsonParse<T>(raw: string): T {
  // models sometimes wrap JSON in ```json ... ``` even when told not to
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\n?/, '').replace(/```\s*$/, '');
  }
  // grab the first {...} or [...] block if there's leading text
  const start = text.search(/[\{\[]/);
  if (start > 0) text = text.slice(start);
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error('model returned invalid JSON: ' + text.slice(0, 200));
  }
}
