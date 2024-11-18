const audio = document.getElementById('audio');

const playAudio = () => {
  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
}
