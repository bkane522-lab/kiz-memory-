const state = {
  mode: "Soirée",
  duration: "15",
  style: "Golden Night",
  videoUrl: null,
  stream: null,
  recorder: null,
  chunks: [],
  recording: false,
  torch: false,
  timer: 12,
  timerId: null,
  clips: Array.from({ length: 12 }, (_, i) => ({ time: `00:${String(8 + i * 5).padStart(2, "0")}`, active: true }))
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const screens = $$(".screen");
const toastEl = $("#toast");
const cameraVideo = $("#cameraVideo");
const cameraBox = $("#cameraBox");
const previewVideo = $("#previewVideo");
const recordBtn = $("#recordBtn");
const timerEl = $("#recordTimer");
const videoFile = $("#videoFile");

function go(id) {
  screens.forEach((screen) => screen.classList.toggle("active", screen.id === id));

  $$(".bottom-nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.go === id);
  });

  if (id === "analysis") runAnalysis();
  if (id === "timeline") renderTimeline();
  if (id === "moments") renderClipGrid();
  if (id === "preview") preparePreview();
  if (id === "export") syncExport();
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

$$("[data-go]").forEach((button) => button.addEventListener("click", () => go(button.dataset.go)));
$$("[data-toast]").forEach((button) => button.addEventListener("click", () => toast(button.dataset.toast)));

$$(".mode-row button").forEach((button) => {
  button.addEventListener("click", () => {
    $$(".mode-row button").forEach((b) => b.classList.remove("selected"));
    button.classList.add("selected");
    state.mode = button.dataset.mode;
    toast(`Mode ${state.mode} activé`);
  });
});

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast("Caméra non disponible sur ce navigateur.");
    return false;
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1080 }, height: { ideal: 1920 } },
      audio: true
    });

    cameraVideo.srcObject = state.stream;
    cameraBox.classList.add("camera-on");
    toast("Caméra activée");
    return true;
  } catch (error) {
    toast("Autorisation caméra refusée ou indisponible.");
    return false;
  }
}

function stopCamera() {
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  cameraVideo.srcObject = null;
  cameraBox.classList.remove("camera-on");
}

async function toggleTorch() {
  if (!state.stream) {
    const ok = await startCamera();
    if (!ok) return;
  }

  const track = state.stream.getVideoTracks()[0];
  const capabilities = track?.getCapabilities ? track.getCapabilities() : {};

  if (!capabilities.torch) {
    toast("Flash non supporté par ce navigateur/appareil.");
    return;
  }

  try {
    state.torch = !state.torch;
    await track.applyConstraints({ advanced: [{ torch: state.torch }] });
    toast(state.torch ? "Flash activé" : "Flash désactivé");
  } catch (error) {
    toast("Impossible d’activer le flash sur ce téléphone.");
  }
}

async function toggleRecording() {
  if (!state.stream) {
    const ok = await startCamera();
    if (!ok) return;
    toast("Appuie encore pour lancer l’enregistrement.");
    return;
  }

  if (!window.MediaRecorder) {
    toast("Enregistrement vidéo non supporté sur ce navigateur.");
    return;
  }

  if (!state.recording) {
    state.chunks = [];
    try {
      state.recorder = new MediaRecorder(state.stream, { mimeType: pickMimeType() });
    } catch (error) {
      state.recorder = new MediaRecorder(state.stream);
    }

    state.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) state.chunks.push(event.data);
    };

    state.recorder.onstop = () => {
      const blob = new Blob(state.chunks, { type: state.recorder.mimeType || "video/webm" });
      setVideoBlob(blob);
      stopCamera();
      toast("Vidéo capturée. Analyse prête.");
      go("analysis");
    };

    state.recorder.start();
    state.recording = true;
    recordBtn.classList.add("recording");
    startTimer();
    toast("Enregistrement lancé");
  } else {
    state.recording = false;
    recordBtn.classList.remove("recording");
    clearInterval(state.timerId);
    state.recorder?.stop();
  }
}

function pickMimeType() {
  const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function startTimer() {
  state.timer = 0;
  timerEl.textContent = "00:00:00";
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    state.timer += 1;
    const minutes = String(Math.floor(state.timer / 60)).padStart(2, "0");
    const seconds = String(state.timer % 60).padStart(2, "0");
    timerEl.textContent = `00:${minutes}:${seconds}`;
  }, 1000);
}

function setVideoBlob(blob) {
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = URL.createObjectURL(blob);
  previewVideo.src = state.videoUrl;
  $(".vertical-preview").classList.add("has-video");
}

function setVideoFile(file) {
  if (!file) return;
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = URL.createObjectURL(file);
  previewVideo.src = state.videoUrl;
  $(".vertical-preview").classList.add("has-video");
  toast(`${file.name} importée`);
  go("analysis");
}

