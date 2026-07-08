const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  screen: 'home',
  previous: 'home',
  stream: null,
  recorder: null,
  chunks: [],
  url: null,
  fileName: '',
  mode: 'Soirée',
  duration: 30,
  recording: false,
  timer: null,
  startedAt: 0,
  facingMode: 'environment',
  torch: false
};

const screens = $$('.screen');
const toast = $('#toast');
const cameraWrap = $('#cameraWrap');
const cameraVideo = $('#cameraVideo');
const recordBtn = $('#recordBtn');
const timerLabel = $('#timer');
const input = $('#videoInput');
const importPreview = $('#importPreview');
const selectedFile = $('#selectedFile');
const analyseImportBtn = $('#analyseImportBtn');
const resultVideo = $('#resultVideo');
const resultPreview = $('.result-preview');

function showToast(message, delay = 2600) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove('show'), delay);
}

function go(id) {
  if (!$('#' + id)) return;
  state.previous = state.screen;
  state.screen = id;
  screens.forEach((screen) => screen.classList.toggle('active', screen.id === id));
  if (id !== 'capture') stopCamera(false);
  if (id === 'capture') startCamera();
  if (id === 'analysis') runAnalysis();
  if (id === 'generation') runGeneration();
  if (id === 'result') prepareResult();
}

$$('[data-go]').forEach((el) => {
  el.addEventListener('click', () => go(el.dataset.go));
});

$$('[data-back]').forEach((el) => {
  el.addEventListener('click', () => go(state.previous || 'home'));
});

$$('.mode-tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.mode-tabs button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;
    showToast(`Mode ${state.mode} sélectionné`);
  });
});

$$('.format-list button').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.format-list button').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.duration = Number(btn.dataset.duration);
    $('#resultDuration').textContent = `${state.duration}s`;
  });
});

$$('[data-action]').forEach((el) => {
  el.addEventListener('click', async (e) => {
    const action = el.dataset.action;
    if (action === 'record') toggleRecord();
    if (action === 'torch') toggleTorch();
    if (action === 'switch-camera') switchCamera();
    if (action === 'native-share') nativeShare();
    if (action === 'instagram') shareSocial('instagram');
    if (action === 'tiktok') shareSocial('tiktok');
    if (action === 'whatsapp') shareSocial('whatsapp');
    if (action === 'download') downloadRecap();
    if (action === 'copy-link') copyLink();
    if (action === 'demo') go('result');
  });
});

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Caméra non disponible dans ce navigateur.');
    return;
  }

  try {
    stopCamera(false);
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
      audio: true
    });
    cameraVideo.srcObject = state.stream;
    cameraWrap.classList.add('camera-on');
  } catch (error) {
    cameraWrap.classList.remove('camera-on');
    showToast('Accès caméra refusé ou indisponible.');
  }
}

function stopCamera(stopRecording = true) {
  if (stopRecording && state.recording) stopRecordingNow();
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
  cameraWrap?.classList.remove('camera-on');
}

async function switchCamera() {
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  showToast('Changement de caméra…');
  await startCamera();
}

async function toggleTorch() {
  const track = state.stream?.getVideoTracks?.()[0];
  if (!track) return showToast('Lancez la caméra avant d’utiliser le flash.');

  const capabilities = track.getCapabilities ? track.getCapabilities() : {};
  if (!capabilities.torch) {
    showToast('Torche non supportée par ce navigateur/téléphone.');
    return;
  }

  try {
    state.torch = !state.torch;
    await track.applyConstraints({ advanced: [{ torch: state.torch }] });
    showToast(state.torch ? 'Flash activé' : 'Flash désactivé');
  } catch (error) {
    showToast('Impossible d’activer le flash ici.');
  }
}

function toggleRecord() {
  if (state.recording) {
    stopRecordingNow();
    return;
  }
  startRecordingNow();
}

function startRecordingNow() {
  if (!state.stream) {
    showToast('Caméra non prête. Vous pouvez importer une vidéo.');
    return;
  }

  if (!window.MediaRecorder) {
    showToast('Enregistrement vidéo non supporté dans ce navigateur.');
    return;
  }

  state.chunks = [];
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  try {
    state.recorder = new MediaRecorder(state.stream, { mimeType });
    state.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) state.chunks.push(event.data);
    };
    state.recorder.onstop = () => {
      const blob = new Blob(state.chunks, { type: mimeType });
      setVideoUrl(URL.createObjectURL(blob), 'capture-kiz-memory.webm');
      showToast('Vidéo capturée. Analyse en cours…');
      setTimeout(() => go('analysis'), 500);
    };
    state.recorder.start();
    state.recording = true;
    state.startedAt = Date.now();
    document.body.classList.add('recording');
    tickTimer();
    state.timer = setInterval(tickTimer, 250);
  } catch (error) {
    showToast('Impossible de démarrer l’enregistrement.');
  }
}

