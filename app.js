const APP_VERSION = "4.2.3";
const MEDIAPIPE_VERSION = "1.0.1";
const MEDIAPIPE_MODULE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const MEDIAPIPE_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const state = {
  sourceBlob: null,
  sourceName: "video-kiz-memory",
  sourceMime: "",
  sourcePath: "",
  proxyPath: "",
  audioPath: "",
  resultUrl: "",
  resultPath: "",
  resultBlob: null,
  resultName: "kiz-memory.mp4",
  cameraStream: null,
  recorder: null,
  recordedChunks: [],
  recording: false,
  recSeconds: 0,
  recTimer: null,
  facingMode: "environment",
  processing: false,
  analysisObjectUrls: [],
  analysisMode: "",
  segments: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const pages = $$(".page");

const fileInput = $("#fileInput");
const fileInputCamera = $("#fileInputCamera");
const cameraVideo = $("#cameraVideo");
const cameraMessage = $("#cameraMessage");
const recordBtn = $("#recordBtn");
const recordLabel = $("#recordLabel");
const recTime = $("#recTime");
const resultVideo = $("#resultVideo");
const analysisVideo = $("#analysisVideo");
const analysisCanvas = $("#analysisCanvas");
const toastEl = $("#toast");

function go(pageId) {
  pages.forEach((page) => page.classList.toggle("active", page.id === pageId));
}

$("#startCameraBtn").addEventListener("click", async () => {
  go("capture");
  await startCamera();
});

$("#openFileBtn").addEventListener("click", () => fileInput.click());
$("#openFileCameraBtn").addEventListener("click", () => fileInputCamera.click());
fileInput.addEventListener("change", handleFileSelection);
fileInputCamera.addEventListener("change", handleFileSelection);

$("#closeCameraBtn").addEventListener("click", () => {
  if (state.recording) {
    toast("Terminez l’enregistrement avant de quitter.");
    return;
  }
  stopCamera();
  go("home");
});

$("#resultHomeBtn").addEventListener("click", resetAndRestart);
$("#restartBtn").addEventListener("click", resetAndRestart);

async function handleFileSelection(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;

  if (!looksLikeVideo(file)) {
    input.value = "";
    toast("Choisissez un fichier vidéo.");
    return;
  }

  if (file.size > 1024 * 1024 * 1024) {
    input.value = "";
    toast("Pour cette V4.2, la taille maximale est de 1 Go.");
    return;
  }

  stopCamera();
  setSource(file, file.name, file.type || mimeFromFilename(file.name));
  input.value = "";
  await createMemory();
}

function looksLikeVideo(file) {
  return (
    !file.type ||
    file.type.startsWith("video/") ||
    /\.(mp4|mov|m4v|webm|3gp|mkv)$/i.test(file.name || "")
  );
}

function setSource(blob, name, mimeType = "") {
  state.sourceBlob = blob;
  state.sourceName = name || "video-kiz-memory";
  state.sourceMime = mimeType || blob.type || "";
  state.sourcePath = "";
  state.proxyPath = "";
  state.audioPath = "";
  state.resultBlob = null;
  state.analysisMode = "";
  state.segments = [];
}

async function startCamera() {
  stopCamera();
  cameraMessage.classList.remove("hidden");
  cameraMessage.innerHTML = "<strong>Caméra en préparation…</strong><small>Autorisez l’accès si votre téléphone le demande.</small>";

  if (!navigator.mediaDevices?.getUserMedia) {
    showCameraUnavailable("La caméra web n’est pas disponible ici.");
    return;
  }

  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 1080 },
        height: { ideal: 1920 }
      },
      audio: true
    });
    cameraVideo.srcObject = state.cameraStream;
    await cameraVideo.play().catch(() => {});
    cameraMessage.classList.add("hidden");
  } catch (error) {
    console.warn("Camera unavailable", error);
    showCameraUnavailable("Impossible d’ouvrir la caméra.");
  }
}

function showCameraUnavailable(message) {
  cameraMessage.classList.remove("hidden");
  cameraMessage.innerHTML = `<strong>${escapeHtml(message)}</strong><small>Utilisez le bouton 🎞️ pour choisir une vidéo sur votre téléphone.</small>`;
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop());
  }
  state.cameraStream = null;
  cameraVideo.srcObject = null;
}

$("#switchCamBtn").addEventListener("click", async () => {
  if (state.recording) {
    toast("Terminez l’enregistrement avant de changer de caméra.");
    return;
  }
  state.facingMode = state.facingMode === "environment" ? "user" : "environment";
  await startCamera();
});

