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
    this.passthrough = null;
    this.silentProcess = null;
    this.run();
  }

  async run() {
    this.passthrough = new PassThrough();
    const currentTrack = this.selectRandomTrack();
    const filepath = `./library/${currentTrack}`;
    this.filterProcess = this.startFilterProcess(filepath);
    this.silentProcess = this.startSilentProcess();
    console.log(`Now playing: ${currentTrack}`);

    this.passthrough.pipe(this.filterProcess.stdin);

    this.filterProcess.on('close', () => this.stop());
    this.filterProcess.on('error', () => this.stop());
    this.filterProcess.stdout.pipe(this.broadcast);
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
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo',
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      '-ar', '44100',
      '-ac', '2',
      'pipe:1'
    ]);
    this.silentProcess.stdout.pipe(this.passthrough, { end: false });
    return this.silentProcess;
  }

  startFilterProcess(filepath) {
    return spawn('ffmpeg',[
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
      '[compressed_main][vocals_for_mix]amix=inputs=2:duration=longest[mix];',
      '-map', '[mix]',
      '-ac', '2',
      '-b:a', '196k',
      '-ar', '48000',
      '-f', 'mp3',
      'pipe:1'
    ]);
  }

  triggerVoiceProcess = () => {
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
      this.startSilentProcess();
    });
  }

  stop() {
    console.log('Stopping...');
    if (this.ffmpeg) {
      this.ffmpeg.kill();
      this.ffmpeg = null;
    }
    this.run();
  }
}

export default Radio;
