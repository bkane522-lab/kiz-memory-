import { del, issueSignedToken, presignUrl, put } from '@vercel/blob';
import { Sandbox } from '@vercel/sandbox';
import { randomUUID } from 'node:crypto';

const SOURCE_PREFIX = 'kiz-memory/source/';
const ANALYSIS_PREFIX = 'kiz-memory/analysis/';
const RESULT_PREFIX = 'kiz-memory/result/';
const SANDBOX_TIMEOUT_MS = 285 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  let sandbox;
  let sourcePath = '';
  let proxyPath = '';
  const resultPaths = [];

  try {
    const body = parseBody(req.body);
    sourcePath = String(body.sourcePath || '');
    proxyPath = String(body.proxyPath || '');
    const sourceName = String(body.sourceName || 'danse.mp4');
    const analysisMode = String(body.analysisMode || 'motion+audio');
    const segments = validateSegments(body.segments);

    if (!isAllowedPath(sourcePath, SOURCE_PREFIX)) return res.status(400).json({ error: 'Chemin vidéo invalide.' });
    if (proxyPath && !isAllowedPath(proxyPath, ANALYSIS_PREFIX)) return res.status(400).json({ error: 'Chemin proxy invalide.' });
    if (!segments.length) return res.status(400).json({ error: 'Aucun passage à découper.' });

    const sourceUrl = await signedReadUrl(sourcePath, 30 * 60 * 1000);
    sandbox = await createSandbox();
    const tools = await ensureFfmpeg(sandbox);
    const hasAudio = await probeRemoteAudio(sandbox, sourceUrl, tools.ffprobe);

    const renderedClips = [];
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      const clipName = `memory-${String(index + 1).padStart(2, '0')}.mp4`;
      const clipDuration = Math.max(0.5, segment.end - segment.start);
      const args = [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-ss', String(segment.start),
        '-i', sourceUrl,
        '-t', String(clipDuration),
        '-map', '0:v:0'
      ];
      if (hasAudio) args.push('-map', '0:a:0?');
      args.push(
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x07030D,setsar=1,fps=30',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '24',
        '-pix_fmt', 'yuv420p',
        '-profile:v', 'high',
        '-level', '4.1'
      );
      if (hasAudio) args.push('-c:a', 'aac', '-b:a', '160k', '-ar', '48000');
      else args.push('-an');
      args.push('-movflags', '+faststart', '-max_muxing_queue_size', '1024', clipName);

      const renderClip = await sandbox.runCommand(tools.ffmpeg, args);
      if (renderClip.exitCode !== 0) {
        throw new Error(`FFmpeg clip ${index + 1} failed: ${truncate(await renderClip.stderr())}`);
      }
      const stat = await sandbox.runCommand('stat', ['-c', '%s', clipName]);
      if (stat.exitCode !== 0) throw new Error(`Memory ${index + 1} absente après rendu.`);
      const outputBytes = Number((await stat.stdout()).trim()) || 0;
      if (outputBytes <= 0) throw new Error(`Memory ${index + 1} vide après rendu.`);
      renderedClips.push({ clipName, outputBytes, segment, index });
    }

    // Les fichiers source/proxy ne sont plus nécessaires. Les supprimer avant
    // d'enregistrer les clips garde de la marge sur le quota Blob Hobby.
    await safeDelete([sourcePath, proxyPath]);
    sourcePath = '';
    proxyPath = '';

    const resultTtl = 2 * 60 * 60 * 1000;
    const memories = [];
    for (const clip of renderedClips) {
      const resultPath = `${RESULT_PREFIX}${Date.now()}-${randomUUID()}-memory-${String(clip.index + 1).padStart(2, '0')}.mp4`;
      resultPaths.push(resultPath);
      await storeSandboxResult(sandbox, clip.clipName, resultPath, 'video/mp4');
      const resultUrl = await signedReadUrl(resultPath, resultTtl);
      memories.push({
        resultUrl,
        resultPath,
        filename: buildOutputFilename(sourceName, clip.index + 1),
        outputBytes: clip.outputBytes,
        duration: Math.round((clip.segment.end - clip.segment.start) * 10) / 10,
        start: clip.segment.start,
        end: clip.segment.end,
        index: clip.index + 1
      });
    }

    const outputBytes = memories.reduce((sum, memory) => sum + memory.outputBytes, 0);
    const selectedSeconds = memories.reduce((sum, memory) => sum + memory.duration, 0);

    return res.status(200).json({
      memories,
      outputBytes,
      format: 'video/mp4',
      videoCodec: 'H.264',
      audioCodec: hasAudio ? 'AAC' : null,
      width: 1080,
      height: 1920,
      clipCount: memories.length,
      selectedSeconds: Math.round(selectedSeconds * 10) / 10,
      analysisMode,
      renderStrategy: 'separate-selected-clips',
      expiresAt: Date.now() + resultTtl,
      version: '4.4'
    });
  } catch (error) {
    console.error('Kiz Memory render error', error);
    await safeDelete([sourcePath, proxyPath, ...resultPaths]);
    return res.status(500).json({ error: publicError(error) });
  } finally {
    if (sandbox) await sandbox.stop().catch(() => {});
  }
}