recordBtn.addEventListener("click", async () => {
  if (state.recording) {
    stopRecording();
    return;
  }

  if (!state.cameraStream) await startCamera();
  if (!state.cameraStream) return;
  startRecording();
});

function startRecording() {
  if (!window.MediaRecorder) {
    toast("L’enregistrement n’est pas pris en charge ici. Choisissez une vidéo existante.");
    return;
  }

  state.recordedChunks = [];
  const options = pickRecorderOptions();

  try {
    state.recorder = Object.keys(options).length
      ? new MediaRecorder(state.cameraStream, options)
      : new MediaRecorder(state.cameraStream);
  } catch (error) {
    console.warn("Recorder setup failed", error);
    toast("Impossible de démarrer l’enregistrement sur ce navigateur.");
    return;
  }

  state.recorder.addEventListener("dataavailable", (event) => {
    if (event.data?.size) state.recordedChunks.push(event.data);
  });

  state.recorder.addEventListener("stop", async () => {
    const mimeType = state.recorder?.mimeType || state.recordedChunks[0]?.type || "video/webm";
    const blob = new Blob(state.recordedChunks, { type: mimeType });
    const extension = extensionFromMime(mimeType);

    state.recording = false;
    document.body.classList.remove("recording");
    recordLabel.textContent = "FILMER";
    recordBtn.setAttribute("aria-label", "Commencer à filmer");
    stopRecTimer();
    stopCamera();

    if (!blob.size) {
      toast("La vidéo enregistrée est vide. Recommencez.");
      go("home");
      return;
    }

    setSource(blob, `kiz-memory-capture.${extension}`, mimeType);
    await createMemory();
  }, { once: true });

  state.recorder.start(500);
  state.recording = true;
  document.body.classList.add("recording");
  recordLabel.textContent = "TERMINER";
  recordBtn.setAttribute("aria-label", "Terminer l’enregistrement");
  $("#cameraHelp").textContent = "Quand vous avez fini, appuyez sur TERMINER.";
  startRecTimer();
}

function stopRecording() {
  if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
}

function pickRecorderOptions() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  for (const mimeType of candidates) {
    if (MediaRecorder.isTypeSupported?.(mimeType)) return { mimeType };
  }
  return {};
}

function startRecTimer() {
  stopRecTimer();
  state.recSeconds = 0;
  recTime.textContent = "00:00";
  state.recTimer = window.setInterval(() => {
    state.recSeconds += 1;
    recTime.textContent = formatTime(state.recSeconds);
  }, 1000);
}

function stopRecTimer() {
  if (state.recTimer) window.clearInterval(state.recTimer);
  state.recTimer = null;
  recTime.textContent = "00:00";
}

async function createMemory() {
  if (!state.sourceBlob || state.processing) return;
  state.processing = true;
  go("processing");
  resetProcessingUi();
  setStep("stepReceived", true, "✓");

  const cleanupOnFailure = new Set();

  try {
    $("#processingText").textContent = "Préparation du transfert privé.";
    const ticket = await requestUploadUrl();
    state.sourcePath = ticket.pathname;
    cleanupOnFailure.add(ticket.pathname);

    $("#uploadProgressWrap").hidden = false;
    $("#processingText").textContent = "Transfert privé de votre vidéo…";
    const uploaded = await uploadWithProgress(state.sourceBlob, ticket.presignedUrl, (percent) => {
      const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
      $("#uploadProgressBar").style.width = `${safePercent}%`;
      $("#uploadProgressText").textContent = `${safePercent} %`;
    });
    if (uploaded?.pathname && isSafeBlobPath(uploaded.pathname)) {
      cleanupOnFailure.delete(state.sourcePath);
      state.sourcePath = uploaded.pathname;
      cleanupOnFailure.add(state.sourcePath);
    }

    setStep("stepUploaded", true, "✓");
    $("#uploadProgressWrap").hidden = true;
    state.sourceBlob = null;

    $("#processingText").textContent = "Création d’une copie légère pour l’analyse…";
    const prepared = await requestPreparation();
    if (prepared.sourcePath && isSafeBlobPath(prepared.sourcePath)) {
      cleanupOnFailure.delete(state.sourcePath);
      state.sourcePath = prepared.sourcePath;
      cleanupOnFailure.add(state.sourcePath);
    }
    state.proxyPath = prepared.proxyPath;
    state.audioPath = prepared.audioPath;
    cleanupOnFailure.add(prepared.proxyPath);
    cleanupOnFailure.add(prepared.audioPath);
    setStep("stepPrepared", true, "✓");

    $("#processingText").textContent = "Analyse du mouvement, des corps et de la musique…";
    const analysis = await analyzePreparedVideo(prepared);
    state.analysisMode = analysis.mode;
    state.segments = analysis.segments;
    setStep("stepAnalyzed", true, "✓");

    $("#processingText").textContent = `Découpe automatique de ${analysis.segments.length} passages et assemblage…`;
    const rendered = await requestRender(analysis);
    setStep("stepRendered", true, "✓");

    state.resultUrl = rendered.resultUrl;
    state.resultPath = rendered.resultPath;
    state.resultName = rendered.filename || buildResultFilename(state.sourceName);
    state.sourcePath = "";
    state.proxyPath = "";
    state.audioPath = "";
    cleanupOnFailure.clear();

    $("#processingText").textContent = "Memory prête.";
    setStep("stepReady", true, "✓");
    await nextPaint();
    showServerResult(rendered, analysis);
  } catch (error) {
    console.error(`Kiz Memory V${APP_VERSION} processing failed`, error);
    for (const path of cleanupOnFailure) await cleanupPath(path);
    releaseAnalysisObjectUrls();
    go("home");
    toast(friendlyProcessingError(error), 6200);
  } finally {
    state.processing = false;
  }
}

