const state = {
  duration: 15,
  cameraStream: null,
  mediaRecorder: null,
  chunks: [],
  recordedUrl: null,
  timer: null,
  seconds: 0,
  facingMode: "environment"
};

const screens = [...document.querySelectorAll(".screen")];
const cameraVideo = document.querySelector("#cameraVideo");
const emptyCamera = document.querySelector("#emptyCamera");
const resultVideo = document.querySelector("#resultVideo");
const videoInput = document.querySelector("#videoInput");
const timerLabel = document.querySelector("#timer");

function go(id) {
  screens.forEach(screen => screen.classList.toggle("active", screen.id === id));
  if (id === "capture") startCamera();
  if (id === "analysis") startAnalysis();
  if (id === "generate") startGenerate();
}

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => go(button.dataset.go));
});

document.querySelectorAll(".mode").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".mode").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
  });
});

videoInput.addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (state.recordedUrl) URL.revokeObjectURL(state.recordedUrl);
  state.recordedUrl = URL.createObjectURL(file);
  resultVideo.src = state.recordedUrl;
  go("analysis");
});

document.querySelectorAll(".format-card").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".format-card").forEach(item => item.classList.remove("selected"));
    button.classList.add("selected");
    state.duration = Number(button.dataset.duration);
    document.querySelector("#durationLabel").textContent = String(state.duration).padStart(2, "0");
  });
});

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    emptyCamera.innerHTML = "<span>Caméra indisponible</span><small>Votre navigateur ne permet pas la capture directe. Importez une vidéo.</small>";
    return;
  }

  try {
    stopCamera();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
      audio: true
    });
    state.cameraStream = stream;
    cameraVideo.srcObject = stream;
    emptyCamera.style.display = "none";
  } catch (error) {
    emptyCamera.style.display = "grid";
    emptyCamera.innerHTML = "<span>Autorisation caméra</span><small>Autorisez la caméra ou utilisez l’import vidéo.</small>";
  }
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(track => track.stop());
    state.cameraStream = null;
  }
}

document.querySelector("#flipBtn").addEventListener("click", async () => {
  state.facingMode = state.facingMode === "environment" ? "user" : "environment";
  await startCamera();
});

document.querySelector("#torchBtn").addEventListener("click", async () => {
  const track = state.cameraStream?.getVideoTracks?.()[0];
  const capabilities = track?.getCapabilities?.();
  if (!track || !capabilities?.torch) {
    toast("Torche non supportée sur ce navigateur.");
    return;
  }
  const current = track.getSettings().torch || false;
  await track.applyConstraints({ advanced: [{ torch: !current }] });
});

document.querySelector("#recordBtn").addEventListener("click", () => {
  if (!state.mediaRecorder || state.mediaRecorder.state === "inactive") {
    startRecording();
  } else {
    stopRecording();
  }
});

function startRecording() {
  if (!state.cameraStream || !window.MediaRecorder) {
    toast("Enregistrement indisponible. Utilisez l’import vidéo.");
    return;
  }
  state.chunks = [];
  state.mediaRecorder = new MediaRecorder(state.cameraStream);
  state.mediaRecorder.ondataavailable = event => {
    if (event.data.size) state.chunks.push(event.data);
  };
  state.mediaRecorder.onstop = () => {
    const blob = new Blob(state.chunks, { type: "video/webm" });
    if (state.recordedUrl) URL.revokeObjectURL(state.recordedUrl);
    state.recordedUrl = URL.createObjectURL(blob);
    resultVideo.src = state.recordedUrl;
    stopTimer();
    go("analysis");
  };
  state.mediaRecorder.start();
  document.querySelector("#recordBtn").classList.add("recording");
  startTimer();
}

function stopRecording() {
  if (state.mediaRecorder?.state === "recording") state.mediaRecorder.stop();
  document.querySelector("#recordBtn").classList.remove("recording");
}

function startTimer() {
  state.seconds = 0;
  timerLabel.textContent = "00:00:00";
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    state.seconds += 1;
    const h = String(Math.floor(state.seconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((state.seconds % 3600) / 60)).padStart(2, "0");
    const s = String(state.seconds % 60).padStart(2, "0");
    timerLabel.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timer);
  timerLabel.textContent = "00:00:00";
}

function startAnalysis() {
  let value = 0;
  const percent = document.querySelector("#analysisPercent");
  const steps = [...document.querySelectorAll(".steps li")];
  const timer = setInterval(() => {
    value += 5;
    percent.textContent = `${Math.min(value, 100)}%`;
    if (value >= 35) steps[1].classList.add("active");
    if (value >= 70) steps[2].classList.add("active");
    if (value >= 100) {
      clearInterval(timer);
      setTimeout(() => go("format"), 450);
    }
  }, 110);
}

function startGenerate() {
  setTimeout(() => go("result"), 2200);
}

document.querySelector(".play-btn").addEventListener("click", () => {
  if (!resultVideo.src) return;
  if (resultVideo.paused) resultVideo.play();
  else resultVideo.pause();
});

document.querySelector("#downloadBtn").addEventListener("click", () => {
  const data = {
    app: "Kiz Memory",
    version: "V3.2.1 Page 1 Luxe Fix",
    format: "9:16",
    duration: `${state.duration}s`,
    note: "Prototype front-end. Le vrai export MP4 automatique sera ajouté ensuite."
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kiz-memory-recap.json";
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelector("#shareNative").addEventListener("click", async () => {
  const payload = { title: "Kiz Memory", text: "Ma Memory Kizomba est prête ✨", url: location.href };
  if (navigator.share) await navigator.share(payload);
  else copyLink();
});

document.querySelector("#shareWhatsapp").addEventListener("click", () => {
  window.open(`https://wa.me/?text=${encodeURIComponent("Ma Memory Kizomba est prête ✨ " + location.href)}`, "_blank");
});

document.querySelector("#shareInstagram").addEventListener("click", async () => {
  if (navigator.share) return navigator.share({ title: "Kiz Memory", text: "Ma Memory Kizomba est prête ✨", url: location.href });
  window.open("https://www.instagram.com/", "_blank");
});

document.querySelector("#shareTikTok").addEventListener("click", async () => {
  if (navigator.share) return navigator.share({ title: "Kiz Memory", text: "Ma Memory Kizomba est prête ✨", url: location.href });
  window.open("https://www.tiktok.com/", "_blank");
});

async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href);
    toast("Lien copié.");
  } catch {
    toast("Partage indisponible.");
  }
}

function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const box = document.createElement("div");
  box.className = "toast";
  box.textContent = message;
  Object.assign(box.style, {
    position: "fixed",
    left: "50%",
    bottom: "28px",
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,.82)",
    color: "#fff7df",
    border: "1px solid rgba(255,255,255,.16)",
    borderRadius: "999px",
    padding: "12px 18px",
    fontWeight: "800",
    zIndex: 9999
  });
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2200);
}
