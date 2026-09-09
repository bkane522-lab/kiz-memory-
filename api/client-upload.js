import { handleUpload } from '@vercel/blob/client';

const MAX_BYTES = 1024 * 1024 * 1024; // 1 Go : limite produit actuelle, indépendante de la limite Blob
const ALLOWED_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/3gpp',
  'video/x-matroska',
  'application/octet-stream'
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const body = parseBody(req.body);
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        if (!isSafeSourcePath(pathname)) throw new Error('Chemin de stockage non autorisé.');

        const payload = safePayload(clientPayload);
        if (payload.size && (!Number.isFinite(payload.size) || payload.size <= 0 || payload.size > MAX_BYTES)) {
          throw new Error('Taille de vidéo non autorisée.');
        }

        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 2 * 60 * 60 * 1000,
          tokenPayload: JSON.stringify({
            version: '4.2.6',
            multipart: Boolean(multipart),
            size: payload.size || null
          })
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Aucun traitement n'est déclenché ici : le client lance ensuite /api/prepare.
        // On journalise uniquement des métadonnées non sensibles utiles au diagnostic.
        console.log('Kiz Memory upload completed', {
          pathname: blob?.pathname,
          contentType: blob?.contentType,
          tokenPayload
        });
      }
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error('client-upload error', error);
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
}

function safePayload(value) {
  if (!value || typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function isSafeSourcePath(pathname) {
  return typeof pathname === 'string' &&
    pathname.startsWith('kiz-memory/source/') &&
    /^[a-zA-Z0-9_./-]+$/.test(pathname) &&
    pathname.length < 300;
}