function resetProcessingUi() {
  const steps = ["stepReceived", "stepUploaded", "stepPrepared", "stepAnalyzed", "stepRendered", "stepReady"];
  steps.forEach((id, index) => setStep(id, false, String(index + 1)));
  $("#uploadProgressWrap").hidden = true;
  $("#uploadProgressBar").style.width = "0%";
  $("#uploadProgressText").textContent = "0 %";
  $("#analysisProgressWrap").hidden = true;
  $("#analysisProgressBar").style.width = "0%";
  $("#analysisProgressText").textContent = "0 / 0 images analysées";
}

function setStep(id, done, marker) {
  const item = $(`#${id}`);
  if (!item) return;
  item.classList.toggle("done", done);
  const span = item.querySelector("span");
  if (span) span.textContent = marker;
}

function isSafeBlobPath(path) {
  return typeof path === "string" && path.startsWith("kiz-memory/") && /^[a-zA-Z0-9_./-]+$/.test(path) && path.length < 300;
}

async function requestUploadUrl() {
  const response = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: state.sourceName,
      contentType: state.sourceMime || "video/mp4",
      size: state.sourceBlob?.size || 0
    })
  });
  const data = await readJsonSafely(response);
  if (!response.ok) throw new Error(data?.error || "Impossible de préparer le stockage privé.");
  if (!data?.presignedUrl || !data?.pathname) throw new Error("Configuration du stockage incomplète.");
  return data;
}

function uploadWithProgress(blob, url, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.timeout = 30 * 60 * 1000;
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) onProgress((event.loaded / event.total) * 100);
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        let metadata = null;
        try {
          metadata = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          metadata = null;
        }
        resolve(metadata);
      } else reject(new Error(`Échec du transfert privé (${xhr.status}).`));
    });
    xhr.addEventListener("error", () => reject(new Error("Le transfert privé a échoué.")));
    xhr.addEventListener("timeout", () => reject(new Error("Le transfert a pris trop de temps.")));
    xhr.addEventListener("abort", () => reject(new Error("Le transfert a été interrompu.")));
    xhr.send(blob);
  });
}

async function requestPreparation() {
  const response = await fetch("/api/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourcePath: state.sourcePath, sourceName: state.sourceName })
  });
  const data = await readJsonSafely(response);
  if (!response.ok) throw new Error(data?.error || "Impossible de préparer l’analyse vidéo.");
  if (!data?.proxyUrl || !data?.audioUrl || !data?.proxyPath || !data?.audioPath) {
    throw new Error("Le moteur n’a pas renvoyé les fichiers d’analyse.");
  }
  return data;
}