function stopRecordingNow() {
  if (state.recorder && state.recorder.state !== 'inactive') {
    state.recorder.stop();
  }
  state.recording = false;
  clearInterval(state.timer);
  document.body.classList.remove('recording');
}

function tickTimer() {
  const elapsed = Date.now() - state.startedAt;
  const totalSeconds = Math.floor(elapsed / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  timerLabel.textContent = `${h}:${m}:${s}`;
}

input.addEventListener('change', () => {
  const file = input.files?.[0];
  if (!file) return;
  setVideoUrl(URL.createObjectURL(file), file.name);
  importPreview.src = state.url;
  $('#fileTitle').textContent = file.name;
  $('#fileMeta').textContent = `${formatBytes(file.size)} · prêt pour analyse`;
  selectedFile.classList.remove('hidden');
  analyseImportBtn.disabled = false;
  analyseImportBtn.classList.remove('disabled');
});

analyseImportBtn.addEventListener('click', () => go('analysis'));

function setVideoUrl(url, name) {
  if (state.url && state.url.startsWith('blob:')) URL.revokeObjectURL(state.url);
  state.url = url;
  state.fileName = name || 'kiz-memory-video';
}

function runAnalysis() {
  let progress = 0;
  const ring = $('#analysisRing');
  const label = $('#analysisPercent');
  $('#step2').classList.remove('done');
  $('#step3').classList.remove('done');

  const t = setInterval(() => {
    progress += Math.floor(Math.random() * 8) + 4;
    if (progress >= 100) progress = 100;
    ring.style.setProperty('--p', progress);
    label.textContent = `${progress}%`;
    if (progress > 38) $('#step2').classList.add('done');
    if (progress > 76) $('#step3').classList.add('done');
    if (progress === 100) {
      clearInterval(t);
      setTimeout(() => go('format'), 550);
    }
  }, 140);
}

function runGeneration() {
  const lines = ['Préparation du format vertical…', 'Sélection des meilleurs moments…', 'Montage automatique…', 'Finalisation premium…'];
  let i = 0;
  $('#genText').textContent = lines[0];
  const t = setInterval(() => {
    i += 1;
    $('#genText').textContent = lines[i] || 'Memory prête ✨';
    if (i >= lines.length) {
      clearInterval(t);
      setTimeout(() => go('result'), 700);
    }
  }, 900);
}

function prepareResult() {
  $('#resultDuration').textContent = `${state.duration}s`;
  if (state.url) {
    resultVideo.src = state.url;
    resultPreview.classList.add('has-video');
  } else {
    resultPreview.classList.remove('has-video');
  }
}

async function nativeShare() {
  const text = `Kiz Memory ✨ Ma Memory ${state.duration}s est prête.`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Kiz Memory', text, url: location.href });
    } catch (_) {}
  } else {
    copyLink();
  }
}

function shareSocial(type) {
  const text = encodeURIComponent(`Kiz Memory ✨ Ma Memory ${state.duration}s est prête : ${location.href}`);
  if (type === 'whatsapp') {
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
    return;
  }
  if (navigator.share) {
    nativeShare();
    return;
  }
  if (type === 'instagram') window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
  if (type === 'tiktok') window.open('https://www.tiktok.com/upload', '_blank', 'noopener,noreferrer');
  showToast('Utilisez le bouton Partager pour envoyer vers l’application voulue.');
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href);
    showToast('Lien copié ✅');
  } catch (error) {
    showToast('Impossible de copier le lien.');
  }
}

function downloadRecap() {
  const data = {
    app: 'Kiz Memory',
    version: 'V3.1 Brand Lock',
    mode: state.mode,
    duration: `${state.duration}s`,
    format: 'Vertical 9:16',
    source: state.fileName || 'Démo / prototype',
    note: 'Prototype front-end. Le vrai montage MP4 automatique nécessite une étape FFmpeg ou serveur vidéo.'
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kiz-memory-recap.json';
  a.click();
  URL.revokeObjectURL(url);
}

function formatBytes(bytes) {
  if (!bytes) return '0 octet';
  const units = ['octets', 'Ko', 'Mo', 'Go'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i ? 1 : 0)} ${units[i]}`;
}
