import path from 'path';
import fs from 'fs';
import logger from './lib/logger';

// Static file serving for compiled binary and development mode

interface StaticFile {
  content: Buffer;
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
  return import.meta.dir.includes('/$bunfs/') || process.env.BUN_SELF_EXECUTABLE !== undefined;
};

// Try to load embedded assets (only exists in compiled binary)
async function loadEmbeddedAssets(): Promise<boolean> {
  try {
    // Dynamic import - this module only exists after running embed-assets.ts
    const { EMBEDDED_ASSETS } = await import('./embedded-assets');
    
    for (const [urlPath, asset] of Object.entries(EMBEDDED_ASSETS)) {
      staticFiles.set(urlPath, {
        content: Buffer.from(asset.content, 'base64'),
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
  const staticDir = path.join(import.meta.dir, '../../frontend/dist');
  
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
      const content = fs.readFileSync(fullPath);
      staticFiles.set(urlPath, {
        content,
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

// Get a file by path
export const getStaticFile = (urlPath: string): StaticFile | undefined => {
  // Normalize path
  const normalizedPath = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
  return staticFiles.get(normalizedPath);
};

// Get index.html for SPA fallback
export const getIndexHtml = (): StaticFile | undefined => {
  return staticFiles.get('/index.html');
};

// Check if files are loaded
export const hasStaticFiles = (): boolean => {
  return staticFiles.size > 0;
};

export { StaticFile };
