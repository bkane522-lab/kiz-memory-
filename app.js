const state = {
  sourceBlob: null,
  sourceUrl: null,
  sourceName: "video-kiz-memory",
  sourceMime: "",
  duration: 0,
  width: 0,
  height: 0,
  cameraStream: null,
  recorder: null,
  recordedChunks: [],
  recording: false,
  recSeconds: 0,
  recTimer: null,
  facingMode: "environment"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const pages = $$(".page");

const fileInput = $("#fileInput");
const fileInputCamera = $("#fileInputCamera");
const cameraVideo = $("#cameraVideo");
const cameraFrame = $("#cameraFrame");
const cameraMessage = $("#cameraMessage");
const recordBtn = $("#recordBtn");
const recordLabel = $("#recordLabel");
const recTime = $("#recTime");
const resultVideo = $("#resultVideo");
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

  // V4.0.3 : garder le File vivant jusqu’à la création de l’URL locale.
  if (file.type && !file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|3gp|mkv)$/i.test(file.name || "")) {
    input.value = "";
    toast("Choisissez un fichier vidéo.");
    return;
  }

  stopCamera();
  setSource(file, file.name, file.type || mimeFromFilename(file.name));
  input.value = "";
  await prepareSource();
}

function setSource(blob, name, mimeType = "") {
  clearSourceUrl();
  state.sourceBlob = blob;
  state.sourceUrl = URL.createObjectURL(blob);
  state.sourceName = name || "video-kiz-memory";
  state.sourceMime = mimeType || blob.type || "";
  state.duration = 0;
  state.width = 0;
  state.height = 0;
}

