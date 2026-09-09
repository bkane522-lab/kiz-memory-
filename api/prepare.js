import { del, head, issueSignedToken, list, presignUrl, put } from '@vercel/blob';
import { Sandbox } from '@vercel/sandbox';
import { randomUUID } from 'node:crypto';

const SOURCE_PREFIX = 'kiz-memory/source/';
const ANALYSIS_PREFIX = 'kiz-memory/analysis/';
const SANDBOX_TIMEOUT_MS = 285 * 1000; // sous la limite Hobby de 300 s

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  let sandbox;
  let proxyPath = '';

  try {
    const body = parseBody(req.body);
    const requestedSourcePath = String(body.sourcePath || '');
    if (!isAllowedSourcePath(requestedSourcePath)) {
      return res.status(400).json({ error: 'Chemin vidéo invalide.' });
    }

    const sourcePath = await resolveStoredSourcePath(requestedSourcePath);
    proxyPath = `${ANALYSIS_PREFIX}${Date.now()}-${randomUUID()}-proxy.mp4`;
    const sourceUrl = await signedReadUrl(sourcePath, 20 * 60 * 1000);

    sandbox = await createSandbox();
    await ensureFfmpeg(sandbox);

    const download = await sandbox.runCommand('curl', [
      '-sS', '-L', '--retry', '3', '--retry-all-errors', '--connect-timeout', '30',
      '-w', '%{http_code}', '-o', 'input-video', sourceUrl
    ]);
    const downloadStatus = (await download.stdout()).trim();
    if (download.exitCode !== 0 || downloadStatus < '200' || downloadStatus >= '300') {
      throw new Error(`Video download failed (HTTP ${downloadStatus || 'network'}): ${truncate(await download.stderr())}`);
    }

    const duration = await probeDuration(sandbox);
    const hasAudio = await probeAudio(sandbox);

    // V4.3 : UNE seule invocation FFmpeg traite la source.
    // - sortie 1 : proxy vidéo H.264 très léger pour mouvement + MediaPipe ;
    // - sortie 2 (si audio) : aucune piste média, seulement des métadonnées RMS
    //   toutes les 0,5 s dans un minuscule fichier texte.
    // Il n'y a plus de WAV PCM ni de second transcodage audio.
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', 'input-video',
      '-map', '0:v:0',
      '-an',
      '-vf', 'scale=240:426:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=240:426:(ow-iw)/2:(oh-ih)/2:color=0x07030D,setsar=1,fps=4',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '35',
      '-pix_fmt', 'yuv420p',
      '-profile:v', 'baseline',
      '-level', '3.0',
      '-movflags', '+faststart',
      '-max_muxing_queue_size', '1024',
      'analysis-proxy.mp4'
    ];

    if (hasAudio) {
      args.push(
        '-map', '0:a:0?',
        '-vn',
        '-af', 'aresample=16000,asetnsamples=n=8000:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=audio-levels.txt',
        '-f', 'null', '-'
      );
    }

    const proxy = await sandbox.runCommand('./ffmpeg', args);
    if (proxy.exitCode !== 0) throw new Error(`FFmpeg proxy failed: ${truncate(await proxy.stderr())}`);

    const stored = await storeSandboxFile(sandbox, 'analysis-proxy.mp4', proxyPath, 'video/mp4');
    const audioTimeline = hasAudio ? await readAudioTimeline(sandbox, duration) : [];
    const readTtl = 2 * 60 * 60 * 1000;
    const proxyUrl = await signedReadUrl(stored.pathname || proxyPath, readTtl);

    return res.status(200).json({
      sourcePath,
      proxyUrl,
      proxyPath: stored.pathname || proxyPath,
      duration,
      hasAudio,
      audioTimeline,
      proxy: { width: 240, height: 426, fps: 4, codec: 'H.264' },
      expiresAt: Date.now() + readTtl,
      version: '4.3'
    });
  } catch (error) {
    console.error('Kiz Memory prepare error', error);
    if (proxyPath) await del(proxyPath).catch(() => {});
    return res.status(500).json({ error: publicError(error) });
  } finally {
    if (sandbox) await sandbox.stop().catch(() => {});
  }
}

async function resolveStoredSourcePath(requestedPath) {
  try {
    await head(requestedPath, { access: 'private' });
    return requestedPath;
  } catch (exactError) {
    const dot = requestedPath.lastIndexOf('.');
    const prefix = dot > 0 ? requestedPath.slice(0, dot) : requestedPath;
    try {
      const result = await list({ prefix, limit: 10 });
      const candidates = (result?.blobs || []).filter((blob) =>
        blob?.pathname && isAllowedSourcePath(blob.pathname) && blob.pathname.startsWith(prefix)
      );
      if (candidates.length === 1) return candidates[0].pathname;
    } catch (listError) {
      console.error('Kiz Memory source lookup failed', listError);
    }
    throw new Error(`Source blob not found after upload: ${truncate(exactError?.message || exactError)}`);
  }
}

async function createSandbox() {
  const config = {
    persistent: false,
    region: 'cdg1',
    timeout: SANDBOX_TIMEOUT_MS,
    resources: { vcpus: 4 }
  };
  if (process.env.SANDBOX_SNAPSHOT_ID) {
    config.source = { type: 'snapshot', snapshotId: process.env.SANDBOX_SNAPSHOT_ID };
  }
  return Sandbox.create(config);
}

