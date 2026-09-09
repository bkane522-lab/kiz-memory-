import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned } from '@vercel/blob/client';

const SOURCE_PREFIX = 'kiz-memory/source/';
const MAX_BYTES = 1024 * 1024 * 1024;
const ALLOWED_TYPES = [
  'video/*',
  'application/octet-stream'
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const body = parseBody(req.body);
    const result = await handleUploadPresigned({
      request: req,
      body,
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY,
      async getSignedToken(pathname) {
        if (!isAllowedSourcePath(pathname)) {
          throw new Error('Chemin vidéo invalide.');
        }
        const validUntil = Date.now() + 2 * 60 * 60 * 1000;
        const token = await issueSignedToken({
          pathname,
          operations: ['put'],
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          validUntil
        });
        return {
          token,
          urlOptions: {
            validUntil,
            addRandomSuffix: false,
            allowOverwrite: false
          }
        };
      }
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('client-upload-presigned error', error);
    const text = String(error?.message || error || '');
    if (/webhook public key/i.test(text)) {
      return res.status(500).json({ error: 'La connexion Vercel Blob du projet est incomplète (clé webhook absente).' });
    }
    if (/Chemin vidéo invalide/i.test(text)) {
      return res.status(400).json({ error: 'Chemin vidéo invalide.' });
    }
    return res.status(500).json({ error: 'Impossible de préparer le transfert multipart privé.' });
  }
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
}

function isAllowedSourcePath(pathname) {
  return typeof pathname === 'string' &&
    pathname.startsWith(SOURCE_PREFIX) &&
    /^[a-zA-Z0-9_./-]+$/.test(pathname) &&
    pathname.length < 300;
}
