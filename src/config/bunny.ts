// Bunny.net CDN configuration
// The CDN URL is used to serve media files publicly
// No signed URLs needed - files are served directly from the CDN

const bunnyCdnUrl = import.meta.env.VITE_BUNNY_CDN_URL;

if (!bunnyCdnUrl) {
  console.warn('VITE_BUNNY_CDN_URL is not set. Media uploads will not work.');
}

export const BUNNY_CDN_URL = bunnyCdnUrl || '';

// Generate a public CDN URL for a storage path
export function getCdnUrl(storagePath: string): string {
  if (!BUNNY_CDN_URL) {
    throw new Error('Bunny CDN URL is not configured');
  }
  // Remove leading slash if present
  const cleanPath = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;
  return `${BUNNY_CDN_URL}/${cleanPath}`;
}

// Check if Bunny is configured
export function isBunnyConfigured(): boolean {
  return Boolean(BUNNY_CDN_URL);
}
