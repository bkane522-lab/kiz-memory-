const state = {
  stream: null,
  recorder: null,
  chunks: [],
  recordedUrl: null,
  selectedDuration: 15,
  timer: null,
  seconds: 0,
  facingMode: 'environment'
};

const pages = Array.from(document.querySelectorAll('.page'));
const cameraVideo = document.getElementById('cameraVideo');
const cameraFrame = document.querySelector('.camera-frame');
const cameraEmpty = document.getElementById('cameraEmpty');
const recTime = document.getElementById('recTime');
const recordBtn = document.getElementById('recordBtn');
const fileInput = document.getElementById('fileInput');
const resultVideo = document.getElementById('resultVideo');
const resultCard = document.querySelector('.result-card');

function go(id){
  pages.forEach(p => p.classList.toggle('active', p.id === id));
  if(id === 'analysis') startAnalysis();
  if(id === 'generate') startGenerate();
  if(id === 'result') syncResult();
}

document.querySelectorAll('[data-go]').forEach(btn => {
  btn.addEventListener('click', () => go(btn.dataset.go));
});

document.getElementById('startCameraBtn').addEventListener('click', async () => {
  await startCamera();
  go('capture');
});

async function startCamera(){
  stopCamera();
  try{
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facingMode },
      audio: true
    });
    cameraVideo.srcObject = state.stream;
    cameraFrame.classList.add('live');
    cameraEmpty.textContent = '';
  }catch(err){
    cameraFrame.classList.remove('live');
    cameraEmpty.textContent = 'Caméra non autorisée';
    showToast('Caméra refusée. Vous pouvez importer une vidéo.');
  }
}

function stopCamera(){
  if(state.stream){
    state.stream.getTracks().forEach(t => t.stop());
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
  if(!track || !caps || !caps.torch){
    showToast('Torche non disponible sur ce navigateur.');
    return;
  }
  const current = track.getSettings().torch || false;
  try{
    await track.applyConstraints({ advanced: [{ torch: !current }] });
    showToast(!current ? 'Torche activée' : 'Torche désactivée');
  }catch{
    showToast('Impossible d’activer la torche.');
  }
});

recordBtn.addEventListener('click', () => {
  if(state.recorder && state.recorder.state === 'recording'){
    stopRecording();
  }else{
    startRecording();
  }
});

function startRecording(){
  if(!state.stream){
    showToast('Lancez la caméra ou importez une vidéo.');
    return;
  }
  try{
    state.chunks = [];
    state.recorder = new MediaRecorder(state.stream, { mimeType: pickMimeType() });
    state.recorder.ondataavailable = e => e.data.size && state.chunks.push(e.data);
    state.recorder.onstop = () => {
      const blob = new Blob(state.chunks, { type: state.recorder.mimeType || 'video/webm' });
      if(state.recordedUrl) URL.revokeObjectURL(state.recordedUrl);
      state.recordedUrl = URL.createObjectURL(blob);
      resultVideo.src = state.recordedUrl;
      stopTimer();
      recordBtn.classList.remove('recording');
      go('analysis');
    };
    state.recorder.start();
    recordBtn.classList.add('recording');
    startTimer();
  }catch(err){
    showToast('Enregistrement non supporté ici. Importez une vidéo.');
  }
}

function stopRecording(){
  if(state.recorder && state.recorder.state === 'recording') state.recorder.stop();
}

function pickMimeType(){
  const types = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function startTimer(){
  stopTimer();
  state.seconds = 0;
  recTime.textContent = '00:00:00';
  state.timer = setInterval(() => {
    state.seconds++;
    const h = String(Math.floor(state.seconds/3600)).padStart(2,'0');
    const m = String(Math.floor((state.seconds%3600)/60)).padStart(2,'0');
    const s = String(state.seconds%60).padStart(2,'0');
    recTime.textContent = `${h}:${m}:${s}`;
  }, 1000);
}
function stopTimer(){ clearInterval(state.timer); state.timer = null; }

fileInput.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if(!file) return;
  if(state.recordedUrl) URL.revokeObjectURL(state.recordedUrl);
  state.recordedUrl = URL.createObjectURL(file);
  resultVideo.src = state.recordedUrl;
  stopCamera();
  go('analysis');
});

