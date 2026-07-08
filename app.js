const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  previousScreen: "home",
  currentScreen: "home",
  mode: "Soirée",
  duration: 30,
  stream: null,
  recorder: null,
  recordedChunks: [],
  recordedBlob: null,
  videoUrl: null,
  facingMode: "environment",
  timerInterval: null,
  recordingStartedAt: 0,
  torchOn: false,
  lastShareText: "Kiz Memory — ma vidéo souvenir est prête ✨"
};

const screens = $$(".screen");
const toast = $("#toast");

function go(id) {
  if (!$("#" + id)) return;
  state.previousScreen = state.currentScreen;
  state.currentScreen = id;

  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.id === id);
  });

  if (id !== "capture") stopCamera(false);
  if (id === "capture") startCamera();
  if (id === "analysis") runAnalysis();
  if (id === "generation") runGeneration();
  if (id === "result") prepareResult();
}

function showToast(message, duration = 2400) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), duration);
}

$$("[data-go]").forEach((button) => {
  button.addEventListener("click", () => go(button.dataset.go));
});

$("[data-back]").addEventListener("click", () => go(state.previousScreen || "home"));

$("#startCameraBtn").addEventListener("click", () => go("capture"));
$("#closeCaptureBtn").addEventListener("click", () => {
  stopRecordingIfNeeded();
  stopCamera(true);
  go("start");
});

// Modes
$$(".mode-tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    $$(".mode-tabs button").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    state.mode = button.dataset.mode;
    showToast(`Mode ${state.mode} sélectionné`);
  });
});

// Camera
async function startCamera() {
  if (state.stream) return;

  const status = $("#cameraStatus");
  const video = $("#cameraPreview");
  const stage = $("#cameraStage");

  status.textContent = "Ouverture caméra…";

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: state.facingMode,
        width: { ideal: 1080 },
        height: { ideal: 1920 }
      },
      audio: true
    });

    video.srcObject = state.stream;
    await video.play();

    stage.classList.add("live");
    status.textContent = "Aperçu caméra clair";
  } catch (error) {
    status.textContent = "Caméra indisponible";
    showToast("Autorisez la caméra, ou importez une vidéo.", 3600);
  }
}

function stopCamera(resetPreview = false) {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }

  $("#cameraPreview").srcObject = null;
  $("#cameraStage").classList.remove("live");
  $("#cameraStatus").textContent = "Caméra prête";
  state.torchOn = false;

  if (resetPreview) {
    $("#recordingBadge").classList.add("hidden");
    $("#recordBtn").classList.remove("recording");
    $("#recordTimer").innerHTML = "<i></i>00:00";
  }
}

$("#switchCamBtn").addEventListener("click", async () => {
  state.facingMode = state.facingMode === "environment" ? "user" : "environment";
  stopCamera();
  await startCamera();
  showToast(state.facingMode === "environment" ? "Caméra arrière" : "Caméra avant");
});

$("#torchBtn").addEventListener("click", async () => {
  try {
    const track = state.stream?.getVideoTracks?.()[0];
    const capabilities = track?.getCapabilities?.();

    if (!track || !capabilities || !capabilities.torch) {
      showToast("Flash non disponible sur ce navigateur.");
      return;
    }

    state.torchOn = !state.torchOn;
    await track.applyConstraints({ advanced: [{ torch: state.torchOn }] });
    showToast(state.torchOn ? "Flash activé" : "Flash désactivé");
  } catch (error) {
    showToast("Impossible d’activer le flash ici.");
  }
});

$("#recordBtn").addEventListener("click", async () => {
  if (state.recorder && state.recorder.state === "recording") {
    stopRecordingIfNeeded();
    return;
  }

  if (!state.stream) {
    await startCamera();
    if (!state.stream) return;
  }

  startRecording();
});

function startRecording() {
  if (!window.MediaRecorder) {
    showToast("Enregistrement non supporté. Utilisez l’import vidéo.", 3600);
    return;
  }

  state.recordedChunks = [];

  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm";

  try {
    state.recorder = new MediaRecorder(state.stream, { mimeType });
  } catch (error) {
    showToast("Impossible de lancer l’enregistrement.");
    return;
  }

  state.recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) state.recordedChunks.push(event.data);
  };

  state.recorder.onstop = () => {
    state.recordedBlob = new Blob(state.recordedChunks, { type: mimeType });
    setVideoUrl(URL.createObjectURL(state.recordedBlob));
    stopTimer();
    $("#recordBtn").classList.remove("recording");
    $("#recordingBadge").classList.add("hidden");
    showToast("Vidéo capturée. Analyse en cours…");
    setTimeout(() => go("analysis"), 700);
  };

  state.recorder.start();
  state.recordingStartedAt = Date.now();
  $("#recordBtn").classList.add("recording");
  $("#recordingBadge").classList.remove("hidden");
  startTimer();
}

function stopRecordingIfNeeded() {
  if (state.recorder && state.recorder.state === "recording") {
    state.recorder.stop();
  }
}

function startTimer() {
  stopTimer();
  state.timerInterval = setInterval(() => {
    const seconds = Math.floor((Date.now() - state.recordingStartedAt) / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    $("#recordTimer").innerHTML = `<i></i>${mm}:${ss}`;
  }, 250);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
}

// Import video
const fileInput = $("#fileInput");
const quickFileInput = $("#quickFileInput");
const dropZone = $("#dropZone");

quickFileInput.addEventListener("change", (event) => handleFileSelection(event.target.files[0], true));
fileInput.addEventListener("change", (event) => handleFileSelection(event.target.files[0], false));
dropZone.addEventListener("click", () => fileInput.click());

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files?.[0];
  handleFileSelection(file, false);
});

