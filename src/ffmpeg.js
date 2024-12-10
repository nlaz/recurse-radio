import { spawn } from 'child_process';

const THRESHOLD = 0.02;
const RATIO = 4;
const ATTACK = 10;
const RELEASE = 400;

const logProcess = (name, ps) => {
  if (process.env.LOG_LEVEL !== "verbose") return ps;

  console.log(`[${name}] Process started with PID: ${ps.pid}`);

  ps.stderr.on('data', (data) => {
    console.error(`[${name}] stderr: ${data.toString()}`);
  });

  ps.on('close', (code) => {
    console.log(`[${name}] Process exited with code ${code}`);
  });

  ps.on('error', (error) => {
    console.error(`[${name}] Process error: ${error.message}`);
  });

  return ps;
};

export const startSystemAudioProcess = () => {
  // prettier-ignore
  const ps = spawn('ffplay', [
     '-f', 'mp3',
     '-ar', '48000',
     '-ac', '2',
     '-i', 'pipe:0',
     '-af', 'volume=0.3',
     '-nodisp'
   ]);
   return logProcess('SystemAudio', ps);
};

export const startSilentProcess = () => {
  // prettier-ignore
  const ps = spawn('ffmpeg', [
      '-re',
      '-stream_loop', '-1',
      '-i', './lib/silent.mp3',
      '-f', 'mp3',
      '-ar', '22050',
      '-ac', '1',
      'pipe:1',
    ]);
    return logProcess('Silent', ps);
};

export const startFilterProcess = (filepath) => {
  // prettier-ignore
  const ps = spawn('ffmpeg', [
    '-re',
    '-f', 'mp3',
    '-i', 'pipe:0',
    '-f', 'mp3',
    '-re',
    '-i', filepath,
    '-filter_complex',
    `[0:a]asplit=2[vocals_for_sidechain][vocals_for_mix];` +
    `[1:a][vocals_for_sidechain]sidechaincompress=threshold=${THRESHOLD}:ratio=${RATIO}:attack=${ATTACK}:release=${RELEASE}[compressed_main];` +
    '[compressed_main][vocals_for_mix]amix=inputs=2:duration=shortest[mix]',
    '-map', '[mix]',
    '-ac', '2',
    '-b:a', '196k',
    '-ar', '48000',
    '-f', 'mp3',
    'pipe:1',
  ]);
  return logProcess('Filter', ps);
};

export const startVoiceProcess = () => {
  // prettier-ignore
  const ps =  spawn('ffmpeg', [
    '-i', './lib/bumper.mp3',
    '-f', 'mp3',
    '-ar', '22050',
    '-ac', '2',
    'pipe:1'
  ]);

  return logProcess('Voice', ps);
};

export const startPiperVoiceProcess = () => {
  // prettier-ignore
  const ps = spawn('ffmpeg', [
    '-f', 's16le',
    '-ar', '22050',
    '-ac', '1',
    '-i', 'pipe:0',
    '-af', 'adelay=400',
    '-f', 'mp3',
    '-ar', '22050',
    '-ac', '1',
    'pipe:1'
  ]);
  return logProcess('PiperVoice', ps);
};

export const killProcess = (process) => {
  if (!process) return;

  try {
    process.stdin?.destroy();
    process.stdout?.destroy();
    process.stderr?.destroy();
    process.kill('SIGKILL');
  } catch (error) {
    console.error('Error killing process:', error);
  }
};
