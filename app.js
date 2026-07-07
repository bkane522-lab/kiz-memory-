const screens = [...document.querySelectorAll('.screen')];
const navButtons = [...document.querySelectorAll('[data-nav]')];
const bottomButtons = [...document.querySelectorAll('.bottom-nav button')];
const clipTimes = ['00:08','00:06','00:07','00:05','00:12','00:09','00:14','00:11','00:18','00:21','00:24','00:30'];
const bigWave = document.getElementById('bigWave');
const clipStrip = document.getElementById('clipStrip');
const editGrid = document.getElementById('editGrid');
const videoFile = document.getElementById('videoFile');
const fileLabel = document.getElementById('fileLabel');
const fileMeta = document.getElementById('fileMeta');

function go(id){
  screens.forEach(s => s.classList.toggle('active', s.id === id));
  bottomButtons.forEach(b => b.classList.toggle('active', b.dataset.nav === id));
  window.scrollTo(0,0);
}

navButtons.forEach(btn => btn.addEventListener('click', () => go(btn.dataset.nav)));

document.getElementById('importBtn').addEventListener('click', () => go('analysis'));
document.getElementById('sampleFile').addEventListener('click', () => go('analysis'));

videoFile.addEventListener('change', e => {
  const file = e.target.files[0];
  if(!file) return;
  fileLabel.textContent = file.name;
  fileMeta.textContent = `${formatBytes(file.size)} · prêt pour analyse`;
  go('analysis');
});

function buildWave(){
  if(!bigWave) return;
  const values = [35,70,42,108,62,126,46,88,34,112,150,72,38,93,44,132,58,86,31,115,60,98,40,72,36,128,57,81,33,104,67,145,44,91,52,118];
  bigWave.innerHTML = values.map((h,i)=>`<span class="bar" style="height:${h}px;opacity:${.45 + (i%5)*.1}"></span>`).join('');
}

function buildClips(){
  if(clipStrip){
    clipStrip.innerHTML = clipTimes.slice(0,4).map((t,i)=>`<span class="clip-mini" style="filter:hue-rotate(${i*28}deg)"><small>${t}</small></span>`).join('');
  }
  if(editGrid){
    editGrid.innerHTML = clipTimes.map((t,i)=>`<span class="clip-mini" style="filter:hue-rotate(${i*23}deg)"><small>${t}</small></span>`).join('');
  }
}

function formatBytes(bytes){
  const units=['octets','Ko','Mo','Go'];
  if(!bytes) return '0 octet';
  const i=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),units.length-1);
  return `${(bytes/Math.pow(1024,i)).toFixed(i?1:0)} ${units[i]}`;
}

['titleInput','dateInput','placeInput'].forEach(id => {
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('input', syncCover);
});

function syncCover(){
  const title = document.getElementById('titleInput')?.value || 'Kizomba Night';
  const date = document.getElementById('dateInput')?.value || '12 juillet 2024';
  const place = document.getElementById('placeInput')?.value || 'Paris, France';
  const coverTitle = document.getElementById('coverTitle');
  const coverMeta = document.getElementById('coverMeta');
  if(coverTitle) coverTitle.textContent = title;
  if(coverMeta) coverMeta.textContent = `${date} · ${place}`;
}

// Sélection visuelle des formats et styles
[...document.querySelectorAll('.format-stack button, .style-stack button')].forEach(btn => {
  btn.addEventListener('click', () => {
    const parent = btn.parentElement;
    [...parent.children].forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

buildWave();
buildClips();
syncCover();
