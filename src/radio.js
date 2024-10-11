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
    try {
      this.passthrough = new PassThrough();
      const currentTrack = this.selectRandomTrack();
      const filepath = `./library/${currentTrack}`;
      this.filterProcess = this.startFilterProcess(filepath);
      this.silentProcess = this.startSilentProcess();
      console.log(`Now playing: ${currentTrack}`);
      this.passthrough.pipe(this.filterProcess.stdin);

      this.filterProcess.on('close', (code) => {
        console.log(`Filter process closed with code ${code}`);
        this.stop();
      });

      this.filterProcess.on('error', (error) => {
        console.error('Filter process error:', error);
      });

      this.filterProcess.stdout.pipe(this.broadcast);
    } catch (error) {
      console.error('Error in run method:', error);
    }
  }

  selectRandomTrack() {
    try {
      const files = fs.readdirSync('./library');
      return files[Math.floor(Math.random() * files.length)];
    } catch (error) {
      console.error('Error selecting random track:', error);
      return null;
    }
  }

  subscribe() {
    return this.broadcast.subscribe();
  }

  unsubscribe(id) {
    this.broadcast.unsubscribe(id);
  }

  startSilentProcess() {
    try {
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

      this.silentProcess.on('error', (error) => {
        console.error('Silent process error:', error);
      });

      this.silentProcess.stderr.on('data', (data) => {
        console.error('Silent process stderr:', data.toString());
      });

      return this.silentProcess;
    } catch (error) {
      console.error('Error starting silent process:', error);
      return null;
    }
  }

  startFilterProcess(filepath) {
    try {
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

      this.filterProcess.on('error', (error) => {
        console.error('Filter process error:', error);
      });

      this.filterProcess.stderr.on('data', (data) => {
        console.error('FFmpeg stderr:', data.toString());
      });

      this.filterProcess.on('close', (code, signal) => {
        console.log(`Filter process closed with code ${code} and signal ${signal}`);
        if (code !== 0) {
          console.error('FFmpeg process exited with non-zero code. Check the stderr output above for details.');
        }
      });

      return this.filterProcess;
    } catch (error) {
      console.error('Error starting filter process:', error);
      return null;
    }
  }

  startVoiceProcess() {
    console.log('Starting voice process...');
    try {
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

      this.voiceProcess.on('error', (error) => {
        console.error('Voice process error:', error);
      });
    } catch (error) {
      console.error('Error starting voice process:', error);
    }
  }

  startPiperProcess() {
    try {
      const text = "Now playing: Radio Paradise";
      const model = "en_US-kristin-medium.onnx";
      this.piperProcess = spawn(`echo '${text} | piper --model models/${model} --output_raw`);
    
      this.piperProcess.stdout.pipe(this.passthrough, { end: false });
    
      this.piperProcess.on('close', (code) => {
        console.log(`Piper process closed with code ${code}`);
        this.startSilentProcess();
      });

      this.piperProcess.on('error', (error) => {
        console.error('Piper process error:', error);
      });
    } catch (error) {
      console.error('Error starting piper process:', error);
    }
  }
  
  triggerVoiceProcess = () => {
    console.log('Triggering voice process...');
    if (this.silentProcess) {
      this.silentProcess.kill();
    }
  
    if (process.env.NODE_ENV === 'production') {
      this.startPiperProcess();
    } else {
      this.startVoiceProcess();
    }
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