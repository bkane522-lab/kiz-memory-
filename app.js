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
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  if (file.type && !file.type.startsWith("video/")) {
    toast("Choisissez un fichier vidéo.");
    return;
  }

  stopCamera();
  setSource(file, file.name, file.type);
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
  $("#processingText").textContent = "Vérification de la vidéo.";

  try {
    const metadata = await readVideoMetadata(state.sourceUrl);
    state.duration = metadata.duration;
    state.width = metadata.width;
    state.height = metadata.height;
    setStep("stepChecked", true, "✓");

    $("#processingText").textContent = "Vidéo vérifiée. Préparation de l’aperçu.";
    prepareResultPreview();
    setStep("stepReady", true, "✓");
    $("#processingText").textContent = "Vidéo prête.";

    await nextPaint();
    go("result");
  } catch (error) {
    console.warn("Video metadata/decode failed", error);
    const codecHint = await detectCodecHint(state.sourceBlob).catch(() => "");
    resetAndRestart();

    if (codecHint === "HEVC/H.265") {
      toast("Vidéo HEVC/H.265 détectée. Ce navigateur ne peut pas toujours la lire. Le fichier n’est pas forcément endommagé.");
    } else {
      toast("Le navigateur n’a pas réussi à décoder cette vidéo. Le fichier n’est pas forcément endommagé.");
    }
  }
}

function setStep(id, done, marker) {
  const item = $(`#${id}`);
  item.classList.toggle("done", done);
  const span = item.querySelector("span");
  span.textContent = marker;
}

function readVideoMetadata(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.playsInline = true;
    video.muted = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    video.style.position = "fixed";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    video.style.left = "-10px";
    video.style.bottom = "-10px";
    document.body.appendChild(video);

    let settled = false;
    let seekTried = false;
    const timeout = window.setTimeout(() => {
      fail(new Error("metadata timeout"));
    }, 45000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", tryResolve);
      video.removeEventListener("durationchange", tryResolve);
      video.removeEventListener("loadeddata", tryResolve);
      video.removeEventListener("canplay", tryResolve);
      video.removeEventListener("error", onError);
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch (_) {}
      video.remove();
    };

    const finish = (metadata) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(metadata);
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    function tryResolve() {
      const duration = Number(video.duration);
      if (Number.isFinite(duration) && duration > 0) {
        finish({
          duration,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0
        });
        return;
      }

      // Certains fichiers mobiles/MediaRecorder annoncent d’abord une durée
      // infinie ou nulle. Un seek déclenche alors le calcul réel de durée.
      if (!seekTried && video.readyState >= 1 && (duration === Infinity || duration === 0)) {
        seekTried = true;
        try {
          video.currentTime = 1e10;
        } catch (_) {}
      }
    }

    function onError() {
      const mediaError = video.error;
      const error = new Error(`video error${mediaError?.code ? ` code ${mediaError.code}` : ""}`);
      error.mediaCode = mediaError?.code || 0;
      fail(error);
    }

    video.addEventListener("loadedmetadata", tryResolve);
    video.addEventListener("durationchange", tryResolve);
    video.addEventListener("loadeddata", tryResolve);
    video.addEventListener("canplay", tryResolve);
    video.addEventListener("error", onError, { once: true });

    video.src = url;
    video.load();
  });
}

async function detectCodecHint(blob) {
  if (!blob?.size || !blob.arrayBuffer) return "";

  // Lecture limitée : on cherche seulement les identifiants de codec du conteneur.
  const sampleSize = Math.min(blob.size, 4 * 1024 * 1024);
  const buffer = await blob.slice(0, sampleSize).arrayBuffer();
  const text = new TextDecoder("latin1").decode(buffer);

  if (text.includes("hvc1") || text.includes("hev1")) return "HEVC/H.265";
  if (text.includes("avc1") || text.includes("avc3")) return "H.264/AVC";
  if (text.includes("av01")) return "AV1";
  if (text.includes("vp09")) return "VP9";
  if (text.includes("vp08")) return "VP8";
  return "";
}

function prepareResultPreview() {
  resultVideo.pause();
  resultVideo.src = state.sourceUrl;
  resultVideo.load();

  const parts = [formatTime(state.duration)];
  if (state.width && state.height) parts.push(`${state.width} × ${state.height}`);
  if (state.sourceMime) parts.push(state.sourceMime.replace("video/", "").toUpperCase());
  $("#videoInfo").textContent = parts.join(" · ");
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
