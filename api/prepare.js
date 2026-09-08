import { del, issueSignedToken, presignUrl } from '@vercel/blob';
import { Sandbox } from '@vercel/sandbox';
import { randomUUID } from 'node:crypto';

const SOURCE_PREFIX = 'kiz-memory/source/';
const ANALYSIS_PREFIX = 'kiz-memory/analysis/';
const SANDBOX_TIMEOUT_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  let sandbox;
  let proxyPath = '';
  let audioPath = '';

  try {
    const body = parseBody(req.body);
    const sourcePath = String(body.sourcePath || '');
    if (!isAllowedSourcePath(sourcePath)) {
      return res.status(400).json({ error: 'Chemin vidéo invalide.' });
    }

    proxyPath = `${ANALYSIS_PREFIX}${Date.now()}-${randomUUID()}-proxy.mp4`;
    audioPath = `${ANALYSIS_PREFIX}${Date.now()}-${randomUUID()}-audio.wav`;

    const sourceUrl = await signedReadUrl(sourcePath, 15 * 60 * 1000);
    const proxyPutUrl = await signedWriteUrl(proxyPath, 15 * 60 * 1000, 'video/mp4');
    const audioPutUrl = await signedWriteUrl(audioPath, 15 * 60 * 1000, 'audio/wav');

    sandbox = await createSandbox();
    await ensureFfmpeg(sandbox);

    const download = await sandbox.runCommand('curl', ['-fsSL', '--retry', '2', '-o', 'input-video', sourceUrl]);
    if (download.exitCode !== 0) throw new Error(`Video download failed: ${truncate(await download.stderr())}`);

    const duration = await probeDuration(sandbox);
    const hasAudio = await probeAudio(sandbox);

    const proxy = await sandbox.runCommand('./ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', 'input-video',
      '-map', '0:v:0',
      '-an',
      '-vf', 'scale=360:640:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=360:640:(ow-iw)/2:(oh-ih)/2:color=0x07030D,setsar=1,fps=8',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '31',
      '-pix_fmt', 'yuv420p',
      '-profile:v', 'baseline',
      '-level', '3.0',
      '-movflags', '+faststart',
      'analysis-proxy.mp4'
    ]);
    if (proxy.exitCode !== 0) throw new Error(`FFmpeg proxy failed: ${truncate(await proxy.stderr())}`);

    let audio;
    if (hasAudio) {
      audio = await sandbox.runCommand('./ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', 'input-video',
        '-map', '0:a:0',
        '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
        'analysis-audio.wav'
      ]);
    } else {
      audio = await sandbox.runCommand('./ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono',
        '-t', String(Math.max(1, duration)),
        '-c:a', 'pcm_s16le',
        'analysis-audio.wav'
      ]);
    }
    if (audio.exitCode !== 0) throw new Error(`FFmpeg audio failed: ${truncate(await audio.stderr())}`);

    await uploadFile(sandbox, 'analysis-proxy.mp4', proxyPutUrl, 'video/mp4');
    await uploadFile(sandbox, 'analysis-audio.wav', audioPutUrl, 'audio/wav');

    const readTtl = 2 * 60 * 60 * 1000;
    const proxyUrl = await signedReadUrl(proxyPath, readTtl);
    const audioUrl = await signedReadUrl(audioPath, readTtl);

    return res.status(200).json({
      proxyUrl,
      proxyPath,
      audioUrl,
      audioPath,
      duration,
      hasAudio,
      proxy: { width: 360, height: 640, fps: 8, codec: 'H.264' },
      expiresAt: Date.now() + readTtl
    });
  } catch (error) {
    console.error('Kiz Memory prepare error', error);
    const cleanup = [proxyPath, audioPath].filter(Boolean);
    if (cleanup.length) await del(cleanup).catch(() => {});
    return res.status(500).json({ error: publicError(error) });
  } finally {
    if (sandbox) await sandbox.stop().catch(() => {});
  }
}

async function createSandbox() {
  const config = {
    persistent: false,
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

async function uploadFile(sandbox, filename, url, contentType) {
  const upload = await sandbox.runCommand('curl', [
    '-fsS', '--retry', '2', '-X', 'PUT', '-H', `Content-Type: ${contentType}`, '--upload-file', filename, url
  ]);
  if (upload.exitCode !== 0) throw new Error(`Analysis upload failed: ${truncate(await upload.stderr())}`);
}

async function signedReadUrl(pathname, ttlMs) {
  const validUntil = Date.now() + ttlMs;
  const token = await issueSignedToken({ pathname, operations: ['get'], validUntil });
  const { presignedUrl } = await presignUrl(token, {
    pathname, operation: 'get', access: 'private', validUntil, useCache: false
  });
  return presignedUrl;
}

async function signedWriteUrl(pathname, ttlMs, contentType) {
  const validUntil = Date.now() + ttlMs;
  const token = await issueSignedToken({
    pathname,
    operations: ['put'],
    allowedContentTypes: [contentType],
    validUntil
  });
  const { presignedUrl } = await presignUrl(token, { pathname, operation: 'put', access: 'private', validUntil });
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
  if (/download/i.test(text)) return 'Le moteur n’a pas pu récupérer la vidéo privée.';
  if (/proxy/i.test(text)) return 'La copie légère d’analyse n’a pas pu être créée.';
  if (/audio/i.test(text)) return 'La piste audio d’analyse n’a pas pu être créée.';
  if (/upload/i.test(text)) return 'Les fichiers temporaires d’analyse n’ont pas pu être stockés.';
  return 'La préparation de l’analyse vidéo a échoué.';
}