function runAnalysis() {
  const targets = [85, 72, 64, 40];
  const ids = ["mvt", "amb", "ene", "mom"];
  const bars = ["barMvt", "barAmb", "barEne", "barMom"];
  let progress = 0;

  ids.forEach((id, i) => {
    $("#" + id).textContent = "0%";
    $("#" + bars[i]).style.width = "0%";
  });

  clearInterval(runAnalysis.timer);
  runAnalysis.timer = setInterval(() => {
    progress += 5;
    targets.forEach((target, i) => {
      const value = Math.min(target, Math.round((target * progress) / 100));
      $("#" + ids[i]).textContent = `${value}%`;
      $("#" + bars[i]).style.width = `${value}%`;
    });

    if (progress >= 100) {
      clearInterval(runAnalysis.timer);
      setTimeout(() => go("timeline"), 600);
    }
  }, 110);
}

function renderTimeline() {
  const chart = $("#waveChart");
  chart.innerHTML = Array.from({ length: 38 }, (_, i) => {
    const height = 18 + Math.abs(Math.sin(i * 0.82)) * 112 + (i % 7 === 0 ? 35 : 0);
    return `<i style="height:${height}px"></i>`;
  }).join("");

  const row = $("#clipRow");
  row.innerHTML = state.clips.map((clip, i) => `<button class="clip" data-clip="${i}"><span style="--h:${i * 19}deg"></span><b>${clip.time}</b></button>`).join("");
}

function renderClipGrid() {
  const grid = $("#clipGrid");
  grid.innerHTML = state.clips.map((clip, i) => `<button class="${clip.active ? "" : "off"}" data-editclip="${i}"><span style="--h:${i * 19}deg"></span><b>${clip.time}</b></button>`).join("");
  syncDuration();
}

function syncDuration() {
  const label = state.duration === "full" ? "Complet" : `${state.duration} sec`;
  $("#finalDuration").textContent = label;
  $("#previewDuration").textContent = state.duration === "full" ? "Complet" : `0:${String(state.duration).padStart(2, "0")}`;
  $("#exportDuration").textContent = label;
}

function preparePreview() {
  if (state.videoUrl) {
    previewVideo.src = state.videoUrl;
    $(".vertical-preview").classList.add("has-video");
  }
  syncDuration();
}

function syncCover() {
  const title = $("#titleInput").value || "Kizomba Night";
  const date = $("#dateInput").value || "12 juillet 2026";
  const place = $("#placeInput").value || "Paris, France";

  $("#coverTitle").textContent = title;
  $("#coverMeta").textContent = `${date} · ${place}`;
  $("#exportTitle").textContent = title.toUpperCase();
}

function syncExport() {
  syncCover();
  syncDuration();
}

function shareText() {
  const title = $("#titleInput")?.value || "Kizomba Night";
  return `Kiz Memory — ${title}. Montage vertical ${state.duration === "full" ? "complet" : state.duration + "s"}, style ${state.style}.`;
}

async function nativeShare(label = "Kiz Memory") {
  const data = {
    title: label,
    text: shareText(),
    url: location.href
  };

  if (navigator.share) {
    try {
      await navigator.share(data);
      toast("Partage ouvert");
      return;
    } catch (error) {
      toast("Partage annulé");
      return;
    }
  }

  await copyText(`${data.text}\n${data.url}`);
  toast("Lien copié. Partage manuel possible.");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const input = document.createElement("textarea");
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
}

function openWhatsApp() {
  const text = encodeURIComponent(`${shareText()} ${location.href}`);
  window.open(`https://wa.me/?text=${text}`, "_blank");
  toast("WhatsApp ouvert");
}

function openSocial(name) {
  if (navigator.share) {
    nativeShare(name);
    return;
  }

  const urls = {
    Instagram: "https://www.instagram.com/",
    TikTok: "https://www.tiktok.com/upload",
    Shorts: "https://www.youtube.com/"
  };
  window.open(urls[name] || location.href, "_blank");
  toast(`${name} ouvert. Le fichier doit être ajouté manuellement.`);
}

