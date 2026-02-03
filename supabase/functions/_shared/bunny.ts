// Bunny.net Storage API utilities

const BUNNY_STORAGE_ZONE = Deno.env.get('BUNNY_STORAGE_ZONE') || '';
const BUNNY_STORAGE_API_KEY = Deno.env.get('BUNNY_STORAGE_API_KEY') || '';
const BUNNY_STORAGE_HOSTNAME = Deno.env.get('BUNNY_STORAGE_HOSTNAME') || 'storage.bunnycdn.com';
const BUNNY_CDN_URL = Deno.env.get('BUNNY_CDN_URL') || '';

export interface BunnyConfig {
  storageZone: string;
  apiKey: string;
  hostname: string;
  cdnUrl: string;
}

export function getBunnyConfig(): BunnyConfig {
  if (!BUNNY_STORAGE_ZONE || !BUNNY_STORAGE_API_KEY || !BUNNY_CDN_URL) {
    throw new Error('Bunny.net environment variables are not configured');
  }

  return {
    storageZone: BUNNY_STORAGE_ZONE,
    apiKey: BUNNY_STORAGE_API_KEY,
    hostname: BUNNY_STORAGE_HOSTNAME,
    cdnUrl: BUNNY_CDN_URL,
  };
}

// Get the storage API URL for a path
function getStorageUrl(config: BunnyConfig, path: string): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `https://${config.hostname}/${config.storageZone}/${cleanPath}`;
}

// Get the public CDN URL for a path
export function getCdnUrl(path: string): string {
  const config = getBunnyConfig();
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${config.cdnUrl}/${cleanPath}`;
}

// Upload a file to Bunny storage
export async function uploadFile(
  path: string,
  data: Uint8Array | ReadableStream<Uint8Array>,
  contentType: string
): Promise<{ success: boolean; cdnUrl: string; storagePath: string }> {
  const config = getBunnyConfig();
  const url = getStorageUrl(config, path);

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'AccessKey': config.apiKey,
      'Content-Type': contentType,
    },
    body: data,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bunny upload failed: ${response.status} - ${errorText}`);
  }

  return {
    success: true,
    cdnUrl: getCdnUrl(path),
    storagePath: path,
  };
}

// Upload a file from a URL (useful for re-uploading from other sources)
export async function uploadFromUrl(
  path: string,
  sourceUrl: string
): Promise<{ success: boolean; cdnUrl: string; storagePath: string }> {
  // Fetch the file from the source URL
  const sourceResponse = await fetch(sourceUrl);
  if (!sourceResponse.ok) {
    throw new Error(`Failed to fetch source file: ${sourceResponse.status}`);
  }

  const contentType = sourceResponse.headers.get('content-type') || 'application/octet-stream';
  const data = new Uint8Array(await sourceResponse.arrayBuffer());

  return uploadFile(path, data, contentType);
}

// Delete a file from Bunny storage
export async function deleteFile(path: string): Promise<boolean> {
  const config = getBunnyConfig();
  const url = getStorageUrl(config, path);

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'AccessKey': config.apiKey,
    },
  });

  // 200 = deleted, 404 = already gone (both are fine)
  return response.ok || response.status === 404;
}

// List files in a directory
export async function listFiles(path: string): Promise<Array<{
  name: string;
  path: string;
  length: number;
  lastChanged: string;
  isDirectory: boolean;
}>> {
  const config = getBunnyConfig();
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const url = `https://${config.hostname}/${config.storageZone}/${cleanPath}/`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'AccessKey': config.apiKey,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    throw new Error(`Failed to list files: ${response.status}`);
  }

  const files = await response.json();
  return files.map((file: {
    ObjectName: string;
    Path: string;
    Length: number;
    LastChanged: string;
    IsDirectory: boolean;
  }) => ({
    name: file.ObjectName,
    path: file.Path,
    length: file.Length,
    lastChanged: file.LastChanged,
    isDirectory: file.IsDirectory,
  }));
}

// Check if a file exists
export async function fileExists(path: string): Promise<boolean> {
  const config = getBunnyConfig();
  const url = getStorageUrl(config, path);

  const response = await fetch(url, {
    method: 'HEAD',
    headers: {
      'AccessKey': config.apiKey,
    },
  });

  return response.ok;
}
