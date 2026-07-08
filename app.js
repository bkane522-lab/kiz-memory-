const state = {
  stream: null,
  recorder: null,
  chunks: [],
  videoUrl: null,
  duration: 15,
  timer: null,
  seconds: 0,
  facingMode: 'environment',
  analysing: false
};

const pages = [...document.querySelectorAll('.page')];
const cameraVideo = document.getElementById('cameraVideo');
const cameraPreview = document.querySelector('.camera-preview');
const cameraEmpty = document.getElementById('cameraEmpty');
const recTime = document.getElementById('recTime');
const recordBtn = document.getElementById('recordBtn');
const resultVideo = document.getElementById('resultVideo');
const resultCard = document.getElementById('resultCard');

function go(id){
  pages.forEach(page => page.classList.toggle('active', page.id === id));
  if(id === 'analysis') startAnalysis();
  if(id === 'generate') startGenerate();
  if(id === 'result') syncResult();
  if(id !== 'capture' && id !== 'analysis') stopRecordingTimerOnly();
}

document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.go)));

document.getElementById('startCameraBtn').addEventListener('click', async () => {
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
    cameraEmpty.innerHTML = '<span>📷</span><b>Caméra refusée</b>';
    toast('Caméra refusée. Vous pouvez importer une vidéo.');
  }
}
function stopCamera(){
  if(state.stream){ state.stream.getTracks().forEach(track => track.stop()); state.stream = null; }
}

document.getElementById('switchCamBtn').addEventListener('click', async () => {
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  await startCamera();
});

document.getElementById('torchBtn').addEventListener('click', async () => {
  const track = state.stream?.getVideoTracks?.()[0];
  const caps = track?.getCapabilities?.();
  if(!track || !caps || !caps.torch){ toast('Torche non disponible ici.'); return; }
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
    const options = pickMimeType() ? { mimeType: pickMimeType() } : undefined;
    state.recorder = new MediaRecorder(state.stream, options);
    state.recorder.ondataavailable = e => { if(e.data.size) state.chunks.push(e.data); };
    state.recorder.onstop = () => {
      const blob = new Blob(state.chunks, { type: state.recorder.mimeType || 'video/webm' });
      setVideoUrl(URL.createObjectURL(blob));
      stopTimer();
      recordBtn.classList.remove('recording');
      go('analysis');
    };
    state.recorder.start();
    recordBtn.classList.add('recording');
    startTimer();
  }catch(e){ toast('Enregistrement non supporté. Importez une vidéo.'); }
}
function stopRecording(){ if(state.recorder?.state === 'recording') state.recorder.stop(); }
function pickMimeType(){ return ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || ''; }
function startTimer(){
  stopTimer(); state.seconds = 0; recTime.textContent = '00:00';
  state.timer = setInterval(() => { state.seconds++; const m = String(Math.floor(state.seconds/60)).padStart(2,'0'); const s = String(state.seconds%60).padStart(2,'0'); recTime.textContent = `${m}:${s}`; }, 1000);
}
function stopTimer(){ clearInterval(state.timer); state.timer = null; }
function stopRecordingTimerOnly(){ if(!state.recorder || state.recorder.state !== 'recording') stopTimer(); }

function handleFile(file){
  if(!file) return;
  setVideoUrl(URL.createObjectURL(file));
  stopCamera();
  go('analysis');
}
document.getElementById('fileInput').addEventListener('change', e => handleFile(e.target.files?.[0]));
document.getElementById('fileInputCamera').addEventListener('change', e => handleFile(e.target.files?.[0]));
document.getElementById('useDemoBtn').addEventListener('click', () => go('analysis'));

function setVideoUrl(url){
  if(state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = url;
  resultVideo.src = url;
}

document.querySelectorAll('.camera-modes button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.camera-modes button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

function startAnalysis(){
  if(state.analysing) return;
  state.analysing = true;
  const circle = document.getElementById('progressCircle');
  const text = document.getElementById('progressText');
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const step3 = document.getElementById('step3');
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
    if(p >= 38) step2.classList.add('active');
    if(p >= 72) step3.classList.add('active');
    if(p === 100){
      clearInterval(interval);
      state.analysing = false;
      setTimeout(() => go('format'), 450);
    }
  }, 75);
}

document.querySelectorAll('.format-list button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.format-list button').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.duration = Number(btn.dataset.duration);
    document.getElementById('durationLabel').textContent = `${state.duration}s`;
  });
});
function startGenerate(){ setTimeout(() => go('result'), 1900); }
function syncResult(){
  document.getElementById('durationLabel').textContent = `${state.duration}s`;
  resultCard.classList.toggle('has-video', !!state.videoUrl);
}

document.getElementById('playResultBtn').addEventListener('click', () => {
  if(!state.videoUrl){ toast('Démo visuelle : filmez ou importez une vidéo pour lire un vrai aperçu.'); return; }
  resultVideo.paused ? resultVideo.play() : resultVideo.pause();
});
async function nativeShare(text='Ma Memory Kiz Memory est prête ✨'){
  try{
    if(navigator.share) await navigator.share({ title:'Kiz Memory', text, url:location.href });
    else { await navigator.clipboard.writeText(location.href); toast('Lien copié.'); }
  }catch(e){}
}
document.getElementById('shareNative').addEventListener('click', () => nativeShare());
document.getElementById('shareInstagram').addEventListener('click', () => nativeShare('Prêt à publier sur Instagram ✨'));
document.getElementById('shareTiktok').addEventListener('click', () => nativeShare('Prêt à publier sur TikTok ✨'));
document.getElementById('shareWhatsapp').addEventListener('click', () => { location.href = `https://wa.me/?text=${encodeURIComponent('Ma Memory Kiz Memory est prête ✨ ' + location.href)}`; });
document.getElementById('downloadBtn').addEventListener('click', () => {
  const data = { app:'Kiz Memory', version:'V3.5 UX Flow Clean', format:'Vertical 9:16', duration:`${state.duration}s`, note:'Prototype front-end. La vraie génération vidéo MP4 sera ajoutée ensuite.' };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'kiz-memory-recap.json'; a.click(); URL.revokeObjectURL(url);
});
function toast(message){
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = message;
  document.body.appendChild(el); setTimeout(()=>el.remove(), 2300);
}
