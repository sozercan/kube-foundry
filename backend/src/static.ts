import path from 'path';
import fs from 'fs';
import logger from './lib/logger';

// Static file serving for compiled binary and development mode
// Uses Bun's native file embedding for zero-copy serving in compiled mode

interface StaticFile {
  path: string;          // File path (filesystem or $bunfs internal path)
  contentType: string;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// Static files map (populated at startup)
const staticFiles = new Map<string, StaticFile>();

// Check if running as compiled binary
export const isCompiled = (): boolean => {
  try {
    // Use type assertion for import.meta in Bun/Node environments
    const meta = (import.meta as any);
    return meta?.dir?.includes('/$bunfs/') || process.env.BUN_SELF_EXECUTABLE !== undefined;
  } catch {
    return process.env.BUN_SELF_EXECUTABLE !== undefined;
  }
};

// Try to load embedded assets (only exists in compiled binary)
async function loadEmbeddedAssets(): Promise<boolean> {
  try {
    // Dynamic import - this module only exists after running embed-assets.ts
    const { EMBEDDED_ASSETS } = await import('./embedded-assets');

    for (const [urlPath, asset] of Object.entries(EMBEDDED_ASSETS)) {
      staticFiles.set(urlPath, {
        path: asset.path,
        contentType: asset.contentType,
      });
    }

    logger.info({ count: staticFiles.size }, `Loaded ${staticFiles.size} embedded assets`);
    return true;
  } catch {
    // embedded-assets.ts doesn't exist (development mode)
    return false;
  }
}

// Load files from filesystem (development mode)
async function loadFilesFromDisk(): Promise<boolean> {
  // Use type assertion for import.meta compatibility
  const meta = (import.meta as any);
  const staticDir = path.join(meta?.dir || __dirname, '../../frontend/dist');

  if (!fs.existsSync(staticDir)) {
    logger.warn({ staticDir }, `Frontend build not found: ${staticDir}`);
    logger.warn('Run "bun run build:frontend" to build the frontend.');
    return false;
  }

  try {
    await loadFilesFromDir(staticDir, '');
    logger.info({ count: staticFiles.size, staticDir }, `Loaded ${staticFiles.size} static files from ${staticDir}`);
    return true;
  } catch (error) {
    logger.warn({ error }, 'Could not load static files');
    return false;
  }
}

async function loadFilesFromDir(baseDir: string, prefix: string): Promise<void> {
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name);
    const urlPath = prefix ? `${prefix}/${entry.name}` : `/${entry.name}`;

    if (entry.isDirectory()) {
      await loadFilesFromDir(fullPath, urlPath);
    } else {
      staticFiles.set(urlPath, {
        path: fullPath,
        contentType: getMimeType(entry.name),
      });
    }
  }
}

// Load static files - tries embedded first, falls back to filesystem
export const loadStaticFiles = async (): Promise<void> => {
  // Try embedded assets first (compiled binary)
  if (await loadEmbeddedAssets()) {
    return;
  }

  // Fall back to filesystem (development mode)
  await loadFilesFromDisk();
};

// Get a file Response by path - uses Bun.file() for zero-copy serving
export const getStaticFileResponse = (urlPath: string): Response | undefined => {
  const normalizedPath = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
  const file = staticFiles.get(normalizedPath);

  if (!file) {
    return undefined;
  }

  try {
    // Use Bun.file() for zero-copy file serving
    // This works for both filesystem paths and $bunfs internal paths
    const bunFile = Bun.file(file.path);

    // Check if file exists (handles test environment and missing files)
    if (bunFile.size === 0 && !fs.existsSync(file.path)) {
      return undefined;
    }

    return new Response(bunFile, {
      headers: { 'Content-Type': file.contentType },
    });
  } catch {
    // Handle cases where file doesn't exist or can't be read
    return undefined;
  }
};

// Get index.html Response for SPA fallback
export const getIndexHtmlResponse = (): Response | undefined => {
  return getStaticFileResponse('/index.html');
};

// Check if files are loaded
export const hasStaticFiles = (): boolean => {
  return staticFiles.size > 0;
};

// Legacy exports for backward compatibility
export const getStaticFile = (urlPath: string): { content: Buffer; contentType: string } | undefined => {
  const normalizedPath = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
  const file = staticFiles.get(normalizedPath);

  if (!file) {
    return undefined;
  }

  // Read file content synchronously (less efficient than getStaticFileResponse)
  const content = fs.readFileSync(file.path);
  return {
    content,
    contentType: file.contentType,
  };
};

export const getIndexHtml = (): { content: Buffer; contentType: string } | undefined => {
  return getStaticFile('/index.html');
};

export type { StaticFile };
