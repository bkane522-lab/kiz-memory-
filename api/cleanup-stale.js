import { del, list } from '@vercel/blob';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PREFIX = 'kiz-memory/';

export default async function handler(req, res) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const authorization = req.headers.authorization || '';
    if (authorization !== `Bearer ${expected}`) {
      return res.status(401).json({ error: 'Non autorisé.' });
    }
  }

  try {
    const cutoff = Date.now() - MAX_AGE_MS;
    let cursor;
    let hasMore = true;
    let deleted = 0;

    while (hasMore) {
      const page = await list({ prefix: PREFIX, limit: 500, cursor });
      const expired = page.blobs
        .filter((blob) => new Date(blob.uploadedAt).getTime() < cutoff)
        .map((blob) => blob.pathname);

      if (expired.length) {
        await del(expired);
        deleted += expired.length;
      }

      hasMore = Boolean(page.hasMore);
      cursor = page.cursor;
    }

    return res.status(200).json({ ok: true, deleted });
  } catch (error) {
    console.error('cleanup-stale error', error);
    return res.status(500).json({ error: 'Nettoyage temporaire impossible.' });
  }
}
