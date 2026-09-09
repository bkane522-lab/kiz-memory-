import { del, list } from '@vercel/blob';

const PREFIX = 'kiz-memory/';
const TEMP_MAX_AGE_MS = 30 * 60 * 1000;
const RESULT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export default async function handler(req, res) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const authorization = req.headers.authorization || '';
    if (authorization !== `Bearer ${expected}`) {
      return res.status(401).json({ error: 'Non autorisé.' });
    }
  }

  try {
    const now = Date.now();
    let cursor;
    let hasMore = true;
    let deleted = 0;

    while (hasMore) {
      const page = await list({ prefix: PREFIX, limit: 500, cursor });
      const expired = page.blobs
        .filter((blob) => {
          const age = now - new Date(blob.uploadedAt).getTime();
          if (blob.pathname.startsWith('kiz-memory/result/')) return age > RESULT_MAX_AGE_MS;
          return age > TEMP_MAX_AGE_MS;
        })
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