async function analyzePreparedVideo(prepared) {
  releaseAnalysisObjectUrls();
  const [proxyResponse, audioResponse] = await Promise.all([
    fetch(prepared.proxyUrl, { cache: "no-store" }),
    fetch(prepared.audioUrl, { cache: "no-store" })
  ]);
  if (!proxyResponse.ok) throw new Error("La copie vidéo d’analyse n’a pas pu être récupérée.");
  if (!audioResponse.ok) throw new Error("La piste audio d’analyse n’a pas pu être récupérée.");

  const proxyBlob = await proxyResponse.blob();
  const audioBlob = await audioResponse.blob();
  const proxyObjectUrl = URL.createObjectURL(proxyBlob);
  state.analysisObjectUrls.push(proxyObjectUrl);

  analysisVideo.src = proxyObjectUrl;
  analysisVideo.load();
  await waitForMetadata(analysisVideo, 20000);

  const duration = finiteDuration(analysisVideo.duration, prepared.duration);
  if (!Number.isFinite(duration) || duration < 2) throw new Error("La durée de la vidéo d’analyse est invalide.");

  const audioTimeline = await analyzeAudioBlob(audioBlob, duration).catch((error) => {
    console.warn("Audio analysis unavailable", error);
    return [];
  });

  const poseEngine = await createPoseEngine().catch((error) => {
    console.warn("MediaPipe pose unavailable; measurable fallback enabled", error);
    return null;
  });

  const sampleStep = chooseSampleStep(duration);
  const sampleTimes = [];
  for (let t = Math.min(1, duration / 4); t <= Math.max(0, duration - 0.6); t += sampleStep) {
    sampleTimes.push(Number(t.toFixed(3)));
  }
  if (sampleTimes.length < 4) {
    sampleTimes.length = 0;
    for (let i = 0; i < 4; i++) sampleTimes.push((duration * (i + 1)) / 5);
  }

  $("#analysisProgressWrap").hidden = false;
  $("#analysisProgressText").textContent = `0 / ${sampleTimes.length} images analysées`;

  const ctx = analysisCanvas.getContext("2d", { willReadFrequently: true });
  const samples = [];
  let previousPixels = null;
  let previousPoses = [];

  try {
    for (let index = 0; index < sampleTimes.length; index++) {
      const t = sampleTimes[index];
      await seekVideo(analysisVideo, t);

      let frameDiff = 0;
      try {
        ctx.drawImage(analysisVideo, 0, 0, analysisCanvas.width, analysisCanvas.height);
        const imageData = ctx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data;
        const gray = grayscaleSample(imageData);
        if (previousPixels) frameDiff = meanAbsDiff(gray, previousPixels);
        previousPixels = gray;
      } catch (error) {
        console.warn("Frame difference unavailable", error);
      }

      let poseMetrics = emptyPoseMetrics();
      if (poseEngine) {
        try {
          const result = poseEngine.detectForVideo(analysisVideo, Math.round(t * 1000));
          poseMetrics = measurePoses(result?.landmarks || [], previousPoses);
          previousPoses = poseMetrics.poseSnapshots;
        } catch (error) {
          console.warn("Pose inference failed on frame", error);
        }
      }

      samples.push({
        t,
        frameDiff,
        poseMotion: poseMetrics.motion,
        rotation: poseMetrics.rotation,
        framing: poseMetrics.framing,
        posePresence: poseMetrics.presence,
        audio: audioAt(audioTimeline, t)
      });

      const done = index + 1;
      const percent = Math.round((done / sampleTimes.length) * 100);
      $("#analysisProgressBar").style.width = `${percent}%`;
      $("#analysisProgressText").textContent = `${done} / ${sampleTimes.length} images analysées`;
      if (index % 4 === 0) await nextPaint();
    }
  } finally {
    poseEngine?.close?.();
    analysisVideo.pause();
    analysisVideo.removeAttribute("src");
    analysisVideo.load();
  }

  const aiFrames = samples.filter((sample) => sample.posePresence > 0).length;
  const aiCoverage = samples.length ? aiFrames / samples.length : 0;
  const mode = poseEngine && aiCoverage >= 0.2 ? "pose+motion+audio" : "motion+audio";
  const scored = scoreSamples(samples, mode);
  const segments = selectSegments(scored, duration);
  if (segments.length < 1) throw new Error("Aucun passage exploitable n’a pu être sélectionné.");

  $("#analysisProgressWrap").hidden = true;
  return {
    mode,
    aiCoverage,
    sampleCount: samples.length,
    duration,
    segments
  };
}

async function createPoseEngine() {
  const module = await import(MEDIAPIPE_MODULE_URL);
  const { FilesetResolver, PoseLandmarker } = module;
  if (!FilesetResolver || !PoseLandmarker) throw new Error("Module MediaPipe incomplet.");
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: POSE_MODEL_URL },
    runningMode: "VIDEO",
    numPoses: 2,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false
  });
}

function chooseSampleStep(duration) {
  if (duration <= 45) return 0.75;
  if (duration <= 150) return 1.0;
  if (duration <= 300) return 1.5;
  return 2.0;
}

function emptyPoseMetrics() {
  return { motion: 0, rotation: 0, framing: 0, presence: 0, poseSnapshots: [] };
}