async function ensureFfmpeg(sandbox) {
  if (process.env.SANDBOX_SNAPSHOT_ID) return;
  const install = await sandbox.runCommand('bash', [
    '-c',
    'curl -fsSL https://johnvansickle.com/ffmpeg/releases/ffmpeg-7.0.2-amd64-static.tar.xz | tar -xJ --strip-components=1'
  ]);
  if (install.exitCode !== 0) throw new Error(`FFmpeg install failed: ${truncate(await install.stderr())}`);
}

async function probeDuration(sandbox) {
  const probe = await sandbox.runCommand('./ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', 'input-video'
  ]);
  if (probe.exitCode !== 0) throw new Error('FFprobe duration failed.');
  const value = Number((await probe.stdout()).trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error('Durée vidéo invalide.');
  return Math.round(value * 1000) / 1000;
}

async function probeAudio(sandbox) {
  const probe = await sandbox.runCommand('./ffprobe', [
    '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=index', '-of', 'csv=p=0', 'input-video'
  ]);
  return probe.exitCode === 0 && Boolean((await probe.stdout()).trim());
}

async function readAudioTimeline(sandbox, duration) {
  let buffer;
  try {
    buffer = await sandbox.readFileToBuffer({ path: 'audio-levels.txt' });
  } catch {
    return [];
  }
  if (!buffer?.length) return [];

  const text = buffer.toString('utf8');
  const raw = [];
  let time = null;
  for (const line of text.split(/\r?\n/)) {
    const timeMatch = line.match(/pts_time:([0-9.+-]+)/);
    if (timeMatch) {
      const parsed = Number(timeMatch[1]);
      time = Number.isFinite(parsed) ? parsed : null;
      continue;
    }
    const rmsMatch = line.match(/lavfi\.astats\.Overall\.RMS_level=([-+0-9.eEinfINF]+)/);
    if (!rmsMatch || time === null) continue;
    const db = Number(rmsMatch[1]);
    const amplitude = Number.isFinite(db) ? Math.pow(10, db / 20) : 0;
    raw.push({ t: time, rms: amplitude });
  }
  if (!raw.length) return [];

  const onset = raw.map((item, index) => Math.max(0, item.rms - (index ? raw[index - 1].rms : 0)));
  const rmsNorm = robustNormalize(raw.map((item) => item.rms));
  const onsetNorm = robustNormalize(onset);
  return raw
    .map((item, index) => ({
      t: Math.round(item.t * 1000) / 1000,
      value: round4(clamp01(0.72 * rmsNorm[index] + 0.28 * onsetNorm[index]))
    }))
    .filter((item) => item.t <= duration + 1);
}

function robustNormalize(values) {
  if (!values.length) return [];
  const sorted = [...values].map((value) => Number.isFinite(value) ? value : 0).sort((a, b) => a - b);
  const low = percentile(sorted, 0.1);
  const high = percentile(sorted, 0.9);
  const span = high - low;
  if (span < 1e-12) return values.map(() => 0.5);
  return values.map((value) => clamp01(((Number(value) || 0) - low) / span));
}

function percentile(sorted, p) {
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] || 0;
  return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

async function storeSandboxFile(sandbox, filename, pathname, contentType) {
  const buffer = await sandbox.readFileToBuffer({ path: filename });
  if (!buffer?.length) throw new Error(`Analysis store failed: ${filename} is missing or empty.`);
  try {
    const blob = await put(pathname, buffer, {
      access: 'private',
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
      multipart: buffer.length > 100 * 1024 * 1024
    });
    if (!blob?.pathname) throw new Error('Blob SDK returned no pathname.');
    return blob;
  } catch (error) {
    throw new Error(`Analysis store failed (${filename}, ${buffer.length} bytes): ${truncate(error?.message || error)}`);
  }
}

async function signedReadUrl(pathname, ttlMs) {
  const validUntil = Date.now() + ttlMs;
  const token = await issueSignedToken({ pathname, operations: ['get'], validUntil });
  const { presignedUrl } = await presignUrl(token, {
    pathname, operation: 'get', access: 'private', validUntil, useCache: false
  });
  return presignedUrl;
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
}

function isAllowedSourcePath(path) {
  return path.startsWith(SOURCE_PREFIX) && /^[a-zA-Z0-9_./-]+$/.test(path) && path.length < 240;
}

function truncate(value, limit = 1800) {
  const text = String(value || '');
  return text.length > limit ? text.slice(-limit) : text;
}

function publicError(error) {
  const text = String(error?.message || error || '');
  if (/snapshot/i.test(text)) return 'Le snapshot FFmpeg Vercel Sandbox est invalide ou expiré.';
  if (/install/i.test(text)) return 'FFmpeg n’a pas pu être préparé dans le moteur vidéo.';
  if (/Source blob not found/i.test(text)) return 'Le transfert est terminé, mais Vercel Blob ne retrouve pas encore le fichier stocké.';
  if (/download/i.test(text)) return 'Le moteur voit la vidéo privée, mais son téléchargement vers le moteur FFmpeg a échoué.';
  if (/proxy/i.test(text)) return 'La copie légère d’analyse n’a pas pu être créée.';
  if (/Analysis store failed/i.test(text)) return 'La copie légère a été créée, mais son enregistrement privé a échoué.';
  return 'La préparation de l’analyse vidéo a échoué.';
}
