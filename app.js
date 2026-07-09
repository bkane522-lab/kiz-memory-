const state = {
  sourceUrl: null,
  sourceName: "Démo Kiz Memory",
  sourceBlob: null,
  recordedChunks: [],
  cameraStream: null,
  recorder: null,
  recording: false,
  recTimer: null,
  recSeconds: 0,
  facingMode: "environment",
  mode: "Soirée",
  duration: 15,
  resultUrl: null,
  resultBlob: null,
  summary: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const pages = $$(".page");
const homeFab = $("#homeFab");
const fileInput = $("#fileInput");
const fileInputCamera = $("#fileInputCamera");
const cameraVideo = $("#cameraVideo");
const cameraFrame = $("#cameraFrame");
const cameraEmpty = $("#cameraEmpty");
const recTime = $("#recTime");
const recordBtn = $("#recordBtn");
const resultVideo = $("#resultVideo");
const resultFallback = $("#resultFallback");

function go(id) {
  pages.forEach((page) => page.classList.toggle("active", page.id === id));
  homeFab.classList.toggle("hidden", id === "home");
  if (id !== "capture") stopCameraIfNeeded(false);
}

$$("[data-go]").forEach((el) => {
  el.addEventListener("click", () => go(el.dataset.go));
});

$("#startCameraBtn").addEventListener("click", async () => {
  go("capture");
  await startCamera();
});

$("#openFileBtn").addEventListener("click", () => fileInput.click());
$("#openFileCameraBtn").addEventListener("click", () => fileInputCamera.click());

fileInput.addEventListener("change", handleFile);
fileInputCamera.addEventListener("change", handleFile);

async function handleFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  setSource(file, file.name);
  go("analysis");
  await runAnalysis();
}

function setSource(blob, name) {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceBlob = blob;
  state.sourceUrl = URL.createObjectURL(blob);
  state.sourceName = name || "Vidéo Kiz Memory";
}

async function startCamera() {
  stopCameraIfNeeded(false);
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
      audio: true
    });
    cameraVideo.srcObject = state.cameraStream;
    cameraFrame.classList.add("has-video");
    cameraEmpty.innerHTML = "";
  } catch (error) {
    cameraFrame.classList.remove("has-video");
    cameraEmpty.innerHTML = `<b>Caméra indisponible</b><small>Importez plutôt une vidéo</small>`;
  }
}

function stopCameraIfNeeded(clearVideo = true) {
  if (state.recording) return;
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
  }
  if (clearVideo) {
    cameraVideo.srcObject = null;
    cameraFrame.classList.remove("has-video");
  }
}

$("#switchCamBtn").addEventListener("click", async () => {
  state.facingMode = state.facingMode === "environment" ? "user" : "environment";
  await startCamera();
});

$("#torchBtn").addEventListener("click", async () => {
  try {
    const track = state.cameraStream?.getVideoTracks?.()[0];
    const caps = track?.getCapabilities?.();
    if (!track || !caps?.torch) {
      toast("Torche non disponible sur ce navigateur.");
      return;
    }
    const current = track.getSettings?.().torch || false;
    await track.applyConstraints({ advanced: [{ torch: !current }] });
  } catch {
    toast("Torche non disponible.");
  }
});

recordBtn.addEventListener("click", async () => {
  if (!state.cameraStream) await startCamera();
  if (!state.cameraStream) return;
  if (state.recording) {
    stopRecording();
  } else {
    startRecording();
  }
});

function startRecording() {
  if (!window.MediaRecorder) {
    toast("Enregistrement non supporté ici. Essayez l’import vidéo.");
    return;
  }
  state.recordedChunks = [];
  const options = pickRecorderOptions();
  try {
    state.recorder = new MediaRecorder(state.cameraStream, options);
  } catch {
    state.recorder = new MediaRecorder(state.cameraStream);
  }

  state.recorder.ondataavailable = (event) => {
    if (event.data && event.data.size) state.recordedChunks.push(event.data);
  };
  state.recorder.onstop = async () => {
    const type = state.recordedChunks[0]?.type || "video/webm";
    const blob = new Blob(state.recordedChunks, { type });
    setSource(blob, "capture-kiz-memory.webm");
    state.recording = false;
    recordBtn.classList.remove("recording");
    stopRecTimer();
    stopCameraIfNeeded();
    go("analysis");
    await runAnalysis();
  };

  state.recorder.start(500);
  state.recording = true;
  recordBtn.classList.add("recording");
  startRecTimer();
}