function clearSourceUrl() {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceUrl = null;
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
    await prepareSource();
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
  if (state.recorder && state.recorder.state !== "inactive") {
    state.recorder.stop();
  }
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

async function prepareSource() {
  if (!state.sourceUrl || !state.sourceBlob) return;

  go("processing");
  setStep("stepReceived", true, "✓");
  setStep("stepChecked", false, "2");
  setStep("stepReady", false, "3");
  $("#processingText").textContent = "Réception de la vidéo.";

  if (!state.sourceBlob.size) {
    resetAndRestart();
    toast("Le fichier sélectionné est vide.");
    return;
  }

  const looksLikeVideo =
    !state.sourceMime ||
    state.sourceMime.startsWith("video/") ||
    /\.(mp4|mov|m4v|webm|3gp|mkv)$/i.test(state.sourceName || "");

  if (!looksLikeVideo) {
    resetAndRestart();
    toast("Choisissez un fichier vidéo.");
    return;
  }

  setStep("stepChecked", true, "✓");
  $("#processingText").textContent = "Fichier accepté.";
  await nextPaint();

  // Rendre le lecteur visible AVANT de lui affecter le Blob mobile.
  go("result");
  await nextPaint();
  loadResultPreview();
  setStep("stepReady", true, "✓");
}

function setStep(id, done, marker) {
  const item = $(`#${id}`);
  item.classList.toggle("done", done);
  const span = item.querySelector("span");
  span.textContent = marker;
}

function loadResultPreview() {
  const status = $("#previewStatus");
  status.className = "preview-status";
  status.textContent = "Chargement de l’aperçu…";

  resultVideo.pause();
  resultVideo.removeAttribute("src");

  const baseInfo = [];
  if (state.sourceMime) baseInfo.push(state.sourceMime.replace("video/", "").toUpperCase());
  baseInfo.push(formatFileSize(state.sourceBlob?.size || 0));
  $("#videoInfo").textContent = baseInfo.filter(Boolean).join(" · ");

  const onMetadata = () => {
    const duration = Number(resultVideo.duration);
    state.duration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    state.width = resultVideo.videoWidth || 0;
    state.height = resultVideo.videoHeight || 0;

    const parts = [];
    if (state.duration) parts.push(formatTime(state.duration));
    if (state.width && state.height) parts.push(`${state.width} × ${state.height}`);
    if (state.sourceMime) parts.push(state.sourceMime.replace("video/", "").toUpperCase());
    parts.push(formatFileSize(state.sourceBlob?.size || 0));
    $("#videoInfo").textContent = parts.filter(Boolean).join(" · ");
  };

  const onCanPlay = () => {
    status.className = "preview-status ok";
    status.textContent = "Vidéo prête à être lue sur ce téléphone.";
  };

  const onError = () => {
    const code = resultVideo.error?.code || 0;
    status.className = "preview-status warn";
    status.textContent = `Vidéo importée, mais l’aperçu local a échoué${code ? ` (code navigateur ${code})` : ""}. Le fichier n’est pas rejeté.`;
    console.warn("Kiz Memory preview error", {
      mediaCode: code,
      name: state.sourceName,
      type: state.sourceMime,
      size: state.sourceBlob?.size || 0
    });
  };

  resultVideo.addEventListener("loadedmetadata", onMetadata, { once: true });
  resultVideo.addEventListener("canplay", onCanPlay, { once: true });
  resultVideo.addEventListener("error", onError, { once: true });

  resultVideo.src = state.sourceUrl;
  resultVideo.load();

  // Un aperçu lent ne doit jamais annuler l’import.
  window.setTimeout(() => {
    if (!state.duration && status.textContent === "Chargement de l’aperçu…") {
      status.className = "preview-status warn";
      status.textContent = "La vidéo est importée. L’aperçu met du temps à démarrer sur ce navigateur.";
    }
  }, 8000);
}

function mimeFromFilename(name = "") {
  const lower = String(name).toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".3gp")) return "video/3gpp";
  return "";
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} Ko`;
  return `${(size / (1024 * 1024)).toFixed(size >= 100 * 1024 * 1024 ? 0 : 1)} Mo`;
}

$("#watchBtn").addEventListener("click", async () => {
  if (!state.sourceUrl) return;
  resultVideo.currentTime = 0;
  await resultVideo.play().catch(() => {
    toast("Touchez directement la vidéo pour lancer la lecture.");
  });
});

$("#saveBtn").addEventListener("click", () => {
  if (!state.sourceBlob) return;
  const filename = safeOutputFilename(state.sourceName, state.sourceMime);
  downloadBlob(state.sourceBlob, filename);
});

$("#shareBtn").addEventListener("click", shareVideo);

async function shareVideo() {
  if (!state.sourceBlob) return;

  const filename = safeOutputFilename(state.sourceName, state.sourceMime);
  const file = new File([state.sourceBlob], filename, { type: state.sourceMime || state.sourceBlob.type || "video/mp4" });

  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: "Kiz Memory", files: [file] });
      return;
    }

    toast("Le partage direct de fichier n’est pas disponible ici. Utilisez ENREGISTRER puis partagez depuis votre galerie.");
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.warn("Share failed", error);
      toast("Le partage n’a pas pu être ouvert. Vous pouvez enregistrer la vidéo.");
    }
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeOutputFilename(originalName, mimeType) {
  const extension = extensionFromMime(mimeType || state.sourceBlob?.type || "");
  const base = String(originalName || "kiz-memory")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "kiz-memory";
  return `${base}.${extension}`;
}

function extensionFromMime(mimeType = "") {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("quicktime")) return "mov";
  if (normalized.includes("webm")) return "webm";
  return "mp4";
}

function resetAndRestart() {
  if (state.recording) stopRecording();
  stopRecTimer();
  stopCamera();
  resultVideo.pause();
  resultVideo.removeAttribute("src");
  resultVideo.load();
  $("#previewStatus").textContent = "";
  $("#previewStatus").className = "preview-status";
  clearSourceUrl();

  state.sourceBlob = null;
  state.sourceName = "video-kiz-memory";
  state.sourceMime = "";
  state.duration = 0;
  state.width = 0;
  state.height = 0;
  state.recordedChunks = [];
  state.recorder = null;
  state.recording = false;

  document.body.classList.remove("recording");
  recordLabel.textContent = "FILMER";
  $("#cameraHelp").textContent = "Cadrez les danseurs puis appuyez sur FILMER.";
  go("home");
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const secs = String(safe % 60).padStart(2, "0");
  return `${minutes}:${secs}`;
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

let toastTimer = null;
function toast(message) {
  window.clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add("show");
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 3200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
