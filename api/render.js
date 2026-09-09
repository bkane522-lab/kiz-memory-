import { del, issueSignedToken, presignUrl, put } from '@vercel/blob';
import { Sandbox } from '@vercel/sandbox';
import { randomUUID } from 'node:crypto';

const SOURCE_PREFIX = 'kiz-memory/source/';
const ANALYSIS_PREFIX = 'kiz-memory/analysis/';
const RESULT_PREFIX = 'kiz-memory/result/';
const SANDBOX_TIMEOUT_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  let sandbox;
  let sourcePath = '';
  let proxyPath = '';
  let audioPath = '';
  let resultPath = '';

  try {
    const body = parseBody(req.body);
    sourcePath = String(body.sourcePath || '');
    proxyPath = String(body.proxyPath || '');
    audioPath = String(body.audioPath || '');
    const sourceName = String(body.sourceName || 'danse.mp4');
    const analysisMode = String(body.analysisMode || 'motion+audio');
    const segments = validateSegments(body.segments);

    if (!isAllowedPath(sourcePath, SOURCE_PREFIX)) {
      return res.status(400).json({ error: 'Chemin vidéo invalide.' });
    }
    if (proxyPath && !isAllowedPath(proxyPath, ANALYSIS_PREFIX)) {
      return res.status(400).json({ error: 'Chemin proxy invalide.' });
    }
    if (audioPath && !isAllowedPath(audioPath, ANALYSIS_PREFIX)) {
      return res.status(400).json({ error: 'Chemin audio invalide.' });
    }
    if (!segments.length) {
      return res.status(400).json({ error: 'Aucun passage à assembler.' });
    }

    resultPath = `${RESULT_PREFIX}${Date.now()}-${randomUUID()}.mp4`;
    const sourceUrl = await signedReadUrl(sourcePath, 15 * 60 * 1000);

    sandbox = await createSandbox();
    await ensureFfmpeg(sandbox);

    const download = await sandbox.runCommand('curl', ['-fsSL', '--retry', '2', '-o', 'input-video', sourceUrl]);
    if (download.exitCode !== 0) throw new Error(`Video download failed: ${truncate(await download.stderr())}`);

    const hasAudio = await probeAudio(sandbox);
    const ffmpegArgs = buildRenderArgs(segments, hasAudio);
    const render = await sandbox.runCommand('./ffmpeg', ffmpegArgs);
    if (render.exitCode !== 0) throw new Error(`FFmpeg render failed: ${truncate(await render.stderr())}`);

    const stat = await sandbox.runCommand('stat', ['-c', '%s', 'output.mp4']);
    if (stat.exitCode !== 0) throw new Error('La Memory MP4 finale n’a pas été créée.');
    const outputBytes = Number((await stat.stdout()).trim()) || 0;
    if (outputBytes <= 0) throw new Error('La Memory MP4 finale est vide.');

    await storeSandboxResult(sandbox, 'output.mp4', resultPath, 'video/mp4');

    await safeDelete([sourcePath, proxyPath, audioPath]);
    sourcePath = '';
    proxyPath = '';
    audioPath = '';

    const resultTtl = 2 * 60 * 60 * 1000;
    const resultUrl = await signedReadUrl(resultPath, resultTtl);
    const selectedSeconds = segments.reduce((sum, segment) => sum + (segment.end - segment.start), 0);

    return res.status(200).json({
      resultUrl,
      resultPath,
      filename: buildOutputFilename(sourceName),
      outputBytes,
      format: 'video/mp4',
      videoCodec: 'H.264',
      audioCodec: hasAudio ? 'AAC' : null,
      width: 1080,
      height: 1920,
      clipCount: segments.length,
      selectedSeconds: Math.round(selectedSeconds * 10) / 10,
      analysisMode,
      expiresAt: Date.now() + resultTtl
    });
  } catch (error) {
    console.error('Kiz Memory render error', error);
    await safeDelete([sourcePath, proxyPath, audioPath, resultPath]);
    return res.status(500).json({ error: publicError(error) });
  } finally {
    if (sandbox) await sandbox.stop().catch(() => {});
  }
}

