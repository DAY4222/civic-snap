import { parseJsonText } from './text.ts';

const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Gemini answers 500 or 503 when the model is briefly overloaded; one quick retry usually works. */
const RETRYABLE_GEMINI_STATUSES = new Set([500, 503]);
const GEMINI_RETRY_DELAY_MS = 800;

export type GeminiPart =
  | { text: string }
  | { inline_data: { data: string; mime_type: string } };

export type GeminiJsonRequest = {
  apiKey: string;
  model: string;
  parts: GeminiPart[];
  /** Sent as generation_config. */
  generationConfig: Record<string, unknown>;
  /** Covers the whole call, including the overload retry. */
  timeoutMs: number;
};

/**
 * Calls generateContent and parses the JSON the model wrote. Throws on HTTP errors, timeouts
 * and text that isn't JSON; the caller records the failure.
 */
export async function callGemini(request: GeminiJsonRequest): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

  try {
    const response = await sendWithOverloadRetry(() =>
      fetch(`${GEMINI_MODELS_URL}/${request.model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Keep the key out of the URL: fetch errors can include the URL, and error
          // messages are written to the runs tables.
          'x-goog-api-key': request.apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: request.parts }],
          generation_config: request.generationConfig,
        }),
      })
    );

    if (!response.ok) {
      throw new Error(`Gemini returned ${response.status}`);
    }

    const geminiResponse = await response.json();
    const text = geminiResponse?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text)
      .filter(Boolean)
      .join('\n');

    return parseJsonText(text ?? '');
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Gemini request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendWithOverloadRetry(send: () => Promise<Response>) {
  const response = await send();
  if (!RETRYABLE_GEMINI_STATUSES.has(response.status)) return response;

  await response.body?.cancel();
  await new Promise((resolve) => setTimeout(resolve, GEMINI_RETRY_DELAY_MS));
  return send();
}
