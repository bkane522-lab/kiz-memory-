const state = {
  duration: 30,
  style: "Golden Night",
  uploadedVideoUrl: null,
  analysisDone: false,
  clips: [
    { time: "00:08", label: "Intro ambiance" },
    { time: "00:12", label: "Connexion" },
    { time: "00:18", label: "Pas fluide" },
    { time: "00:24", label: "Danse intense" },
    { time: "00:31", label: "Applaudissements" },
    { time: "00:39", label: "Moment wow" },
    { time: "00:48", label: "Golden moment" },
    { time: "00:55", label: "Social" },
    { time: "01:04", label: "Démo prof" },
    { time: "01:11", label: "Pratique" },
    { time: "01:18", label: "Final" },
    { time: "01:23", label: "Outro" }
  ]
};

const screens = [...document.querySelectorAll(".screen")];
const bottomButtons = [...document.querySelectorAll(".bottom button")];

const videoInput = document.querySelector("#videoInput");
const sourceVideo = document.querySelector("#sourceVideo");
const previewVideo = document.querySelector("#previewVideo");
const uploadBox = document.querySelector("#uploadBox");
const fileName = document.querySelector("#fileName");
const fileInfo = document.querySelector("#fileInfo");
const analyseBtn = document.querySelector("#analyseBtn");

function go(screenId) {
  screens.forEach(screen => {
    screen.classList.toggle("active", screen.id === screenId);
  });

  bottomButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.go === screenId);
  });

  if (screenId === "analysis") startAnalysis();
  if (screenId === "timeline") renderClips();
  if (screenId === "moments") renderClipEditor();
  if (screenId === "preview") syncPreview();
  if (screenId === "export") syncExport();
}

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => {
    go(button.dataset.go);
  });
});

document.querySelector("#demoBtn").addEventListener("click", () => {
  uploadBox.classList.remove("hidden");
  fileName.textContent = "Démo verticale sélectionnée";
  fileInfo.textContent = "1:24:35 · simulation IA";
  activateAnalyse();
  go("analysis");
});

videoInput.addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;

  if (state.uploadedVideoUrl) {
    URL.revokeObjectURL(state.uploadedVideoUrl);
  }

  state.uploadedVideoUrl = URL.createObjectURL(file);

  sourceVideo.src = state.uploadedVideoUrl;
  previewVideo.src = state.uploadedVideoUrl;

  uploadBox.classList.remove("hidden");
  fileName.textContent = file.name;
  fileInfo.textContent = `${formatBytes(file.size)} · prêt pour analyse`;

  document.querySelector(".phone-video").classList.add("has-video");

  activateAnalyse();
});

function activateAnalyse() {
  analyseBtn.disabled = false;
  analyseBtn.classList.remove("disabled");
  analyseBtn.onclick = () => go("analysis");
}

function startAnalysis() {
  if (state.analysisDone) return;

  const circle = document.querySelector("#circleProgress");
  const percent = document.querySelector("#percent");

  let progress = 0;
  const circumference = 326.7;

  const targets = {
    m1: 82,
    m2: 76,
    m3: 89,
    m4: 71
  };

  const timer = setInterval(() => {
    progress += Math.ceil(Math.random() * 7);

    if (progress >= 100) {
      progress = 100;
    }

    circle.style.strokeDashoffset =
      circumference - (circumference * progress / 100);

    percent.textContent = `${progress}%`;

    setMetric("m1", "b1", Math.round(progress * targets.m1 / 100));
    setMetric("m2", "b2", Math.round(progress * targets.m2 / 100));
    setMetric("m3", "b3", Math.round(progress * targets.m3 / 100));
    setMetric("m4", "b4", Math.round(progress * targets.m4 / 100));

    if (progress >= 100) {
      clearInterval(timer);
      state.analysisDone = true;

      setTimeout(() => {
        go("format");
      }, 700);
    }
  }, 120);
}

function setMetric(textId, barId, value) {
  const safeValue = Math.min(value, 100);
  document.querySelector(`#${textId}`).textContent = `${safeValue}%`;
  document.querySelector(`#${barId}`).style.width = `${safeValue}%`;
}

document.querySelector("#skipBtn").addEventListener("click", () => {
  state.analysisDone = true;

  document.querySelector("#percent").textContent = "100%";
  document.querySelector("#circleProgress").style.strokeDashoffset = 0;

  setMetric("m1", "b1", 82);
  setMetric("m2", "b2", 76);
  setMetric("m3", "b3", 89);
  setMetric("m4", "b4", 71);

  go("format");
});