function downloadRecap() {
  const title = $("#titleInput")?.value || "Kizomba Night";
  const payload = {
    app: "Kiz Memory",
    status: "Prototype interactif",
    title,
    format: "vertical 9:16",
    duration: state.duration,
    style: state.style,
    mode: state.mode,
    clips: state.clips.filter((clip) => clip.active),
    note: "Ce téléchargement est une fiche prototype. L’export MP4 final demande un moteur vidéo côté serveur ou FFmpeg."
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kiz-memory-recap.json";
  link.click();
  URL.revokeObjectURL(url);
  toast("Fiche récap téléchargée");
}

recordBtn.addEventListener("click", toggleRecording);
$("#torchBtn").addEventListener("click", toggleTorch);
$("#galleryBtn").addEventListener("click", () => go("import"));
$("#speedBtn").addEventListener("click", (event) => {
  const values = ["1.0x", "1.5x", "2.0x", "0.5x"];
  const next = values[(values.indexOf(event.currentTarget.textContent) + 1) % values.length];
  event.currentTarget.textContent = next;
  toast(`Vitesse ${next}`);
});
$("#gridBtn").addEventListener("click", () => toast("Grille de cadrage activée"));
$("#magicBtn").addEventListener("click", () => toast("Mode magic shot activé"));
$("#helpImportBtn").addEventListener("click", () => toast("Importe une vidéo verticale ou horizontale. Le récap final reste pensé pour 9:16."));
$("#importBtn").addEventListener("click", () => videoFile.click());
$("#demoVideoBtn").addEventListener("click", () => {
  toast("Vidéo démo sélectionnée");
  go("analysis");
});
videoFile.addEventListener("change", (event) => setVideoFile(event.target.files[0]));

$("#dropzone").addEventListener("dragover", (event) => {
  event.preventDefault();
  $("#dropzone").classList.add("drag");
});
$("#dropzone").addEventListener("drop", (event) => {
  event.preventDefault();
  setVideoFile(event.dataTransfer.files[0]);
});

$("#finishAnalysisBtn").addEventListener("click", () => go("timeline"));
$("#filterBtn").addEventListener("click", () => toast("Filtre : meilleurs moments activé"));
$("#selectAllBtn").addEventListener("click", () => {
  state.clips.forEach((clip) => (clip.active = true));
  renderTimeline();
  toast("Tous les moments sont gardés");
});
$("#shareScoreBtn").addEventListener("click", () => nativeShare("Vibe Score Kiz Memory"));
$("#workshopInfoBtn").addEventListener("click", () => toast("Workshop Brain sépare explications, démos, pratique et corrections."));

$$(".format-list button").forEach((button) => {
  button.addEventListener("click", () => {
    $$(".format-list button").forEach((b) => b.classList.remove("selected"));
    button.classList.add("selected");
    state.duration = button.dataset.duration;
    syncDuration();
    toast(`Format choisi : ${button.querySelector("b").textContent}`);
  });
});

$$(".style-list button").forEach((button) => {
  button.addEventListener("click", () => {
    $$(".style-list button").forEach((b) => {
      b.classList.remove("selected");
      b.querySelector("i").textContent = "○";
    });
    button.classList.add("selected");
    button.querySelector("i").textContent = "✓";
    state.style = button.dataset.style;
    toast(`Style choisi : ${state.style}`);
  });
});

$("#generateBtn").addEventListener("click", () => {
  toast("Memory générée en simulation");
  setTimeout(() => go("preview"), 700);
});

$("#shareGenericBtn").addEventListener("click", () => nativeShare("Kiz Memory"));
$("#instagramBtn").addEventListener("click", () => openSocial("Instagram"));
$("#whatsappBtn").addEventListener("click", openWhatsApp);
$("#moreShareBtn").addEventListener("click", () => nativeShare("Kiz Memory"));

$("#previewPlayBtn").addEventListener("click", () => {
  if (!state.videoUrl) {
    toast("Aucune vidéo importée. Aperçu visuel simulé.");
    return;
  }

  if (previewVideo.paused) {
    previewVideo.play();
  } else {
    previewVideo.pause();
  }
});

$("#clipGrid").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-editclip]");
  if (!button) return;
  const index = Number(button.dataset.editclip);
  state.clips[index].active = !state.clips[index].active;
  renderClipGrid();
});

["titleInput", "dateInput", "placeInput"].forEach((id) => $("#" + id).addEventListener("input", syncCover));
$("#exportPlayBtn").addEventListener("click", () => toast("Lecture du montage simulée"));
$("#exportInstagramBtn").addEventListener("click", () => openSocial("Instagram"));
$("#exportTikTokBtn").addEventListener("click", () => openSocial("TikTok"));
$("#exportDownloadBtn").addEventListener("click", downloadRecap);
$("#exportWhatsappBtn").addEventListener("click", openWhatsApp);
$("#exportCopyBtn").addEventListener("click", async () => {
  await copyText(`${shareText()} ${location.href}`);
  toast("Lien copié");
});
$("#capsuleShareBtn").addEventListener("click", () => nativeShare("Memory Capsule"));

renderTimeline();
renderClipGrid();
syncCover();
syncDuration();