document.getElementById('useDemoBtn').addEventListener('click', () => go('analysis'));

document.querySelectorAll('.mode-tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

function startAnalysis(){
  const circle = document.getElementById('progressCircle');
  const text = document.getElementById('progressText');
  const steps = [document.getElementById('step1'), document.getElementById('step2'), document.getElementById('step3')];
  const circumference = 326.7;
  let p = 0;
  circle.style.strokeDashoffset = circumference;
  text.textContent = '0%';
  steps.forEach((s,i)=>s.classList.toggle('on', i===0));

  const interval = setInterval(() => {
    p += 4;
    if(p > 100) p = 100;
    circle.style.strokeDashoffset = circumference - (circumference * p / 100);
    text.textContent = `${p}%`;
    if(p >= 35) steps[1].classList.add('on');
    if(p >= 72) steps[2].classList.add('on');
    if(p >= 100){
      clearInterval(interval);
      setTimeout(() => go('format'), 500);
    }
  }, 85);
}

document.querySelectorAll('.format-list button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.format-list button').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.selectedDuration = Number(btn.dataset.duration);
    document.getElementById('durationLabel').textContent = `${state.selectedDuration}s`;
  });
});

function startGenerate(){
  setTimeout(() => go('result'), 2100);
}

function syncResult(){
  document.getElementById('durationLabel').textContent = `${state.selectedDuration}s`;
  if(resultVideo.src){
    resultCard.classList.add('has-video');
  }else{
    resultCard.classList.remove('has-video');
  }
}

document.getElementById('playResultBtn').addEventListener('click', () => {
  if(!resultVideo.src){
    showToast('Aucune vidéo réelle. Importez ou filmez une vidéo.');
    return;
  }
  resultVideo.paused ? resultVideo.play() : resultVideo.pause();
});

async function nativeShare(text = 'Ma Memory Kiz Memory est prête ✨'){
  try{
    if(navigator.share){
      await navigator.share({ title:'Kiz Memory', text, url: location.href });
    }else{
      await navigator.clipboard.writeText(location.href);
      showToast('Lien copié.');
    }
  }catch(e){ }
}

document.getElementById('shareNative').addEventListener('click', () => nativeShare());
document.getElementById('shareInstagram').addEventListener('click', () => nativeShare('Prêt à partager sur Instagram ✨'));
document.getElementById('shareTiktok').addEventListener('click', () => nativeShare('Prêt à partager sur TikTok ✨'));
document.getElementById('shareWhatsapp').addEventListener('click', () => {
  const msg = encodeURIComponent('Ma Memory Kiz Memory est prête ✨ ' + location.href);
  location.href = `https://wa.me/?text=${msg}`;
});

document.getElementById('downloadBtn').addEventListener('click', () => {
  const data = {
    app: 'Kiz Memory',
    version: 'V3.3 reset PNG only',
    format: 'Vertical 9:16',
    duration: `${state.selectedDuration}s`,
    note: 'Prototype front-end. Le vrai montage MP4 automatique sera ajouté ensuite.'
  };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kiz-memory-recap.json';
  a.click();
  URL.revokeObjectURL(url);
});

function showToast(message){
  const old = document.querySelector('.toast');
  if(old) old.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position:'fixed', left:'50%', bottom:'92px', transform:'translateX(-50%)', zIndex:9999,
    padding:'12px 16px', borderRadius:'14px', background:'rgba(0,0,0,.82)', color:'#fff',
    border:'1px solid rgba(255,255,255,.18)', fontWeight:'800', maxWidth:'86vw', textAlign:'center'
  });
  document.body.appendChild(toast);
  setTimeout(()=>toast.remove(), 2400);
}
