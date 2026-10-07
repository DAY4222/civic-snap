// No Deno or remote imports: the functions' logic.ts files use this, and Jest tests those.

const MAX_ERROR_MESSAGE_CHARS = 240;

/** Trims, then keeps at most maxLength characters. */
export function truncateText(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength);
}

/** Parses the JSON a model wrote, tolerating a Markdown code fence around it. */
export function parseJsonText(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');
  return JSON.parse(cleaned);
}

/** A thrown value's message, short enough for the runs tables' error_message column. */
export function describeError(error: unknown) {
  return truncateText(
    error instanceof Error ? error.message : String(error),
    MAX_ERROR_MESSAGE_CHARS
  );
}