function handleFileSelection(file, fromStart) {
  if (!file) return;
  if (!file.type.startsWith("video/")) {
    showToast("Choisissez un fichier vidéo.");
    return;
  }

  setVideoUrl(URL.createObjectURL(file));
  state.recordedBlob = file;

  $("#selectedVideoPreview").src = state.videoUrl;
  $("#selectedFileName").textContent = file.name || "Vidéo importée";
  $("#selectedFileInfo").textContent = `${formatBytes(file.size)} · prête pour analyse`;
  $("#selectedVideoBox").classList.remove("hidden");
  activateAnalyzeButton();

  if (fromStart) go("import");
}

function setVideoUrl(url) {
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = url;
}

function activateAnalyzeButton() {
  const button = $("#analyzeImportBtn");
  button.disabled = false;
  button.classList.remove("disabled");
}

$("#analyzeImportBtn").addEventListener("click", () => go("analysis"));

// Analysis
function runAnalysis() {
  const ring = $("#analysisRing");
  const percent = $("#analysisPercent");
  let progress = 0;

  ["#step1", "#step2", "#step3"].forEach((id) => $(id).classList.remove("active"));
  $("#step1").classList.add("active");

  clearInterval(runAnalysis.timer);
  ring.style.setProperty("--value", 0);
  percent.textContent = "0%";

  runAnalysis.timer = setInterval(() => {
    progress += Math.floor(Math.random() * 8) + 4;
    if (progress > 100) progress = 100;

    ring.style.setProperty("--value", progress);
    percent.textContent = `${progress}%`;

    if (progress >= 34) $("#step2").classList.add("active");
    if (progress >= 72) $("#step3").classList.add("active");

    if (progress === 100) {
      clearInterval(runAnalysis.timer);
      setTimeout(() => go("format"), 650);
    }
  }, 190);
}

// Format
$$(".format-list button").forEach((button) => {
  button.addEventListener("click", () => {
    $$(".format-list button").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    state.duration = Number(button.dataset.duration);
    $("#finalDurationLabel").textContent = `${state.duration}s`;
  });
});

$("#goGenerateBtn").addEventListener("click", () => go("generation"));

function runGeneration() {
  const bar = $("#generationBar");
  const text = $("#generationText");
  let progress = 0;
  const messages = [
    "Sélection des meilleurs moments…",
    "Recadrage vertical 9:16…",
    "Transitions élégantes…",
    "Préparation du partage…"
  ];

  clearInterval(runGeneration.timer);
  bar.style.width = "0%";
  text.textContent = "Montage automatique…";

  runGeneration.timer = setInterval(() => {
    progress += Math.floor(Math.random() * 10) + 5;
    if (progress > 100) progress = 100;
    bar.style.width = `${progress}%`;

    const index = Math.min(Math.floor(progress / 26), messages.length - 1);
    text.textContent = messages[index];

    if (progress === 100) {
      clearInterval(runGeneration.timer);
      setTimeout(() => go("result"), 650);
    }
  }, 220);
}

function prepareResult() {
  $("#finalDurationLabel").textContent = `${state.duration}s`;
  const finalPreview = $("#finalPreview");
  const finalVideo = $("#finalVideo");

  if (state.videoUrl) {
    finalVideo.src = state.videoUrl;
    finalPreview.classList.add("has-video");
  } else {
    finalVideo.removeAttribute("src");
    finalPreview.classList.remove("has-video");
  }
}

// Sharing
$("#shareBtn").addEventListener("click", async () => {
  await nativeShare("Votre Memory est prête ✨", state.lastShareText);
});

$("#instagramBtn").addEventListener("click", async () => {
  if (navigator.share) {
    await nativeShare("Partager sur Instagram", "Téléchargez votre Memory puis choisissez Instagram dans le partage.");
  } else {
    window.open("https://www.instagram.com/", "_blank");
  }
});

$("#tiktokBtn").addEventListener("click", async () => {
  if (navigator.share) {
    await nativeShare("Partager sur TikTok", "Téléchargez votre Memory puis choisissez TikTok dans le partage.");
  } else {
    window.open("https://www.tiktok.com/upload", "_blank");
  }
});

$("#whatsappBtn").addEventListener("click", () => {
  const text = encodeURIComponent("Ma Memory Kizomba est prête ✨");
  window.open(`https://wa.me/?text=${text}`, "_blank");
});

async function nativeShare(title, text) {
  try {
    if (!navigator.share) {
      await copyCurrentLink();
      showToast("Lien copié. Partage manuel disponible.");
      return;
    }

    await navigator.share({ title, text, url: location.href });
  } catch (error) {
    if (error.name !== "AbortError") showToast("Partage indisponible ici.");
  }
}

$("#downloadBtn").addEventListener("click", () => {
  if (state.recordedBlob && state.recordedBlob.type.startsWith("video/")) {
    downloadBlob(state.recordedBlob, `kiz-memory-capture-${Date.now()}.webm`);
    return;
  }

  const data = {
    app: "Kiz Memory V3",
    ux: "capture claire, flow simplifié, partage après génération",
    format: "vertical 9:16",
    duration: `${state.duration}s`,
    mode: state.mode,
    note: "Prototype front-end. Le montage IA réel nécessite un moteur vidéo/serveur."
  };

  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "kiz-memory-recap.json");
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyCurrentLink() {
  try {
    await navigator.clipboard.writeText(location.href);
  } catch (error) {
    // Clipboard can fail on some browsers.
  }
}

function formatBytes(bytes) {
  if (!bytes) return "0 octet";
  const units = ["octets", "Ko", "Mo", "Go"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

window.addEventListener("beforeunload", () => {
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  stopCamera(false);
});
