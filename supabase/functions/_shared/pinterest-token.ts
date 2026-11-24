// Reads Pinterest's answer to the OAuth code exchange. The body holds the access and refresh
// tokens, so it is never logged and never put in an error: an unreadable answer names only the
// HTTP status. No network imports here, so the tests run offline.

export interface PinterestTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
}

export function parseTokenResponse(status: number, text: string): PinterestTokenResponse {
  let data: Partial<PinterestTokenResponse> & { error?: string; error_description?: string };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid token response (status ${status})`);
  }
  if (!data || typeof data !== 'object' || data.error || !data.access_token) {
    throw new Error(data?.error_description || data?.error || 'Failed to exchange authorization code');
  }
  return data as PinterestTokenResponse;
}
