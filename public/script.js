const audio = document.getElementById('audio');
const icon = document.getElementById('icon');
const marquee = document.getElementById('marquee');
const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');

let audioContext;
let analyser;
let animationId;
let isAnalyzerInitialized = false;

const updateTrack = () => {
  if (audio.paused) return;
  fetch('/info').then(data => data.json()).then(data => {
    marquee.innerText = `Currently playing: ${data.currentTrack.replace('.mp3', '')}`;
  });
}

const nextTrack = () => {
  console.log('nextTrack');
  fetch('/next', { method: 'POST' });
}

const initializeAnalyzer = () => {
  if (isAnalyzerInitialized) return;

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  const audioSource = audioContext.createMediaElementSource(audio);
  audioSource.connect(analyser);
  analyser.connect(audioContext.destination);

  isAnalyzerInitialized = true;
}

const drawVisualizer = () => {
  if (!analyser) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const barWidth = (canvas.width / bufferLength) * 2.5;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const barHeight = (dataArray[i] / 255) * canvas.height;

    const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
    gradient.addColorStop(0, 'rgba(22, 163, 74, 0.8)'); // Green-600
    gradient.addColorStop(1, 'rgba(22, 163, 74, 0.4)');

    ctx.fillStyle = gradient;
    ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

    x += barWidth + 1;
  }

  animationId = requestAnimationFrame(drawVisualizer);
}

const playAudio = () => {
  if (audio.paused) {
    audio.play();
    initializeAnalyzer();
    updateTrack();
    drawVisualizer();
  } else {
    audio.pause();
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
  }
}

setInterval(updateTrack, 5000);

audio.addEventListener('play', () => {
  icon.src = "icons/pause-fill.svg";
});

audio.addEventListener('pause', () => {
  icon.src = "icons/play-fill.svg";
});

ctx.fillStyle = 'white';
ctx.fillRect(0, 0, canvas.width, canvas.height);
