// Keeps secrets out of function logs, thrown errors and the error messages Ritmo stores
// (security review #52).
//
// Instagram, Facebook and Pinterest calls carry access tokens, app secrets and OAuth codes in URL
// queries, request bodies and token responses. Deno's fetch puts the full URL (query included) in its
// network error message, and several handlers return error.message to the caller or save it in
// sch_scheduled_posts.error_message. So:
//   - fetchSafe: fetch, but a network failure names the URL without its query;
//   - redactUrl / redactText: drop URL queries and token-looking fields from free text;
//   - apiError: the fields of an API error object worth logging, never the whole body;
//   - xmlErrorCode: the <Code> of an S3-style XML error, never the body (it can echo the signature).
// No network imports here, so the tests run offline.

const URL_IN_TEXT = /https?:\/\/[^\s"'<>)]+/g;
const TOKEN_FIELD =
  /((?:access|refresh|fb_exchange|page_access)_token|client_secret)(["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi;
// Authorization header values (Bearer access tokens, Basic app id:secret).
const AUTH_VALUE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g;

// Cuts at the first ? or #: OAuth redirects can carry tokens in the fragment too.
export function redactUrl(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : `${url.slice(0, cut)}${url[cut]}[query redacted]`;
}

export function redactText(text: string): string {
  return text
    .replace(URL_IN_TEXT, (u) => redactUrl(u))
    .replace(TOKEN_FIELD, '$1$2[redacted]')
    .replace(AUTH_VALUE, '$1 [redacted]');
}

export async function fetchSafe(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    const reason = error instanceof Error ? redactText(error.message) : 'unknown error';
    throw new Error(`Request to ${redactUrl(url)} failed: ${reason}`);
  }
}

const ERROR_FIELDS = ['message', 'type', 'code', 'error_subcode', 'fbtrace_id', 'error', 'error_description'];

export function apiError(error: unknown): string {
  if (typeof error === 'string') return redactText(error).slice(0, 300);
  if (!error || typeof error !== 'object') return 'no error details';
  const e = error as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ERROR_FIELDS) {
    const v = e[key];
    if (typeof v === 'number') parts.push(`${key}=${v}`);
    else if (typeof v === 'string') parts.push(`${key}=${redactText(v).slice(0, 300)}`);
  }
  return parts.join(' ') || 'no error details';
}

export function xmlErrorCode(text: string): string {
  return text.match(/<Code>([A-Za-z0-9.]{1,64})<\/Code>/)?.[1] ?? 'unknown';
}
