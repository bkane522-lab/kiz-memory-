import { del, head, issueSignedToken, list, presignUrl, put } from '@vercel/blob';
import { Sandbox } from '@vercel/sandbox';
import { randomUUID } from 'node:crypto';

const SOURCE_PREFIX = 'kiz-memory/source/';
const ANALYSIS_PREFIX = 'kiz-memory/analysis/';
const SANDBOX_TIMEOUT_MS = 295 * 1000; // garde une marge sous la limite Function Hobby de 300 s
const LARGE_SOURCE_BYTES = 300 * 1024 * 1024;

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
    const sourceMeta = await head(sourcePath, { access: 'private' });
    const sourceBytes = Math.max(0, Number(sourceMeta?.size || 0));
    const largeSourceMode = sourceBytes >= LARGE_SOURCE_BYTES;
    const proxyFps = largeSourceMode ? 1 : 2;
    proxyPath = `${ANALYSIS_PREFIX}${Date.now()}-${randomUUID()}-proxy.mp4`;
    const sourceUrl = await signedReadUrl(sourcePath, 60 * 60 * 1000);

    sandbox = await createSandbox();
    const tools = await ensureFfmpeg(sandbox);

    // V4.4.3 : ne copie plus 300–900 Mo dans le Sandbox avant de travailler.
    // FFprobe et FFmpeg lisent directement le Blob privé signé. Le stockage et
    // le décodage peuvent donc avancer en flux, sans double transfert préalable.
    const media = await probeMedia(sandbox, tools.ffprobe, sourceUrl);
    const duration = media.duration;
    const hasAudio = media.hasAudio;

    // V4.3 : UNE seule invocation FFmpeg traite la source.
    // - sortie 1 : proxy vidéo H.264 très léger pour mouvement + MediaPipe ;
    // - sortie 2 (si audio) : aucune piste média, seulement des métadonnées RMS
    //   toutes les 0,5 s dans un minuscule fichier texte.
    // Il n'y a plus de WAV PCM ni de second transcodage audio.
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y'
    ];

    // Pour les très gros fichiers, décoder uniquement les images-clés est
    // suffisant pour repérer des fenêtres de 15–30 s et réduit radicalement
    // le coût CPU. L'audio continue d'être analysé sur toute la durée.
    if (largeSourceMode) args.push('-skip_frame', 'nokey');
    args.push(
      '-i', sourceUrl,
      '-map', '0:v:0',
      '-an',
      '-vf', `fps=${proxyFps},scale=240:426:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=240:426:(ow-iw)/2:(oh-ih)/2:color=0x07030D,setsar=1`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '35',
      '-pix_fmt', 'yuv420p',
      '-profile:v', 'baseline',
      '-level', '3.0',
      '-movflags', '+faststart',
      '-max_muxing_queue_size', '1024',
      'analysis-proxy.mp4'
    );

    if (hasAudio) {
      args.push(
        '-map', '0:a:0?',
        '-vn',
        '-af', 'aresample=16000,asetnsamples=n=8000:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=audio-levels.txt',
        '-f', 'null', '-'
      );
    }

    const proxy = await sandbox.runCommand(tools.ffmpeg, args);
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
      proxy: { width: 240, height: 426, fps: proxyFps, codec: 'H.264', mode: largeSourceMode ? 'large-keyframes' : 'standard' },
      sourceBytes,
      expiresAt: Date.now() + readTtl,
      version: '4.4.3'
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
  const baseConfig = {
    persistent: false,
    region: 'cdg1',
    timeout: SANDBOX_TIMEOUT_MS,
    // V4.4.1 : Hobby autorise 4 vCPU. On les utilise pour réduire fortement le temps
    // de décodage/transcodage des vidéos longues et rester sous les 300 s de la Function.
    resources: { vcpus: 4 }
  };

  const snapshotId = String(process.env.SANDBOX_SNAPSHOT_ID || '').trim();
  if (snapshotId) {
    try {
      return await Sandbox.create({
        ...baseConfig,
        source: { type: 'snapshot', snapshotId }
      });
    } catch (error) {
      // Un ancien snapshot ne doit plus bloquer toute l'application.
      console.warn('Kiz Memory snapshot unavailable; retrying with a clean Sandbox', error);
    }
  }

  return Sandbox.create(baseConfig);
}

async function ensureFfmpeg(sandbox) {
  const detected = await detectFfmpeg(sandbox);
  if (detected) return detected;

  // SDK v3 utilise l'image universelle Ubuntu. On privilégie le paquet système
  // plutôt qu'un téléchargement tiers d'archive FFmpeg à chaque démarrage.
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

  if (install.exitCode !== 0) {
    throw new Error(`FFmpeg system install failed: ${truncate(await install.stderr())}`);
  }

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

async function probeMedia(sandbox, ffprobe, sourceUrl) {
  const probe = await sandbox.runCommand(ffprobe, [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type',
    '-of', 'json',
    sourceUrl
  ]);
  if (probe.exitCode !== 0) {
    throw new Error(`FFprobe media failed: ${truncate(await probe.stderr())}`);
  }
  let parsed;
  try {
    parsed = JSON.parse((await probe.stdout()).trim() || '{}');
  } catch {
    throw new Error('FFprobe media returned invalid JSON.');
  }
  const duration = Number(parsed?.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Durée vidéo invalide.');
  const hasAudio = Array.isArray(parsed?.streams) && parsed.streams.some((stream) => stream?.codec_type === 'audio');
  return { duration: Math.round(duration * 1000) / 1000, hasAudio };
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
  if (/timeout|timed out|deadline|stopped|duration exceeded|285000|295000|300000/i.test(text)) {
    return 'La préparation de cette vidéo a dépassé le temps disponible sur Vercel Hobby. Kiz Memory n’a pas modifié votre vidéo.';
  }
  if (/snapshot/i.test(text)) return 'Le snapshot FFmpeg était indisponible ; Kiz Memory a essayé un Sandbox propre mais le démarrage a échoué.';
  if (/install/i.test(text)) return 'FFmpeg n’a pas pu être installé dans le Sandbox Vercel.';
  if (/sandbox|oidc|unauthor|forbidden/i.test(text)) return 'Vercel Sandbox n’a pas pu être créé pour ce traitement.';
  if (/Source blob not found/i.test(text)) return 'Le transfert est terminé, mais Vercel Blob ne retrouve pas encore le fichier stocké.';
  if (/download/i.test(text)) return 'Le moteur voit la vidéo privée, mais son téléchargement vers le moteur FFmpeg a échoué.';
  if (/proxy/i.test(text)) return 'La copie légère d’analyse n’a pas pu être créée.';
  if (/Analysis store failed/i.test(text)) return 'La copie légère a été créée, mais son enregistrement privé a échoué.';
  return 'La préparation de l’analyse vidéo a échoué.';
}
