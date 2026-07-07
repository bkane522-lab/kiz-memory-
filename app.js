const state = { duration: 30, videoUrl: null };
const screens = [...document.querySelectorAll('.screen')];

function go(id){
  screens.forEach(s => s.classList.toggle('active', s.id === id));
  if(id === 'analysis') runAnalysis();
  if(id === 'timeline') buildWave();
  if(id === 'export') syncExport();
}

document.querySelectorAll('[data-go]').forEach(el => {
  el.addEventListener('click', () => go(el.dataset.go));
});

const videoInput = document.getElementById('videoInput');
const selectedVideo = document.getElementById('selectedVideo');
const sourceVideo = document.getElementById('sourceVideo');
const fileName = document.getElementById('fileName');
const fileInfo = document.getElementById('fileInfo');
const analyzeBtn = document.getElementById('analyzeBtn');

videoInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if(!file) return;
  if(state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = URL.createObjectURL(file);
  sourceVideo.src = state.videoUrl;
  fileName.textContent = file.name;
  fileInfo.textContent = `${formatBytes(file.size)} · prête pour analyse IA`;
  selectedVideo.classList.remove('hidden');
  analyzeBtn.disabled = false;
  analyzeBtn.classList.remove('disabled');
});

analyzeBtn.addEventListener('click', () => go('analysis'));
document.getElementById('recordBtn').addEventListener('click', () => go('analysis'));
document.getElementById('skipAnalysis').addEventListener('click', () => go('timeline'));

let alreadyAnalysed = false;
function runAnalysis(){
  if(alreadyAnalysed) return;
  alreadyAnalysed = true;
  const targets = [85,72,64,40];
  const bars = ['a1','a2','a3','a4'].map(id => document.getElementById(id));
  const percents = ['p1','p2','p3','p4'].map(id => document.getElementById(id));
  let v = 0;
  const timer = setInterval(() => {
    v += 5;
    targets.forEach((t,i) => {
      const value = Math.min(t, Math.round(t * v / 100));
      bars[i].style.width = value + '%';
      percents[i].textContent = value + '%';
    });
    if(v >= 100){
      clearInterval(timer);
      setTimeout(() => go('timeline'), 650);
    }
  }, 90);
}

function buildWave(){
  const wave = document.getElementById('waveBars');
  if(wave.children.length) return;
  for(let i=0;i<38;i++){
    const bar = document.createElement('i');
    const h = 22 + Math.round(Math.abs(Math.sin(i * .65)) * 130) + (i % 7 === 0 ? 35 : 0);
    bar.style.height = h + 'px';
    wave.appendChild(bar);
  }

  const clipRow = document.getElementById('clipRow');
  const times = ['00:08','00:12','00:18','00:24','00:31','00:39','00:48','00:55'];
  clipRow.innerHTML = times.map((t,i) => `<article class="clip" style="filter:hue-rotate(${i*22}deg)"><b>${t}</b></article>`).join('');
}

document.querySelectorAll('.format-list [data-duration]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.format-list [data-duration]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.duration = Number(btn.dataset.duration);
    syncExport();
  });
});

function syncExport(){
  const meta = document.getElementById('exportMeta');
  if(meta) meta.textContent = `Reel 9:16 · ${state.duration}s`;
}

document.getElementById('downloadCard').addEventListener('click', () => {
  const data = {
    app: 'Kiz Memory',
    format: 'vertical 9:16',
    duration: `${state.duration}s`,
    screens: ['Accueil', 'Capture intelligente', 'Importer', 'Analyse IA', 'Timeline magique', 'Vibe Score', 'Workshop Brain', 'Studio recap'],
    note: 'Prototype visuel fidèle à la maquette. Le vrai export MP4 demande un moteur vidéo.'
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kiz-memory-recap.json';
  a.click();
  URL.revokeObjectURL(url);
});

function formatBytes(bytes){
  if(!bytes) return '0 octet';
  const units = ['octets','Ko','Mo','Go'];
  const i = Math.min(Math.floor(Math.log(bytes)/Math.log(1024)), units.length-1);
  return `${(bytes/Math.pow(1024,i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

buildWave();
