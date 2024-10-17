import fs from 'fs';
import Broadcast from './broadcast.js';
import { spawn } from 'child_process';
import { PassThrough } from 'stream';

const THRESHOLD = 0.02;
const RATIO = 4;
const ATTACK = 20;
const RELEASE = 300;

class Radio {
  constructor() {
    this.ffmpeg = null;
    this.broadcast = new Broadcast();
    this.audioStream = null;
    this.currentTrack = null;
    this.start();
  }

  async start() {
    try {
      this.passthrough = new PassThrough();
      const currentTrack = this.selectRandomTrack();
      const filepath = `./library/${currentTrack}`;
      this.filterProcess = this.startFilterProcess(filepath);
      this.silentProcess = this.startSilentProcess();
      console.log(`Now playing: ${currentTrack}`);
      this.passthrough.pipe(this.filterProcess.stdin);

      this.filterProcess.stdout.pipe(this.broadcast);
    } catch (error) {
      console.error(error);
    }
  }

  selectRandomTrack() {
    const files = fs.readdirSync('./library');
    return files[Math.floor(Math.random() * files.length)];
  }

  subscribe() {
    return this.broadcast.subscribe();
  }

  unsubscribe(id) {
    this.broadcast.unsubscribe(id);
  }

  startSilentProcess() {
    this.silentProcess = spawn('ffmpeg', [
      '-re',
      '-stream_loop', '-1',
      '-i', './lib/silence.mp3',
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      '-ar', '44100',
      '-ac', '2',
      'pipe:1'
    ]);

    this.silentProcess.stdout.pipe(this.passthrough, { end: false });
    this.silentProcess.on('error', console.error);

    return this.silentProcess;
  }

  startFilterProcess(filepath) {
    this.filterProcess = spawn('ffmpeg', [
      '-re',
      '-f', 's16le',
      '-ar', '44100',
      '-ac', '2',
      '-i', 'pipe:0',
      '-f', 'mp3',
      '-re', 
      '-i', filepath,
      '-filter_complex',
      '[0:a]asplit=2[vocals_for_sidechain][vocals_for_mix];' +
      `[1:a][vocals_for_sidechain]sidechaincompress=threshold=${THRESHOLD}:ratio=${RATIO}:attack=${ATTACK}:release=${RELEASE}[compressed_main];` +
      '[compressed_main][vocals_for_mix]amix=inputs=2:duration=longest[mix]',
      '-map', '[mix]',
      '-ac', '2',
      '-b:a', '196k',
      '-ar', '48000',
      '-f', 'mp3',
      'pipe:1'
    ]);

    this.filterProcess.on('error', console.error);
    this.filterProcess.on('close', (code) => {
      console.log(`Filter process closed...`);
      this.stop();
    });

    return this.filterProcess;
  }

  startVoiceProcess() {
    console.log('Starting voice process...');
    if (this.silentProcess) {
      this.silentProcess.kill();
    }

    this.voiceProcess = spawn('ffmpeg', [
      '-i', './lib/bumper.mp3',
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      '-filter_complex', 'adelay=500[delayed]',
      '-map', '[delayed]',
      '-ar', '44100',
      '-ac', '2',
      'pipe:1'
    ]);
  
    this.voiceProcess.stdout.pipe(this.passthrough, { end: false });
  
    this.voiceProcess.on('close', (code) => {
      console.log(`Voice process closed with code ${code}`);
      this.startSilentProcess();
    });

    this.voiceProcess.on('error', console.error);
  }

  startPiperProcess(message) {
    if (!message) {
      console.error('No message provided to piper process');
      return;
    }
    const model = "en_US-kristin-medium.onnx";
    const command = `echo "${message}" | piper --model models/${model} --output_raw`;
    
    this.piperProcess = spawn('sh', ['-c', command]);

    this.voiceProcess = spawn('ffmpeg', [
      '-f', 's16le',
      '-ar', '22050',
      '-ac', '1',
      '-i', 'pipe:0',
      '-acodec', 'pcm_s16le',
      '-ar', '44100',
      '-ac', '2',
      '-f', 's16le',
      'pipe:1'
    ]);

    this.piperProcess.stdout.pipe(this.voiceProcess.stdin);

    let silentProcessKilled = false;

    this.voiceProcess.stdout.on('data', (data) => {
      if (!silentProcessKilled && this.silentProcess) {
        this.silentProcess.kill();
        silentProcessKilled = true;
      }
      this.passthrough.write(data);
    });
  
    this.voiceProcess.on('close', this.startSilentProcess());
  }
  
  triggerVoiceProcess = (message) => {
    console.log('Triggering voice process...');
    if (process.env.NODE_ENV === 'production') {
      this.startPiperProcess(message);
    } else {
      this.startVoiceProcess();
    }
  }

  stop() {
    console.log('Stopping...');
    this.run();
  }
}

export default Radio;