function measurePoses(landmarkSets, previousPoses) {
  const poses = (landmarkSets || []).slice(0, 2).map((landmarks) => summarizePose(landmarks)).filter(Boolean);
  if (!poses.length) return emptyPoseMetrics();

  const matches = matchPoses(poses, previousPoses || []);
  const motions = [];
  const rotations = [];
  for (const { current, previous } of matches) {
    if (!previous) continue;
    motions.push(poseDisplacement(current, previous));
    rotations.push(angleDifference(current.torsoAngle, previous.torsoAngle) / Math.PI);
  }

  const framing = poses.reduce((sum, pose) => sum + pose.framing, 0) / poses.length;
  const presence = Math.min(1, poses.length === 1 ? 0.68 : 1);
  return {
    motion: motions.length ? average(motions) : 0,
    rotation: rotations.length ? average(rotations) : 0,
    framing,
    presence,
    poseSnapshots: poses
  };
}

function summarizePose(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 29) return null;
  const important = [11, 12, 15, 16, 23, 24, 25, 26, 27, 28];
  const points = important
    .map((index) => ({ index, ...landmarks[index] }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && (point.visibility ?? 1) >= 0.35);
  if (points.length < 4) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const centroid = { x: average(xs), y: average(ys) };
  const width = Math.max(0.04, maxX - minX);
  const height = Math.max(0.08, maxY - minY);
  const scale = Math.max(0.08, Math.hypot(width, height));
  const margin = Math.min(minX, 1 - maxX, minY, 1 - maxY);
  const inFrame = clamp01((margin + 0.03) / 0.12);
  const usefulSize = clamp01((width * height) / 0.22);
  const visibility = average(points.map((point) => clamp01(point.visibility ?? 1)));
  const framing = clamp01(0.5 * inFrame + 0.28 * usefulSize + 0.22 * visibility);

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const torsoAngle = leftShoulder && rightShoulder
    ? Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x)
    : 0;

  const keyed = new Map(points.map((point) => [point.index, point]));
  return { centroid, scale, torsoAngle, framing, keyed };
}

function matchPoses(current, previous) {
  const unused = new Set(previous.map((_, index) => index));
  return current.map((pose) => {
    let bestIndex = -1;
    let bestDistance = Infinity;
    for (const index of unused) {
      const candidate = previous[index];
      const distance = Math.hypot(pose.centroid.x - candidate.centroid.x, pose.centroid.y - candidate.centroid.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0) unused.delete(bestIndex);
    return { current: pose, previous: bestIndex >= 0 ? previous[bestIndex] : null };
  });
}

function poseDisplacement(current, previous) {
  const distances = [];
  for (const [index, point] of current.keyed) {
    const oldPoint = previous.keyed.get(index);
    if (!oldPoint) continue;
    distances.push(Math.hypot(point.x - oldPoint.x, point.y - oldPoint.y) / Math.max(0.08, current.scale));
  }
  return distances.length ? average(distances) : 0;
}

function angleDifference(a, b) {
  let diff = Math.abs(a - b) % (Math.PI * 2);
  if (diff > Math.PI) diff = Math.PI * 2 - diff;
  return diff;
}

function grayscaleSample(rgba) {
  const gray = new Float32Array(rgba.length / 4);
  for (let i = 0, g = 0; i < rgba.length; i += 4, g++) {
    gray[g] = (rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722) / 255;
  }
  return gray;
}

function meanAbsDiff(current, previous) {
  const length = Math.min(current.length, previous.length);
  if (!length) return 0;
  let sum = 0;
  for (let i = 0; i < length; i++) sum += Math.abs(current[i] - previous[i]);
  return sum / length;
}

async function analyzeAudioBlob(blob, duration) {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return [];
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    const channel = decoded.getChannelData(0);
    const sampleRate = decoded.sampleRate;
    const windowSeconds = 0.5;
    const windowSize = Math.max(256, Math.floor(sampleRate * windowSeconds));
    const timeline = [];
    let previousRms = 0;

    for (let start = 0; start < channel.length; start += windowSize) {
      const end = Math.min(channel.length, start + windowSize);
      let sumSq = 0;
      for (let i = start; i < end; i++) sumSq += channel[i] * channel[i];
      const rms = Math.sqrt(sumSq / Math.max(1, end - start));
      const onset = Math.max(0, rms - previousRms);
      previousRms = rms;
      timeline.push({ t: start / sampleRate, rms, onset });
    }

    const rmsNorm = robustNormalize(timeline.map((item) => item.rms));
    const onsetNorm = robustNormalize(timeline.map((item) => item.onset));
    return timeline.map((item, index) => ({
      t: item.t,
      value: clamp01(0.72 * rmsNorm[index] + 0.28 * onsetNorm[index])
    })).filter((item) => item.t <= duration + 1);
  } finally {
    context.close?.().catch?.(() => {});
  }
}

