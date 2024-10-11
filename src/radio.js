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

      this.filterProcess.on('close', (code, signal) => {
        console.log(`Filter process closed with code ${code} and signal ${signal}`);
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

      this.voiceProcess.on('error', (error) => {
        console.error('Voice process error:', error);
      });
    } catch (error) {
      console.error('Error starting voice process:', error);
    }
  }

  startPiperProcess(message) {
    try {
      if (!message) {
        console.error('No message provided to piper process');
        return;
      }
      const model = "en_US-kristin-medium.onnx";
      const command = `echo "${message}" | piper --model models/${model} --output_raw`;
      
      this.piperProcess = spawn('sh', ['-c', command]);

      this.ffmpegPiperProcess = spawn('ffmpeg', [
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

      this.piperProcess.stdout.pipe(this.ffmpegPiperProcess.stdin);

      let silentProcessKilled = false;

      this.ffmpegPiperProcess.stdout.on('data', (data) => {
        if (!silentProcessKilled && this.silentProcess) {
          console.log('Received data from FFmpeg Piper process, killing silentProcess');
          this.silentProcess.kill();
          silentProcessKilled = true;
        }
        this.passthrough.write(data);
      });
    
      this.piperProcess.on('close', (code) => {
        console.log(`Piper process closed with code ${code}`);
      });

      this.ffmpegPiperProcess.on('close', (code) => {
        console.log(`FFmpeg Piper process closed with code ${code}`);
        this.startSilentProcess();
      });

      this.piperProcess.on('error', (error) => {
        console.error('Piper process error:', error);
      });

      this.ffmpegPiperProcess.on('error', (error) => {
        console.error('FFmpeg Piper process error:', error);
      });
    } catch (error) {
      console.error('Error starting piper process:', error);
    }
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
    if (this.ffmpeg) {
      this.ffmpeg.kill();
      this.ffmpeg = null;
    }
    this.run();
  }
}

export default Radio;