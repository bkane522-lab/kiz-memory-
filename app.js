const state = {
  stream: null,
  recorder: null,
  chunks: [],
  videoUrl: null,
  sourceFileName: '',
  montageBlob: null,
  montageUrl: null,
  duration: 15,
  timer: null,
  seconds: 0,
  facingMode: 'environment',
  analysing: false,
  generating: false
};

const pages = [...document.querySelectorAll('.page')];
const cameraVideo = document.getElementById('cameraVideo');
const cameraPreview = document.getElementById('cameraPreview');
const cameraEmpty = document.getElementById('cameraEmpty');
const recTime = document.getElementById('recTime');
const recordBtn = document.getElementById('recordBtn');
const resultVideo = document.getElementById('resultVideo');
const resultCard = document.getElementById('resultCard');
const fileInput = document.getElementById('fileInput');
const fileInputCamera = document.getElementById('fileInputCamera');
const renderBar = document.getElementById('renderBar');
const generateStatus = document.getElementById('generateStatus');

function go(id){
  pages.forEach(page => page.classList.toggle('active', page.id === id));
  if(id === 'analysis') startAnalysis();
  if(id === 'generate') startGenerate();
  if(id === 'result') syncResult();
  if(id !== 'capture' && id !== 'analysis') stopRecordingTimerOnly();
}

document.querySelectorAll('[data-go]').forEach(btn => {
  btn.addEventListener('click', () => go(btn.dataset.go));
});

// ENTRY IMPORT
const openFileBtn = document.getElementById('openFileBtn');
const openFileCameraBtn = document.getElementById('openFileCameraBtn');
openFileBtn.addEventListener('click', () => fileInput.click());
openFileCameraBtn.addEventListener('click', () => fileInputCamera.click());
fileInput.addEventListener('change', e => handleFile(e.target.files?.[0]));
fileInputCamera.addEventListener('change', e => handleFile(e.target.files?.[0]));

function handleFile(file){
  if(!file) return;
  setVideoUrl(URL.createObjectURL(file));
  state.sourceFileName = file.name || 'video-importee';
  state.montageBlob = null;
  if(state.montageUrl) URL.revokeObjectURL(state.montageUrl);
  state.montageUrl = null;
  stopCamera();

  const box = document.getElementById('importState');
  box.classList.add('ready');
  box.innerHTML = `<span>✅</span><p><b>${escapeHtml(state.sourceFileName)}</b><br>Vidéo importée. Analyse automatique...</p>`;
  toast('Vidéo importée. Analyse automatique lancée.');

  setTimeout(() => go('analysis'), 650);
}

// CAMERA
const startCameraBtn = document.getElementById('startCameraBtn');
startCameraBtn.addEventListener('click', async () => {
  await startCamera();
  go('capture');
});

async function startCamera(){
  stopCamera();
  try{
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: state.facingMode }, audio: true });
    cameraVideo.srcObject = state.stream;
    cameraPreview.classList.add('live');
    cameraEmpty.innerHTML = '';
  }catch(e){
    cameraPreview.classList.remove('live');
    cameraEmpty.innerHTML = '<span>📷</span><b>Caméra refusée</b><small>Importez une vidéo depuis la galerie.</small>';
    toast('Caméra refusée. Utilisez Importer une vidéo.');
  }
}
function stopCamera(){
  if(state.stream){
    state.stream.getTracks().forEach(track => track.stop());
    state.stream = null;
  }
}

document.getElementById('switchCamBtn').addEventListener('click', async () => {
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  await startCamera();
});

document.getElementById('torchBtn').addEventListener('click', async () => {
  const track = state.stream?.getVideoTracks?.()[0];
  const caps = track?.getCapabilities?.();
  if(!track || !caps || !caps.torch){ toast('Torche non disponible sur ce navigateur.'); return; }
  try{
    const current = !!track.getSettings().torch;
    await track.applyConstraints({ advanced: [{ torch: !current }] });
    toast(!current ? 'Torche activée.' : 'Torche désactivée.');
  }catch(e){ toast('Impossible d’activer la torche.'); }
});

recordBtn.addEventListener('click', () => {
  if(state.recorder && state.recorder.state === 'recording') stopRecording();
  else startRecording();
});