function audioAt(timeline, time) {
  if (!timeline?.length) return 0;
  const approxIndex = Math.max(0, Math.min(timeline.length - 1, Math.round(time / 0.5)));
  let best = timeline[approxIndex];
  let bestDistance = Math.abs(best.t - time);
  for (let offset = -2; offset <= 2; offset++) {
    const candidate = timeline[approxIndex + offset];
    if (!candidate) continue;
    const distance = Math.abs(candidate.t - time);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best?.value || 0;
}

function scoreSamples(samples, mode) {
  if (!samples.length) return [];
  const frameDiff = robustNormalize(samples.map((s) => s.frameDiff));
  const poseMotion = robustNormalize(samples.map((s) => s.poseMotion));
  const rotation = robustNormalize(samples.map((s) => s.rotation));
  const framing = samples.map((s) => clamp01(s.framing));
  const presence = samples.map((s) => clamp01(s.posePresence));
  const audio = samples.map((s) => clamp01(s.audio));

  const rawMotion = samples.map((_, index) => Math.max(frameDiff[index], poseMotion[index]));
  const variation = rawMotion.map((value, index) => index ? Math.abs(value - rawMotion[index - 1]) : 0);
  const variationNorm = robustNormalize(variation);

  const scored = samples.map((sample, index) => {
    let score;
    if (mode === "pose+motion+audio") {
      const bodyQuality = clamp01(0.55 * framing[index] + 0.45 * presence[index]);
      score =
        0.30 * rawMotion[index] +
        0.17 * rotation[index] +
        0.20 * audio[index] +
        0.23 * bodyQuality +
        0.10 * variationNorm[index];
    } else {
      score =
        0.52 * frameDiff[index] +
        0.30 * audio[index] +
        0.18 * variationNorm[index];
    }
    return { ...sample, score: clamp01(score) };
  });

  return scored.map((sample, index) => {
    const neighbors = scored.slice(Math.max(0, index - 1), Math.min(scored.length, index + 2));
    return { ...sample, smoothScore: average(neighbors.map((item) => item.score)) };
  });
}

function selectSegments(samples, duration) {
  const plan = memoryPlan(duration);
  if (!samples.length) return deterministicFallbackSegments(duration, plan.count, plan.clipDuration);

  const candidates = samples
    .filter((sample) => sample.t >= 2 && sample.t <= duration - 2)
    .map((sample) => ({ ...sample, center: snapToAudioPeak(sample.t, samples) }))
    .sort((a, b) => b.smoothScore - a.smoothScore || a.t - b.t);

  const selected = [];
  const minCenterDistance = plan.clipDuration + 2.0;
  for (const candidate of candidates) {
    if (selected.length >= plan.count) break;
    if (selected.every((item) => Math.abs(item.center - candidate.center) >= minCenterDistance)) {
      selected.push(candidate);
    }
  }

  if (selected.length < plan.count) {
    for (const candidate of candidates) {
      if (selected.length >= plan.count) break;
      if (selected.some((item) => Math.abs(item.center - candidate.center) < plan.clipDuration * 0.72)) continue;
      selected.push(candidate);
    }
  }

  if (!selected.length) return deterministicFallbackSegments(duration, plan.count, plan.clipDuration);

  const segments = selected.map((candidate) => {
    let start = candidate.center - plan.clipDuration / 2;
    start = Math.max(0, Math.min(start, Math.max(0, duration - plan.clipDuration)));
    const end = Math.min(duration, start + plan.clipDuration);
    return { start: round3(start), end: round3(end) };
  }).sort((a, b) => a.start - b.start);

  return mergeOverlappingSegments(segments, 0.25).slice(0, plan.count);
}

function memoryPlan(duration) {
  if (duration <= 25) return { count: 2, clipDuration: Math.max(4, Math.min(6, duration / 3)) };
  if (duration <= 60) return { count: 3, clipDuration: 6 };
  if (duration <= 135) return { count: 5, clipDuration: 6.5 };
  if (duration <= 240) return { count: 6, clipDuration: 6.5 };
  return { count: 6, clipDuration: 7 };
}

function snapToAudioPeak(center, samples) {
  const nearby = samples.filter((sample) => Math.abs(sample.t - center) <= 1.5);
  if (!nearby.length) return center;
  nearby.sort((a, b) => b.audio - a.audio || Math.abs(a.t - center) - Math.abs(b.t - center));
  const best = nearby[0];
  return best.audio >= 0.55 ? best.t : center;
}

function deterministicFallbackSegments(duration, count, clipDuration) {
  const safeCount = Math.max(1, Math.min(count, Math.floor(duration / Math.max(2, clipDuration)) || 1));
  const segments = [];
  for (let i = 0; i < safeCount; i++) {
    const center = (duration * (i + 1)) / (safeCount + 1);
    const start = Math.max(0, Math.min(center - clipDuration / 2, Math.max(0, duration - clipDuration)));
    segments.push({ start: round3(start), end: round3(Math.min(duration, start + clipDuration)) });
  }
  return segments;
}

function mergeOverlappingSegments(segments, tolerance = 0) {
  const merged = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (previous && segment.start <= previous.end + tolerance) {
      previous.end = Math.max(previous.end, segment.end);
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

async function requestRender(analysis) {
  const response = await fetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourcePath: state.sourcePath,
      sourceName: state.sourceName,
      proxyPath: state.proxyPath,
      audioPath: state.audioPath,
      analysisMode: analysis.mode,
      segments: analysis.segments
    })
  });
  const data = await readJsonSafely(response);
  if (!response.ok) throw new Error(data?.error || "La Memory n’a pas pu être assemblée.");
  if (!data?.resultUrl || !data?.resultPath) throw new Error("Le serveur n’a pas renvoyé la Memory finale.");
  releaseAnalysisObjectUrls();
  return data;
}

