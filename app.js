const state = {
  duration: 30,
  style: 'Golden Night',
  uploadedVideoUrl: null,
  analysisDone: false,
  clips: [
    { time: '00:08', label: 'Intro ambiance' },
    { time: '00:12', label: 'Connexion' },
    { time: '00:18', label: 'Pas fluide' },
    { time: '00:24', label: 'Danse intense' },
    { time: '00:31', label: 'Applaud.' },
    { time: '00:39', label: 'Moment wow' },
    { time: '00:48', label: 'Golden moment' },
    { time: '00:55', label: 'Social' },
    { time: '01:04', label: 'Démo prof' },
    { time: '01:11', label: 'Pratique' },
    { time: '01:18', label: 'Final' },
    { time: '01:23', label: 'Outro' }
  ]
};

const screens = [...document.querySelectorAll('.screen')];
const navButtons = [...document.querySelectorAll('[data-goto]')];
const bottomButtons = [...document.querySelectorAll('.bottom-nav button')];
const videoInput = document.querySelector('#videoInput');
const sourceVideo = document.querySelector('#sourceVideo');
const previewVideo = document.querySelector('#previewVideo');
const startAnalysisBtn = document.querySelector('#startAnalysisBtn');

function goto(screenName) {
  screens.forEach(screen => screen.classList.toggle('active', screen.dataset.screen === screenName));
  bottomButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.goto === screenName));
  if (screenName === 'analysis') startAnalysis();
  if (screenName === 'timeline') renderClips();
  if (screenName === 'moments') renderClipEditor();
  if (screenName === 'preview') syncPreview();
  if (screenName === 'export') syncExport();
}

navButtons.forEach(button => button.addEventListener('click', () => goto(button.dataset.goto)));

document.querySelectorAll('[data-action="fake-camera"], [data-action="use-demo"]').forEach(button => {
  button.addEventListener('click', () => {
    markDemoReady();
    goto('analysis');
  });
});

videoInput.addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (state.uploadedVideoUrl) URL.revokeObjectURL(state.uploadedVideoUrl);
  state.uploadedVideoUrl = URL.createObjectURL(file);
  sourceVideo.src = state.uploadedVideoUrl;
  previewVideo.src = state.uploadedVideoUrl;
  document.querySelector('.vertical-preview')?.classList.add('has-video');
  document.querySelector('#uploadedPreview').classList.remove('hidden');
  document.querySelector('#fileName').textContent = file.name;
  document.querySelector('#fileMeta').textContent = `${formatBytes(file.size)} · prêt pour analyse`;
  startAnalysisBtn.disabled = false;
  startAnalysisBtn.classList.remove('disabled');
  startAnalysisBtn.onclick = () => goto('analysis');
});

function markDemoReady() {
  document.querySelector('#uploadedPreview').classList.remove('hidden');
  document.querySelector('#fileName').textContent = 'Démo verticale sélectionnée';
  document.querySelector('#fileMeta').textContent = '1:24:35 · simulation IA';
  startAnalysisBtn.disabled = false;
  startAnalysisBtn.classList.remove('disabled');
  startAnalysisBtn.onclick = () => goto('analysis');
}

function startAnalysis() {
  if (state.analysisDone) return;
  const circle = document.querySelector('#progressCircle');
  const progressText = document.querySelector('#progressText');
  const targets = { movement: 82, vibe: 76, energy: 89, moments: 71 };
  let progress = 0;
  const circumference = 326.7;
  const interval = setInterval(() => {
    progress += Math.ceil(Math.random() * 6);
    if (progress > 100) progress = 100;
    circle.style.strokeDashoffset = circumference - (circumference * progress / 100);
    progressText.textContent = `${progress}%`;
    setMetric('movement', Math.min(targets.movement, Math.round(progress * targets.movement / 100)));
    setMetric('vibe', Math.min(targets.vibe, Math.round(progress * targets.vibe / 100)));
    setMetric('energy', Math.min(targets.energy, Math.round(progress * targets.energy / 100)));
    setMetric('moments', Math.min(targets.moments, Math.round(progress * targets.moments / 100)));
    if (progress >= 100) {
      clearInterval(interval);
      state.analysisDone = true;
      setTimeout(() => goto('format'), 650);
    }
  }, 120);
}

function setMetric(key, value) {
  const map = {
    movement: ['#movementPct', '#movementBar'],
    vibe: ['#vibePct', '#vibeBar'],
    energy: ['#energyPct', '#energyBar'],
    moments: ['#momentsPct', '#momentsBar']
  };
  const [pct, bar] = map[key];
  document.querySelector(pct).textContent = `${value}%`;
  document.querySelector(bar).style.width = `${value}%`;
}