function validateSegments(value) {
  if (!Array.isArray(value)) return [];
  const clean = value.slice(0, 5).map((segment) => ({
    start: Number(segment?.start),
    end: Number(segment?.end)
  })).filter((segment) =>
    Number.isFinite(segment.start) &&
    Number.isFinite(segment.end) &&
    segment.start >= 0 &&
    segment.end > segment.start &&
    segment.end - segment.start >= 2 &&
    segment.end - segment.start <= 32 &&
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
  const baseConfig = {
    persistent: false,
    region: 'cdg1',
    timeout: SANDBOX_TIMEOUT_MS,
    resources: { vcpus: 2 }
  };
  const snapshotId = String(process.env.SANDBOX_SNAPSHOT_ID || '').trim();
  if (snapshotId) {
    try {
      return await Sandbox.create({ ...baseConfig, source: { type: 'snapshot', snapshotId } });
    } catch (error) {
      console.warn('Kiz Memory snapshot unavailable; retrying with a clean Sandbox', error);
    }
  }
  return Sandbox.create(baseConfig);
}

async function ensureFfmpeg(sandbox) {
  const detected = await detectFfmpeg(sandbox);
  if (detected) return detected;
  const install = await sandbox.runCommand('bash', [
    '-lc',
    [
      'set -e',
      'if command -v apt-get >/dev/null 2>&1; then',
      '  sudo apt-get update -qq',
      '  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg',
      'elif command -v dnf >/dev/null 2>&1; then',
      '  sudo dnf install -y ffmpeg',
      'else',
      '  echo "Aucun gestionnaire de paquets compatible" >&2',
      '  exit 77',
      'fi'
    ].join('\n')
  ]);
  if (install.exitCode !== 0) throw new Error(`FFmpeg system install failed: ${truncate(await install.stderr())}`);
  const installed = await detectFfmpeg(sandbox);
  if (!installed) throw new Error('FFmpeg install finished but ffmpeg/ffprobe are still unavailable.');
  return installed;
}

async function detectFfmpeg(sandbox) {
  const check = await sandbox.runCommand('bash', [
    '-lc',
    [
      'if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then',
      '  printf "%s\\n%s\\n" "$(command -v ffmpeg)" "$(command -v ffprobe)"',
      '  exit 0',
      'fi',
      'if [ -x ./ffmpeg ] && [ -x ./ffprobe ]; then',
      '  printf "%s\\n%s\\n" "./ffmpeg" "./ffprobe"',
      '  exit 0',
      'fi',
      'exit 1'
    ].join('\n')
  ]);
  if (check.exitCode !== 0) return null;
  const lines = (await check.stdout()).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  return { ffmpeg: lines[0], ffprobe: lines[1] };
}

async function probeRemoteAudio(sandbox, sourceUrl, ffprobe) {
  const probe = await sandbox.runCommand(ffprobe, [
    '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=index', '-of', 'csv=p=0', sourceUrl
  ]);
  return probe.exitCode === 0 && Boolean((await probe.stdout()).trim());
}

async function signedReadUrl(pathname, ttlMs) {
  const validUntil = Date.now() + ttlMs;
  const token = await issueSignedToken({ pathname, operations: ['get'], validUntil });
  const { presignedUrl } = await presignUrl(token, {
    pathname, operation: 'get', access: 'private', validUntil, useCache: false
  });
  return presignedUrl;
}

async function storeSandboxResult(sandbox, filename, pathname, contentType) {
  const buffer = await sandbox.readFileToBuffer({ path: filename });
  if (!buffer?.length) throw new Error('Result store failed: output file is missing or empty.');
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

function buildOutputFilename(name, index) {
  const base = String(name || 'kiz-memory')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'kiz-memory';
  return `${base}-memory-${String(index).padStart(2, '0')}.mp4`;
}

function truncate(value, limit = 1800) {
  const text = String(value || '');
  return text.length > limit ? text.slice(-limit) : text;
}

function publicError(error) {
  const text = String(error?.message || error || '');
  if (/snapshot/i.test(text)) return 'Le snapshot FFmpeg était indisponible ; Kiz Memory a essayé un Sandbox propre mais le démarrage a échoué.';
  if (/install/i.test(text)) return 'FFmpeg n’a pas pu être installé dans le Sandbox Vercel.';
  if (/sandbox|oidc|unauthor|forbidden/i.test(text)) return 'Vercel Sandbox n’a pas pu être créé pour le rendu.';
  if (/ffprobe/i.test(text)) return 'Le moteur n’a pas pu lire les pistes de la vidéo source.';
  if (/clip|Memory .*rendu/i.test(text)) return 'FFmpeg n’a pas pu extraire une des Memories sélectionnées.';
  if (/Result store failed/i.test(text)) return 'Les clips ont été créés, mais leur enregistrement privé a échoué.';
  return 'La création des Memories séparées a échoué.';
}
