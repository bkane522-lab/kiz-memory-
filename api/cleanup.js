import { del } from '@vercel/blob';

const ALLOWED_PREFIXES = ['kiz-memory/source/', 'kiz-memory/analysis/', 'kiz-memory/result/'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const path = String(body.path || '');
    if (!ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return res.status(400).json({ error: 'Chemin temporaire invalide.' });
    }
    await del(path);
    return res.status(200).json({ deleted: true });
  } catch (error) {
    console.warn('cleanup error', error);
    return res.status(200).json({ deleted: false });
  }
}