document.querySelector('#skipAnalysisBtn').addEventListener('click', () => {
  state.analysisDone = true;
  setMetric('movement', 82); setMetric('vibe', 76); setMetric('energy', 89); setMetric('moments', 71);
  document.querySelector('#progressText').textContent = '100%';
  document.querySelector('#progressCircle').style.strokeDashoffset = 0;
  goto('format');
});

document.querySelector('#formatList').addEventListener('click', event => {
  const card = event.target.closest('.format-card');
  if (!card) return;
  state.duration = Number(card.dataset.duration);
  document.querySelectorAll('.format-card').forEach(btn => btn.classList.remove('selected'));
  card.classList.add('selected');
  syncDurationText();
});

document.querySelector('#styleList').addEventListener('click', event => {
  const card = event.target.closest('.style-card');
  if (!card) return;
  state.style = card.dataset.style;
  document.querySelectorAll('.style-card').forEach(btn => {
    btn.classList.toggle('selected', btn === card);
    btn.querySelector('em').textContent = btn === card ? '✓' : '';
  });
});

function renderClips() {
  const grid = document.querySelector('#clipGrid');
  grid.innerHTML = state.clips.map((clip, index) => `
    <article class="clip-card">
      <span style="filter:hue-rotate(${index * 18}deg)"></span>
      <b>${clip.time}</b>
    </article>
  `).join('');
  document.querySelector('#clipCount').textContent = state.clips.length;
}

function renderClipEditor() {
  syncDurationText();
  const editor = document.querySelector('#clipEditor');
  editor.innerHTML = state.clips.map((clip, index) => `
    <article class="clip-card" data-index="${index}">
      <button title="Retirer le clip">×</button>
      <span style="filter:hue-rotate(${index * 18}deg)"></span>
      <b>${clip.time}</b>
    </article>
  `).join('');
}

document.querySelector('#clipEditor').addEventListener('click', event => {
  const remove = event.target.closest('button');
  if (!remove) return;
  const card = event.target.closest('.clip-card');
  const index = Number(card.dataset.index);
  state.clips.splice(index, 1);
  renderClipEditor();
});

function syncPreview() {
  document.querySelector('#previewDuration').textContent = `0:${String(state.duration).padStart(2, '0')} / 0:${String(state.duration).padStart(2, '0')}`;
  if (state.uploadedVideoUrl) document.querySelector('.vertical-preview').classList.add('has-video');
}

document.querySelector('#playPreview').addEventListener('click', () => {
  if (previewVideo.src) {
    if (previewVideo.paused) previewVideo.play();
    else previewVideo.pause();
  }
});

['eventTitle','eventDate','eventPlace'].forEach(id => {
  document.querySelector(`#${id}`).addEventListener('input', syncCover);
});

function syncCover() {
  const title = document.querySelector('#eventTitle').value || 'Kizomba Night';
  const date = document.querySelector('#eventDate').value || '12 juillet 2026';
  const place = document.querySelector('#eventPlace').value || 'Paris, France';
  document.querySelector('#coverTitle').textContent = title;
  document.querySelector('#coverMeta').textContent = `${date} · ${place}`;
}

function syncExport() {
  syncCover();
  document.querySelector('#exportTitle').textContent = (document.querySelector('#eventTitle').value || 'Kizomba Night').toUpperCase();
  document.querySelector('#exportDuration').textContent = `${state.duration} sec`;
  document.querySelector('#capsuleFormat').textContent = `${state.duration} sec · 9:16`;
}

function syncDurationText() {
  const text = `${state.duration} sec`;
  document.querySelector('#selectedDurationText').textContent = text;
  document.querySelector('#capsuleFormat').textContent = `${state.duration} sec · 9:16`;
}

document.querySelector('#downloadMockBtn').addEventListener('click', () => {
  const payload = {
    app: 'Kiz Memory',
    type: 'Fiche de montage prototype',
    format: '9:16 vertical',
    duration: `${state.duration} sec`,
    style: state.style,
    title: document.querySelector('#eventTitle').value,
    date: document.querySelector('#eventDate').value,
    place: document.querySelector('#eventPlace').value,
    clips: state.clips,
    note: "Prototype front-end : la vraie génération vidéo nécessitera un moteur de montage comme FFmpeg côté serveur ou mobile."
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'kiz-memory-fiche-montage.json';
  link.click();
  URL.revokeObjectURL(url);
});

function formatBytes(bytes) {
  if (!bytes) return '0 octet';
  const units = ['octets','Ko','Mo','Go'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

renderClips();
renderClipEditor();
syncDurationText();
syncCover();