function buildRenderArgs(segments, hasAudio) {
  const filterParts = [];
  segments.forEach((segment, index) => {
    filterParts.push(`[0:v:0]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[v${index}]`);
    if (hasAudio) {
      filterParts.push(`[0:a:0]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[a${index}]`);
    }
  });

  if (hasAudio) {
    const inputs = segments.map((_, index) => `[v${index}][a${index}]`).join('');
    filterParts.push(`${inputs}concat=n=${segments.length}:v=1:a=1[vcat][acat]`);
  } else {
    const inputs = segments.map((_, index) => `[v${index}]`).join('');
    filterParts.push(`${inputs}concat=n=${segments.length}:v=1:a=0[vcat]`);
  }

  filterParts.push('[vcat]scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x07030D,setsar=1,fps=30[vout]');

  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', 'input-video',
    '-filter_complex', filterParts.join(';'),
    '-map', '[vout]'
  ];

  if (hasAudio) args.push('-map', '[acat]');

  args.push(
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '24',
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'high',
    '-level', '4.1'
  );

  if (hasAudio) {
    args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  }

  args.push('-movflags', '+faststart', '-max_muxing_queue_size', '2048', 'output.mp4');
  return args;
}

function validateSegments(value) {
  if (!Array.isArray(value)) return [];
  const clean = value.slice(0, 8).map((segment) => ({
    start: Number(segment?.start),
    end: Number(segment?.end)
  })).filter((segment) =>
    Number.isFinite(segment.start) &&
    Number.isFinite(segment.end) &&
    segment.start >= 0 &&
    segment.end > segment.start &&
    segment.end - segment.start >= 1 &&
    segment.end - segment.start <= 15 &&
    segment.end <= 6 * 60 * 60
  );
  clean.sort((a, b) => a.start - b.start);
  for (let i = 1; i < clean.length; i++) {
    if (clean[i].start < clean[i - 1].end - 0.05) return [];
  }
  return clean.map((segment) => ({
    start: Math.round(segment.start * 1000) / 1000,
    end: Math.round(segment.end * 1000) / 1000
  }));
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

async function probeAudio(sandbox) {
  const probe = await sandbox.runCommand('./ffprobe', [
    '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=index', '-of', 'csv=p=0', 'input-video'
  ]);
  return probe.exitCode === 0 && Boolean((await probe.stdout()).trim());
}

async function signedReadUrl(pathname, ttlMs) {
  const validUntil = Date.now() + ttlMs;
  const token = await issueSignedToken({ pathname, operations: ['get'], validUntil });
  const { presignedUrl } = await presignUrl(token, { pathname, operation: 'get', access: 'private', validUntil, useCache: false });
  return presignedUrl;
}

async function storeSandboxResult(sandbox, filename, pathname, contentType) {
  const buffer = await sandbox.readFileToBuffer({ path: filename });
  if (!buffer || buffer.length === 0) {
    throw new Error('Result store failed: output file is missing or empty.');
  }

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
    throw new Error(`Result store failed (${buffer.length} bytes): ${truncate(error?.message || error)}`);
  }
}

async function safeDelete(paths) {
  const clean = [...new Set(paths.filter(Boolean))];
  if (!clean.length) return;
  await del(clean).catch((error) => console.warn('cleanup failed', error));
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
}

function isAllowedPath(path, prefix) {
  return path.startsWith(prefix) && /^[a-zA-Z0-9_./-]+$/.test(path) && path.length < 240;
}

function buildOutputFilename(name) {
  const base = String(name || 'kiz-memory')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'kiz-memory';
  return `${base}-memory.mp4`;
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
  if (/render/i.test(text)) return 'FFmpeg n’a pas pu découper et assembler les passages sélectionnés.';
  if (/Result store failed/i.test(text)) return 'La Memory a été créée, mais son enregistrement privé a échoué.';
  return 'La création de la Memory finale a échoué.';
}