function startRecording(){
  if(!state.stream){ toast('Lancez la caméra ou importez une vidéo.'); return; }
  try{
    state.chunks = [];
    const mime = pickMimeType();
    state.recorder = new MediaRecorder(state.stream, mime ? { mimeType: mime } : undefined);
    state.recorder.ondataavailable = e => { if(e.data.size) state.chunks.push(e.data); };
    state.recorder.onstop = () => {
      const blob = new Blob(state.chunks, { type: state.recorder.mimeType || 'video/webm' });
      setVideoUrl(URL.createObjectURL(blob));
      state.sourceFileName = 'capture-kiz-memory.webm';
      state.montageBlob = null;
      if(state.montageUrl) URL.revokeObjectURL(state.montageUrl);
      state.montageUrl = null;
      stopTimer();
      recordBtn.classList.remove('recording');
      toast('Capture terminée. Analyse automatique lancée.');
      go('analysis');
    };
    state.recorder.start();
    recordBtn.classList.add('recording');
    startTimer();
  }catch(e){ toast('Enregistrement non supporté ici. Importez une vidéo.'); }
}
function stopRecording(){ if(state.recorder?.state === 'recording') state.recorder.stop(); }
function pickMimeType(){
  if(!window.MediaRecorder) return '';
  return ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
}
function startTimer(){
  stopTimer(); state.seconds = 0; recTime.textContent = '00:00';
  state.timer = setInterval(() => {
    state.seconds++;
    const m = String(Math.floor(state.seconds/60)).padStart(2,'0');
    const s = String(state.seconds%60).padStart(2,'0');
    recTime.textContent = `${m}:${s}`;
  }, 1000);
}
function stopTimer(){ clearInterval(state.timer); state.timer = null; }
function stopRecordingTimerOnly(){ if(!state.recorder || state.recorder.state !== 'recording') stopTimer(); }

function setVideoUrl(url){
  if(state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = url;
}

document.querySelectorAll('.camera-modes button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.camera-modes button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ANALYSIS
function startAnalysis(){
  if(state.analysing) return;
  state.analysing = true;
  const circle = document.getElementById('progressCircle');
  const text = document.getElementById('progressText');
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const step3 = document.getElementById('step3');
  const subtitle = document.getElementById('analysisSubtitle');
  subtitle.textContent = state.videoUrl ? 'Vidéo reçue. Kiz Memory prépare un récap vertical automatique.' : 'Mode démo. Kiz Memory prépare un récap vertical.';
  let p = 0;
  const c = 326.7;
  circle.style.strokeDashoffset = c;
  text.textContent = '0%';
  [step1,step2,step3].forEach((s,i)=>s.classList.toggle('active', i===0));
  const interval = setInterval(() => {
    p += 4;
    if(p > 100) p = 100;
    circle.style.strokeDashoffset = c - (c * p / 100);
    text.textContent = `${p}%`;
    if(p >= 35) step2.classList.add('active');
    if(p >= 70) step3.classList.add('active');
    if(p === 100){
      clearInterval(interval);
      state.analysing = false;
      setTimeout(() => go('format'), 450);
    }
  }, 72);
}

// FORMAT
const durationLabel = document.getElementById('durationLabel');
document.querySelectorAll('.format-list button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.format-list button').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.duration = Number(btn.dataset.duration);
    durationLabel.textContent = `${state.duration}s`;
  });
});

// GENERATE REAL BETA MONTAGE
async function startGenerate(){
  if(state.generating) return;
  state.generating = true;
  renderBar.style.width = '0%';
  generateStatus.textContent = 'Préparation du rendu vertical...';

  try{
    if(state.videoUrl && window.MediaRecorder && HTMLCanvasElement.prototype.captureStream){
      state.montageBlob = null;
      if(state.montageUrl){ URL.revokeObjectURL(state.montageUrl); state.montageUrl = null; }
      const blob = await createVerticalMontage(state.videoUrl, state.duration, (progress, message) => {
        renderBar.style.width = `${Math.round(progress * 100)}%`;
        if(message) generateStatus.textContent = message;
      });
      state.montageBlob = blob;
      state.montageUrl = URL.createObjectURL(blob);
      generateStatus.textContent = 'Montage terminé.';
      renderBar.style.width = '100%';
      setTimeout(() => { state.generating = false; go('result'); }, 450);
    }else{
      await fakeRender();
      state.generating = false;
      go('result');
    }
  }catch(e){
    console.warn(e);
    await fakeRender('Rendu vidéo limité sur ce navigateur. Aperçu de la vidéo source.');
    state.generating = false;
    go('result');
  }
}

async function fakeRender(message = 'Prévisualisation prête.'){
  for(let i=0;i<=100;i+=5){
    renderBar.style.width = `${i}%`;
    generateStatus.textContent = i < 35 ? 'Sélection des moments...' : i < 70 ? 'Recadrage vertical...' : message;
    await wait(55);
  }
}

