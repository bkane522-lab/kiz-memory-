import { del, list } from '@vercel/blob';

const PREFIX = 'kiz-memory/';
const SOURCE_PREFIX = 'kiz-memory/source/';
const ANALYSIS_PREFIX = 'kiz-memory/analysis/';
const RESULT_PREFIX = 'kiz-memory/result/';
const FREE_TARGET_BYTES = 950 * 1024 * 1024;
const SOURCE_ANALYSIS_MAX_AGE = 30 * 60 * 1000;
const RESULT_MAX_AGE = 2 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const body = parseBody(req.body);
    const requiredBytes = Math.max(0, Number(body.requiredBytes || 0));
    const now = Date.now();
    const blobs = [];
    let cursor;
    let hasMore = true;

    while (hasMore) {
      const page = await list({ prefix: PREFIX, limit: 500, cursor });
      blobs.push(...(page?.blobs || []));
      hasMore = Boolean(page?.hasMore);
      cursor = page?.cursor;
    }

    const toDelete = new Set();
    for (const blob of blobs) {
      const age = now - new Date(blob.uploadedAt).getTime();
      if ((blob.pathname.startsWith(SOURCE_PREFIX) || blob.pathname.startsWith(ANALYSIS_PREFIX)) && age > SOURCE_ANALYSIS_MAX_AGE) {
        toDelete.add(blob.pathname);
      }
      if (blob.pathname.startsWith(RESULT_PREFIX) && age > RESULT_MAX_AGE) {
        toDelete.add(blob.pathname);
      }
    }

    if (toDelete.size) await del([...toDelete]);

    let survivors = blobs.filter((blob) => !toDelete.has(blob.pathname));
    let usedBytes = survivors.reduce((sum, blob) => sum + Number(blob.size || 0), 0);
    const reserveBytes = 25 * 1024 * 1024;
    const needed = requiredBytes + reserveBytes;

    // If old result files still prevent a new upload, remove the oldest result
    // files first. Results are temporary by product design.
    if (usedBytes + needed > FREE_TARGET_BYTES) {
      const resultCandidates = survivors
        .filter((blob) => blob.pathname.startsWith(RESULT_PREFIX))
        .sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
      const extra = [];
      for (const blob of resultCandidates) {
        if (usedBytes + needed <= FREE_TARGET_BYTES) break;
        extra.push(blob.pathname);
        usedBytes -= Number(blob.size || 0);
      }
      if (extra.length) {
        await del(extra);
        extra.forEach((path) => toDelete.add(path));
        survivors = survivors.filter((blob) => !toDelete.has(blob.pathname));
      }
    }

    return res.status(200).json({
      ok: true,
      deleted: toDelete.size,
      usedBytes: Math.max(0, usedBytes),
      requiredBytes,
      targetBytes: FREE_TARGET_BYTES,
      enoughSpace: usedBytes + needed <= FREE_TARGET_BYTES
    });
  } catch (error) {
    console.error('storage-maintenance error', error);
    return res.status(500).json({ error: 'Le nettoyage du stockage temporaire a échoué.' });
  }
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
}