function showServerResult(rendered, analysis) {
  go("result");
  resultVideo.pause();
  resultVideo.removeAttribute("src");
  resultVideo.src = state.resultUrl;
  resultVideo.load();

  const parts = ["MP4", "H.264", "AAC", "1080 × 1920"];
  if (rendered.outputBytes) parts.push(formatFileSize(rendered.outputBytes));
  $("#videoInfo").textContent = parts.join(" · ");
  $("#previewStatus").className = "preview-status ok";
  $("#previewStatus").textContent = "Memory découpée automatiquement et prête à être lue.";

  const modeLabel = analysis.mode === "pose+motion+audio"
    ? "IA de pose + mouvement + musique"
    : "mouvement + musique";
  const seconds = analysis.segments.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
  $("#selectionSummary").textContent = `${analysis.segments.length} passages · ${Math.round(seconds)} s · ${modeLabel}`;

  resultVideo.addEventListener("error", () => {
    const code = resultVideo.error?.code || 0;
    $("#previewStatus").className = "preview-status warn";
    $("#previewStatus").textContent = `La Memory existe, mais ce lecteur n’a pas démarré${code ? ` (code ${code})` : ""}. ENREGISTRER reste disponible.`;
  }, { once: true });
}

$("#watchBtn").addEventListener("click", async () => {
  if (!state.resultUrl) return;
  try { resultVideo.currentTime = 0; } catch {}
  await resultVideo.play().catch(() => toast("Touchez directement la vidéo pour lancer la lecture."));
});

$("#saveBtn").addEventListener("click", async () => {
  if (!state.resultUrl) return;
  try {
    toast("Préparation du fichier MP4…", 2200);
    const blob = await getResultBlob();
    downloadBlob(blob, state.resultName || "kiz-memory.mp4");
  } catch (error) {
    console.warn("Save failed", error);
    toast("Impossible d’enregistrer la vidéo pour le moment.");
  }
});

$("#shareBtn").addEventListener("click", shareVideo);

async function shareVideo() {
  if (!state.resultUrl) return;
  try {
    toast("Préparation du partage…", 2200);
    const blob = await getResultBlob();
    const file = new File([blob], state.resultName || "kiz-memory.mp4", { type: "video/mp4" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: "Kiz Memory", files: [file] });
      return;
    }
    toast("Le partage direct n’est pas disponible ici. Utilisez ENREGISTRER puis partagez depuis votre galerie.", 5200);
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.warn("Share failed", error);
      toast("Le partage n’a pas pu être ouvert. Vous pouvez enregistrer la vidéo.");
    }
  }
}