async function createVerticalMontage(src, targetSeconds, onProgress){
  const video = document.createElement('video');
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  await once(video, 'loadedmetadata', 10000);

  const sourceDuration = isFinite(video.duration) && video.duration > 0 ? video.duration : targetSeconds;
  const outputSeconds = Math.max(5, Math.min(targetSeconds, Math.ceil(sourceDuration)));
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d', { alpha: false });
  const stream = canvas.captureStream(30);
  const mime = pickMimeType() || 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks = [];
  recorder.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };

  const done = new Promise(resolve => recorder.onstop = resolve);
  recorder.start(250);

  const segmentCount = outputSeconds <= 15 ? 3 : outputSeconds <= 30 ? 4 : 5;
  const segmentSeconds = outputSeconds / segmentCount;
  const starts = buildSegmentStarts(sourceDuration, segmentCount, segmentSeconds);
  let rendered = 0;
  let raf = 0;

  for(let i=0; i<segmentCount; i++){
    const start = starts[i];
    onProgress(rendered / outputSeconds, i === 0 ? 'Sélection des temps forts...' : 'Assemblage des meilleurs moments...');
    await seekTo(video, start);
    await safePlay(video);

    const segmentStartTime = performance.now();
    await new Promise(resolve => {
      const draw = () => {
        drawVideoCover(ctx, video, canvas.width, canvas.height);
        drawOverlay(ctx, canvas.width, canvas.height);
        const elapsed = (performance.now() - segmentStartTime) / 1000;
        rendered = Math.min(outputSeconds, i * segmentSeconds + elapsed);
        onProgress(rendered / outputSeconds, rendered < outputSeconds * .7 ? 'Recadrage vertical 9:16...' : 'Finalisation du montage...');
        if(elapsed >= segmentSeconds || video.ended){
          resolve();
        }else{
          raf = requestAnimationFrame(draw);
        }
      };
      draw();
    });
    cancelAnimationFrame(raf);
    video.pause();
  }

  recorder.stop();
  await done;
  onProgress(1, 'Montage terminé.');
  return new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
}

function buildSegmentStarts(sourceDuration, count, segmentSeconds){
  if(sourceDuration <= segmentSeconds * count) return Array.from({length: count}, (_, i) => Math.max(0, i * segmentSeconds));
  const maxStart = Math.max(0, sourceDuration - segmentSeconds - .5);
  if(count === 1) return [0];
  return Array.from({length: count}, (_, i) => Math.min(maxStart, Math.max(0, (maxStart * i) / (count - 1))));
}

function drawVideoCover(ctx, video, w, h){
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.fillStyle = '#05030a';
  ctx.fillRect(0,0,w,h);
  ctx.drawImage(video, dx, dy, dw, dh);
}

function drawOverlay(ctx, w, h){
  const grad = ctx.createLinearGradient(0, h * .58, 0, h);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,.62)');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,w,h);
  ctx.fillStyle = 'rgba(255, 220, 110, .92)';
  ctx.font = '600 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '3px';
  ctx.fillText('KIZ MEMORY', w/2, h - 82);
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.font = '500 18px system-ui, sans-serif';
  ctx.fillText('DANCE · REMEMBER · FOREVER', w/2, h - 50);
}

function safePlay(video){
  const p = video.play();
  return p && typeof p.then === 'function' ? p.catch(() => {}) : Promise.resolve();
}
function seekTo(video, time){
  return new Promise(resolve => {
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = Math.min(Math.max(0, time), Math.max(0, (video.duration || 1) - .2));
    setTimeout(resolve, 1200);
  });
}
function once(el, event, timeout=8000){
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout ${event}`)), timeout);
    el.addEventListener(event, () => { clearTimeout(t); resolve(); }, { once: true });
  });
}
function wait(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

// RESULT
function syncResult(){
  durationLabel.textContent = `${state.duration}s`;
  const finalUrl = state.montageUrl || state.videoUrl;
  resultCard.classList.toggle('has-video', !!finalUrl);
  if(finalUrl) resultVideo.src = finalUrl;
  document.getElementById('resultType').textContent = state.montageUrl ? 'Vidéo générée' : 'Aperçu';
}

document.getElementById('playResultBtn').addEventListener('click', () => {
  if(!resultVideo.src){ toast('Importez une vidéo pour obtenir un vrai aperçu.'); return; }
  resultVideo.paused ? resultVideo.play() : resultVideo.pause();
});

async function nativeShare(text='Ma Memory Kiz Memory est prête ✨'){
  try{
    if(state.montageBlob && navigator.canShare){
      const file = new File([state.montageBlob], 'kiz-memory.webm', { type: state.montageBlob.type || 'video/webm' });
      if(navigator.canShare({ files: [file] })){ await navigator.share({ title:'Kiz Memory', text, files:[file] }); return; }
    }
    if(navigator.share) await navigator.share({ title:'Kiz Memory', text, url:location.href });
    else { await navigator.clipboard.writeText(location.href); toast('Lien copié.'); }
  }catch(e){}
}
document.getElementById('shareNative').addEventListener('click', () => nativeShare());
document.getElementById('shareInstagram').addEventListener('click', () => nativeShare('Memory prête pour Instagram ✨'));
document.getElementById('shareTiktok').addEventListener('click', () => nativeShare('Memory prête pour TikTok ✨'));
document.getElementById('shareWhatsapp').addEventListener('click', () => { location.href = `https://wa.me/?text=${encodeURIComponent('Ma Memory Kiz Memory est prête ✨ ' + location.href)}`; });

document.getElementById('downloadVideoBtn').addEventListener('click', () => {
  if(state.montageBlob){ downloadBlob(state.montageBlob, 'kiz-memory-montage.webm'); }
  else if(state.videoUrl){ toast('Montage non généré sur ce navigateur. Téléchargement de la source impossible depuis cet aperçu.'); }
  else toast('Aucune vidéo générée pour le moment.');
});
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function toast(message){
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
function escapeHtml(str){
  return String(str).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char]));
}