function stopRecording() {
  if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
}

function pickRecorderOptions() {
  const candidates = [
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
  state.recSeconds = 0;
  recTime.textContent = "00:00";
  state.recTimer = setInterval(() => {
    state.recSeconds += 1;
    recTime.textContent = formatTime(state.recSeconds);
  }, 1000);
}

function stopRecTimer() {
  clearInterval(state.recTimer);
  recTime.textContent = "00:00";
}

$$(".mode-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".mode-tabs button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.mode = btn.dataset.mode;
  });
});

async function runAnalysis() {
  resetProgress();
  const duration = await getVideoDuration(state.sourceUrl).catch(() => 0);
  state.summary = createSummary(duration);

  const circle = $("#progressCircle");
  const text = $("#progressText");
  const circumference = 326.7;
  let progress = 0;

  await new Promise((resolve) => {
    const timer = setInterval(() => {
      progress += Math.floor(Math.random() * 8) + 4;
      if (progress >= 100) progress = 100;

      circle.style.strokeDashoffset = circumference - (circumference * progress) / 100;
      text.textContent = `${progress}%`;
      if (progress > 25) activateStep("#aStep1");
      if (progress > 55) activateStep("#aStep2");
      if (progress > 82) activateStep("#aStep3");

      if (progress === 100) {
        clearInterval(timer);
        setTimeout(resolve, 450);
      }
    }, 95);
  });

  renderSummary();
  go("summary");
}

function resetProgress() {
  $("#progressCircle").style.strokeDashoffset = 326.7;
  $("#progressText").textContent = "0%";
  ["#aStep1", "#aStep2", "#aStep3"].forEach((id) => $(id).classList.remove("active"));
}

function activateStep(id) {
  $(id).classList.add("active");
}

function getVideoDuration(url) {
  return new Promise((resolve, reject) => {
    if (!url) return resolve(0);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    video.onloadedmetadata = () => resolve(video.duration || 0);
    video.onerror = reject;
  });
}

function createSummary(duration = 0) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 84;
  const moments = [0.08, 0.22, 0.38, 0.56, 0.73, 0.88].map((ratio, index) => {
    const labels = ["Entrée ambiance", "Connexion danse", "Danse intense", "Moment collectif", "Golden moment", "Final émotion"];
    return {
      time: Math.max(0, Math.floor(safeDuration * ratio)),
      label: labels[index]
    };
  });

  const vibe = Math.floor(86 + Math.random() * 9);
  const recommended = safeDuration > 50 ? 30 : 15;
  return {
    videoDuration: safeDuration,
    clips: moments.length,
    vibe,
    recommended,
    moments,
    mode: state.mode
  };
}

function renderSummary() {
  const summary = state.summary || createSummary();
  $("#summaryIntro").textContent = `${summary.clips} moments détectés · ${summary.mode} · vertical 9:16`;
  $("#statClips").textContent = summary.clips;
  $("#statDuration").textContent = `${summary.recommended}s`;
  $("#statScore").textContent = summary.vibe;
  $("#timelineList").innerHTML = summary.moments.map((m) => `
    <div class="timeline-item">
      <b>${formatTime(m.time)}</b>
      <span>${m.label}</span>
    </div>
  `).join("");
}

$$(".format-list button").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".format-list button").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    state.duration = Number(btn.dataset.duration || 15);
  });
});

$("#generateBtn").addEventListener("click", async () => {
  go("generate");
  await generateMontageBeta();
  renderResult();
  go("result");
});