document.querySelectorAll(".format-list button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".format-list button").forEach(item => {
      item.classList.remove("selected");
    });

    button.classList.add("selected");
    state.duration = Number(button.dataset.duration);

    syncDuration();
  });
});

document.querySelectorAll(".style-list button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".style-list button").forEach(item => {
      item.classList.remove("selected");
    });

    button.classList.add("selected");
    state.style = button.dataset.style;
  });
});

function renderClips() {
  const grid = document.querySelector("#clipGrid");

  grid.innerHTML = state.clips.map((clip, index) => {
    return `
      <article class="clip">
        <div style="filter:hue-rotate(${index * 18}deg)"></div>
        <b>${clip.time}</b>
      </article>
    `;
  }).join("");

  document.querySelector("#clipTotal").textContent = state.clips.length;
  document.querySelector("#capsuleClips").textContent = state.clips.length;
}

function renderClipEditor() {
  const editor = document.querySelector("#clipEditor");

  editor.innerHTML = state.clips.map((clip, index) => {
    return `
      <article class="clip" data-index="${index}">
        <button title="Retirer">×</button>
        <div style="filter:hue-rotate(${index * 18}deg)"></div>
        <b>${clip.time}</b>
      </article>
    `;
  }).join("");

  syncDuration();
}

document.querySelector("#clipEditor").addEventListener("click", event => {
  const removeButton = event.target.closest("button");
  if (!removeButton) return;

  const card = event.target.closest(".clip");
  const index = Number(card.dataset.index);

  state.clips.splice(index, 1);

  renderClipEditor();
  renderClips();
});

function syncPreview() {
  const duration = String(state.duration).padStart(2, "0");

  document.querySelector("#durationText").textContent =
    `0:${duration} / 0:${duration}`;

  if (state.uploadedVideoUrl) {
    document.querySelector(".phone-video").classList.add("has-video");
  }
}

document.querySelector("#playBtn").addEventListener("click", () => {
  if (!previewVideo.src) return;

  if (previewVideo.paused) {
    previewVideo.play();
  } else {
    previewVideo.pause();
  }
});

["eventTitle", "eventDate", "eventPlace"].forEach(id => {
  document.querySelector(`#${id}`).addEventListener("input", syncCover);
});

function syncCover() {
  const title = document.querySelector("#eventTitle").value || "Kizomba Night";
  const date = document.querySelector("#eventDate").value || "12 juillet 2026";
  const place = document.querySelector("#eventPlace").value || "Paris, France";

  document.querySelector("#coverTitle").textContent = title;
  document.querySelector("#coverMeta").textContent = `${date} · ${place}`;
  document.querySelector("#videoTitle").textContent = title.toUpperCase();
}

function syncDuration() {
  document.querySelector("#finalDuration").textContent = `${state.duration} sec`;
  document.querySelector("#capsuleFormat").textContent = `${state.duration} sec · 9:16`;
  document.querySelector("#exportDuration").textContent = `${state.duration} sec`;
}

function syncExport() {
  syncCover();
  syncDuration();

  const title = document.querySelector("#eventTitle").value || "Kizomba Night";
  document.querySelector("#exportTitle").textContent = title.toUpperCase();
}

document.querySelector("#downloadBtn").addEventListener("click", () => {
  const title = document.querySelector("#eventTitle").value || "Kizomba Night";
  const date = document.querySelector("#eventDate").value || "12 juillet 2026";
  const place = document.querySelector("#eventPlace").value || "Paris, France";

  const data = {
    app: "Kiz Memory",
    type: "Fiche de montage prototype",
    format: "9:16 vertical",
    duration: `${state.duration} sec`,
    style: state.style,
    title,
    date,
    place,
    clips: state.clips,
    note: "Prototype front-end. La vraie génération vidéo nécessitera un moteur vidéo comme FFmpeg ou un service serveur."
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "kiz-memory-fiche-montage.json";
  link.click();

  URL.revokeObjectURL(url);
});

function formatBytes(bytes) {
  if (!bytes) return "0 octet";

  const units = ["octets", "Ko", "Mo", "Go"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  const value = bytes / Math.pow(1024, index);

  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

renderClips();
renderClipEditor();
syncCover();
syncDuration();
