const screens = [...document.querySelectorAll('.screen')];
const goButtons = [...document.querySelectorAll('[data-go]')];
const startBtn = document.querySelector('#startBtn');
const cameraVideo = document.querySelector('#cameraVideo');
const cameraEmpty = document.querySelector('#cameraEmpty');
const recordBtn = document.querySelector('#recordBtn');
const flashBtn = document.querySelector('#flashBtn');
const timer = document.querySelector('#timer');
let stream = null;
let recording = false;
let startedAt = 0;
let timerInterval = null;

function go(id) {
  screens.forEach(screen => screen.classList.toggle('active', screen.id === id));
  if (id === 'capture') startCamera();
}

startBtn.addEventListener('click', () => go('entry'));
goButtons.forEach(button => button.addEventListener('click', () => go(button.dataset.go)));

document.querySelectorAll('.mode-switch button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.mode-switch button').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
  });
});

document.querySelectorAll('.format-list button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.format-list button').forEach(item => item.classList.remove('selected'));
    button.classList.add('selected');
  });
});

async function startCamera() {
  if (stream) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
    cameraVideo.srcObject = stream;
    cameraEmpty.style.display = 'none';
  } catch (error) {
    cameraEmpty.innerHTML = '<span>Caméra non autorisée<br>Vous pouvez importer une vidéo.</span>';
  }
}

recordBtn.addEventListener('click', () => {
  recording = !recording;
  if (recording) {
    startedAt = Date.now();
    timerInterval = setInterval(updateTimer, 250);
    recordBtn.style.filter = 'hue-rotate(100deg)';
  } else {
    clearInterval(timerInterval);
    recordBtn.style.filter = '';
    go('analysis');
  }
});

flashBtn.addEventListener('click', async () => {
  const track = stream?.getVideoTracks?.()[0];
  const capabilities = track?.getCapabilities?.();
  if (!track || !capabilities?.torch) {
    flashBtn.textContent = '×';
    setTimeout(() => flashBtn.textContent = 'ϟ', 900);
    return;
  }
  const isOn = flashBtn.dataset.on === 'true';
  await track.applyConstraints({ advanced: [{ torch: !isOn }] });
  flashBtn.dataset.on = String(!isOn);
});

function updateTimer() {
  const total = Math.floor((Date.now() - startedAt) / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  timer.textContent = `${h}:${m}:${s}`;
}