async function getResultBlob() {
  if (state.resultBlob) return state.resultBlob;
  const response = await fetch(state.resultUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status}).`);
  state.resultBlob = await response.blob();
  return state.resultBlob;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}

async function resetAndRestart() {
  if (state.recording) stopRecording();
  stopRecTimer();
  stopCamera();
  releaseAnalysisObjectUrls();

  resultVideo.pause();
  resultVideo.removeAttribute("src");
  resultVideo.load();

  const paths = [state.resultPath, state.sourcePath, state.proxyPath, state.audioPath].filter(Boolean);
  for (const path of paths) cleanupPath(path).catch(() => {});

  Object.assign(state, {
    sourceBlob: null,
    sourceName: "video-kiz-memory",
    sourceMime: "",
    sourcePath: "",
    proxyPath: "",
    audioPath: "",
    resultUrl: "",
    resultPath: "",
    resultBlob: null,
    resultName: "kiz-memory.mp4",
    recordedChunks: [],
    recorder: null,
    recording: false,
    processing: false,
    analysisMode: "",
    segments: []
  });

  document.body.classList.remove("recording");
  recordLabel.textContent = "FILMER";
  $("#cameraHelp").textContent = "Cadrez les danseurs puis appuyez sur FILMER.";
  $("#selectionSummary").textContent = "";
  go("home");
}

function releaseAnalysisObjectUrls() {
  analysisVideo.pause();
  analysisVideo.removeAttribute("src");
  analysisVideo.load();
  for (const url of state.analysisObjectUrls) URL.revokeObjectURL(url);
  state.analysisObjectUrls = [];
}

async function cleanupPath(path) {
  if (!path) return;
  try {
    await fetch("/api/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
      keepalive: true
    });
  } catch (error) {
    console.warn("Temporary cleanup failed", error);
  }
}

function waitForMetadata(video, timeoutMs = 15000) {
  if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error("La copie d’analyse met trop de temps à s’ouvrir.")), timeoutMs);
    const onReady = () => finish();
    const onError = () => finish(new Error(`La copie d’analyse ne peut pas être lue (code ${video.error?.code || 0}).`));
    function finish(error) {
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
      error ? reject(error) : resolve();
    }
    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function seekVideo(video, time, timeoutMs = 8000) {
  const safe = Math.max(0, Math.min(time, Math.max(0, (video.duration || time) - 0.05)));
  if (Math.abs(video.currentTime - safe) < 0.02 && video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error("Recherche d’image trop longue.")), timeoutMs);
    const onSeeked = () => finish();
    const onError = () => finish(new Error("Erreur pendant la lecture de la copie d’analyse."));
    function finish(error) {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      error ? reject(error) : resolve();
    }
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    try { video.currentTime = safe; } catch (error) { finish(error); }
  });
}

function finiteDuration(primary, fallback) {
  const first = Number(primary);
  if (Number.isFinite(first) && first > 0) return first;
  const second = Number(fallback);
  return Number.isFinite(second) && second > 0 ? second : NaN;
}

function robustNormalize(values) {
  if (!values.length) return [];
  const sorted = [...values].map((value) => Number.isFinite(value) ? value : 0).sort((a, b) => a - b);
  const low = percentile(sorted, 0.1);
  const high = percentile(sorted, 0.9);
  const span = high - low;
  if (span < 1e-9) return values.map(() => 0.5);
  return values.map((value) => clamp01(((Number(value) || 0) - low) / span));
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + (Number(value) || 0), 0) / values.length;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function mimeFromFilename(name = "") {
  const lower = String(name).toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".3gp")) return "video/3gpp";
  if (lower.endsWith(".mkv")) return "video/x-matroska";
  return "video/mp4";
}

function extensionFromMime(mimeType = "") {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("quicktime")) return "mov";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("3gpp")) return "3gp";
  if (normalized.includes("matroska")) return "mkv";
  return "mp4";
}

function buildResultFilename(originalName = "") {
  const base = String(originalName || "kiz-memory")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "kiz-memory";
  return `${base}-memory.mp4`;
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} Ko`;
  return `${(size / (1024 * 1024)).toFixed(size >= 100 * 1024 * 1024 ? 0 : 1)} Mo`;
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const secs = String(safe % 60).padStart(2, "0");
  return `${minutes}:${secs}`;
}

async function readJsonSafely(response) {
  try { return await response.json(); } catch { return null; }
}

function friendlyProcessingError(error) {
  const raw = String(error?.message || error || "");
  if (/BLOB|stockage|token|presign/i.test(raw)) return "Le stockage vidéo privé n’est pas configuré sur Vercel. Consultez SETUP-VERCEL.md.";
  if (/sandbox|snapshot|ffmpeg/i.test(raw)) return "Le moteur vidéo serveur n’a pas pu démarrer. Vérifiez la configuration Vercel Sandbox.";
  if (/timeout|temps|504/i.test(raw)) return "Le traitement a dépassé le temps disponible. Testez d’abord avec une vidéo plus courte.";
  if (/analyse|MediaPipe|copie/i.test(raw)) return raw;
  return raw || "La création de la Memory a échoué.";
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

let toastTimer = null;
function toast(message, duration = 3600) {
  window.clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add("show");
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), duration);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