async function generateMontageBeta() {
  setRender(0, "Préparation du rendu vertical…");
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = null;
  state.resultBlob = null;

  if (!state.sourceUrl) {
    await fakeRender();
    return;
  }

  try {
    const blob = await renderCanvasVideo();
    state.resultBlob = blob;
    state.resultUrl = URL.createObjectURL(blob);
    setRender(100, "Memory générée.");
  } catch (error) {
    console.warn(error);
    state.resultUrl = state.sourceUrl;
    state.resultBlob = state.sourceBlob;
    setRender(100, "Aperçu généré en mode simplifié.");
  }
}

async function fakeRender() {
  for (let p = 0; p <= 100; p += 10) {
    setRender(p, p < 75 ? "Création du résumé…" : "Finalisation…");
    await wait(120);
  }
}

function setRender(percent, text) {
  $("#renderBar").style.width = `${percent}%`;
  $("#renderText").textContent = text;
}

async function renderCanvasVideo() {
  if (!window.MediaRecorder) throw new Error("MediaRecorder unavailable");

  const source = document.createElement("video");
  source.src = state.sourceUrl;
  source.crossOrigin = "anonymous";
  source.muted = true;
  source.playsInline = true;
  source.preload = "auto";

  await waitForEvent(source, "loadedmetadata", 8000);

  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(24);

  const audioTracks = getAudioTracksFromVideo(source);
  const mixedStream = new MediaStream([...stream.getVideoTracks(), ...audioTracks]);

  const options = pickRecorderOptions();
  const recorder = new MediaRecorder(mixedStream, options);
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size) chunks.push(event.data);
  };

  const done = new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
  });

  recorder.start(500);
  const totalSeconds = Math.min(state.duration, 12); // bêta navigateur : rendu court pour éviter les blocages mobiles
  const moments = (state.summary?.moments || createSummary().moments).slice(0, 3);
  const segmentLength = totalSeconds / Math.max(moments.length, 1);

  for (let i = 0; i < moments.length; i += 1) {
    const start = Math.max(0, Math.min(moments[i].time, Math.max(0, source.duration - segmentLength - 0.5)));
    await seekVideo(source, start);
    await source.play().catch(() => {});

    const startTime = performance.now();
    while ((performance.now() - startTime) / 1000 < segmentLength) {
      drawFrame(ctx, canvas, source, moments[i], i, moments.length);
      setRender(Math.min(96, Math.round(((i + ((performance.now() - startTime) / 1000) / segmentLength) / moments.length) * 100)), "Montage des meilleurs moments…");
      await wait(40);
    }
    source.pause();
  }

  drawEndCard(ctx, canvas);
  await wait(500);
  recorder.stop();
  return await done;
}

function getAudioTracksFromVideo(video) {
  try {
    const stream = video.captureStream?.() || video.mozCaptureStream?.();
    return stream?.getAudioTracks?.() || [];
  } catch {
    return [];
  }
}

