import { issueSignedToken, presignUrl } from '@vercel/blob';
import { randomUUID } from 'node:crypto';

const MAX_BYTES = 1024 * 1024 * 1024; // 1 Go pour la V4.2.7
const ALLOWED_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/3gpp',
  'video/x-matroska',
  'application/octet-stream'
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const body = parseBody(req.body);
    const filename = String(body.filename || 'video.mp4');
    const contentType = String(body.contentType || 'application/octet-stream').toLowerCase();
    const size = Number(body.size || 0);

    if (!Number.isFinite(size) || size <= 0) {
      return res.status(400).json({ error: 'Fichier vidéo vide.' });
    }
    if (size > MAX_BYTES) {
      return res.status(413).json({ error: 'Vidéo trop volumineuse pour cette V4.2 (1 Go maximum).' });
    }
    if (contentType && !ALLOWED_TYPES.has(contentType) && !contentType.startsWith('video/')) {
      return res.status(415).json({ error: 'Type de fichier non vidéo.' });
    }

    const extension = safeExtension(filename, contentType);
    const pathname = `kiz-memory/source/${Date.now()}-${randomUUID()}.${extension}`;
    const validUntil = Date.now() + 2 * 60 * 60 * 1000;

    const token = await issueSignedToken({
      pathname,
      operations: ['put'],
      allowedContentTypes: ['video/*', 'application/octet-stream'],
      maximumSizeInBytes: MAX_BYTES,
      validUntil
    });

    const { presignedUrl } = await presignUrl(token, {
      pathname,
      operation: 'put',
      access: 'private',
      validUntil,
      addRandomSuffix: false,
      allowOverwrite: false,
      maximumSizeInBytes: MAX_BYTES
    });

    return res.status(200).json({ pathname, presignedUrl, expiresAt: validUntil, version: '4.2.7' });
  } catch (error) {
    console.error('upload-url error', error);
    return res.status(500).json({
      error: 'Impossible de préparer le stockage privé. Vérifiez que Vercel Blob est connecté au projet.'
    });
  }
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
}

function safeExtension(filename, contentType) {
  const match = String(filename).toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  const candidate = match?.[1];
  if (['mp4', 'mov', 'm4v', 'webm', '3gp', 'mkv'].includes(candidate)) return candidate;
  if (contentType.includes('quicktime')) return 'mov';
  if (contentType.includes('webm')) return 'webm';
  if (contentType.includes('3gpp')) return '3gp';
  if (contentType.includes('matroska')) return 'mkv';
  return 'mp4';
}