function drawFrame(ctx, canvas, video, moment, index, total) {
  ctx.fillStyle = "#07030d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawCover(ctx, video, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "rgba(0,0,0,.10)");
  gradient.addColorStop(.65, "rgba(0,0,0,.08)");
  gradient.addColorStop(1, "rgba(0,0,0,.72)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(255,216,107,.55)";
  ctx.lineWidth = 3;
  roundRect(ctx, 34, 34, canvas.width - 68, canvas.height - 68, 38, false, true);

  ctx.fillStyle = "rgba(0,0,0,.55)";
  roundRect(ctx, 54, 84, 180, 48, 24, true, false);
  ctx.fillStyle = "#ffd86b";
  ctx.font = "700 22px system-ui";
  ctx.fillText(`${index + 1}/${total}`, 82, 116);

  ctx.fillStyle = "#fff7e8";
  ctx.font = "700 42px system-ui";
  ctx.fillText(moment.label, 58, canvas.height - 170);

  ctx.fillStyle = "#ffd86b";
  ctx.font = "600 24px system-ui";
  ctx.fillText(`Kiz Memory · ${formatTime(moment.time)}`, 58, canvas.height - 122);
}

function drawEndCard(ctx, canvas) {
  ctx.fillStyle = "#07030d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 10, canvas.width / 2, canvas.height / 2, 500);
  g.addColorStop(0, "rgba(141,67,255,.34)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffd86b";
  ctx.font = "700 54px serif";
  ctx.textAlign = "center";
  ctx.fillText("KIZ MEMORY", canvas.width / 2, canvas.height / 2 - 30);
  ctx.fillStyle = "#d7b6ff";
  ctx.font = "700 22px system-ui";
  ctx.fillText("DANCE · REMEMBER · FOREVER", canvas.width / 2, canvas.height / 2 + 22);
  ctx.textAlign = "left";
}

function drawCover(ctx, video, canvasW, canvasH) {
  const vw = video.videoWidth || canvasW;
  const vh = video.videoHeight || canvasH;
  const scale = Math.max(canvasW / vw, canvasH / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (canvasW - dw) / 2;
  const dy = (canvasH - dh) / 2;
  ctx.drawImage(video, dx, dy, dw, dh);
}

function renderResult() {
  const source = state.resultUrl || state.sourceUrl;
  if (source) {
    resultVideo.src = source;
    $(".result-video").classList.add("has-video");
  } else {
    $(".result-video").classList.remove("has-video");
  }
  const s = state.summary || createSummary();
  $("#finalSummary").textContent = `${s.clips} temps forts détectés · vibe ${s.vibe}/100 · ${state.duration}s vertical 9:16. ${state.resultBlob ? "Vidéo bêta téléchargeable." : "Aperçu simplifié."}`;
}

$("#downloadVideoBtn").addEventListener("click", () => {
  const blob = state.resultBlob || state.sourceBlob;
  if (!blob) {
    downloadTextSummary();
    return;
  }
  const ext = blob.type.includes("webm") ? "webm" : "mp4";
  downloadBlob(blob, `kiz-memory-${Date.now()}.${ext}`);
});

$("#shareNative").addEventListener("click", shareNative);
$("#shareInstagram").addEventListener("click", () => shareNative("Instagram"));
$("#shareTiktok").addEventListener("click", () => shareNative("TikTok"));
$("#shareWhatsapp").addEventListener("click", () => {
  const text = encodeURIComponent("Ma Memory Kizomba est prête ✨ #KizMemory");
  window.open(`https://wa.me/?text=${text}`, "_blank");
});

async function shareNative(target = "") {
  const text = `Ma Memory Kizomba est prête ✨ ${target ? "Pour " + target + "." : ""}`;
  try {
    if (navigator.share) {
      const file = state.resultBlob ? new File([state.resultBlob], "kiz-memory.webm", { type: state.resultBlob.type || "video/webm" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "Kiz Memory", text, files: [file] });
      } else {
        await navigator.share({ title: "Kiz Memory", text, url: location.href });
      }
    } else {
      await navigator.clipboard?.writeText(`${text} ${location.href}`);
      toast("Lien copié.");
    }
  } catch {}
}

function downloadTextSummary() {
  const s = state.summary || createSummary();
  const content = JSON.stringify({ app: "Kiz Memory", summary: s, duration: state.duration, note: "Résumé prototype" }, null, 2);
  downloadBlob(new Blob([content], { type: "application/json" }), "kiz-memory-resume.json");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function waitForEvent(el, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout ${event}`)), timeout);
    el.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}
function seekVideo(video, time) {
  return new Promise((resolve) => {
    const done = () => resolve();
    video.addEventListener("seeked", done, { once: true });
    video.currentTime = time;
    setTimeout(resolve, 900);
  });
}
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const m = String(Math.floor(safe / 60)).padStart(2, "0");
  const s = String(safe % 60).padStart(2, "0");
  return `${m}:${s}`;
}
function toast(message) {
  const el = document.createElement("div");
  el.textContent = message;
  el.style.cssText = "position:fixed;left:24px;right:24px;bottom:24px;z-index:99;padding:14px 16px;border-radius:16px;background:rgba(15,8,25,.92);border:1px solid rgba(255,255,255,.15);color:#fff;font-weight:800;text-align:center";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2300);
}
