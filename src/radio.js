import Broadcast from './broadcast.js';
import { spawn } from 'child_process';
import { PassThrough, pipeline } from 'stream';
import { selectRandomTrack } from './utils.js';
import * as ffmpeg from './ffmpeg.js';

class Radio {
  constructor() {
    this.broadcast = new Broadcast();
    this.currentTrack = null;
    this.filter = null;
    this.silent = null;
    this.passthrough = null;
    this.system = null;
    this.start();
  }

  async start() {
    try {
      await this.initializeStreams();
      await this.setupPipelines();
    } catch (error) {
      console.error('Start error:', error);
      await this.stop();
    }
  }

  async initializeStreams() {
    this.passthrough = new PassThrough();
    const { currentTrack, filepath } = selectRandomTrack();

    this.filter = this.startFilterProcess(filepath);
    this.silent = this.startSilentProcess();
    this.system = this.startSystemAudioProcess();

    console.log(`Now playing: ${currentTrack}`, new Date());
  }

  async setupPipelines() {
    const outputStream = new PassThrough();

    await Promise.all([
      this.createPipeline(this.passthrough, this.filter.stdin),
      this.createPipeline(this.filter.stdout, outputStream),
      this.createPipeline(outputStream, this.broadcast),
      // this.createPipeline(outputStream, this.system.stdin)
    ]);
  }

  createPipeline(source, destination) {
    return new Promise((resolve, reject) => {
      pipeline(source, destination, (err) => {
        if (err) {
          console.error('Pipeline error:', err);
          reject(err);
        }
        resolve();
      });
    });
  }

  subscribe() {
    return this.broadcast.subscribe();
  }

  unsubscribe(id) {
    this.broadcast.unsubscribe(id);
  }

  startSystemAudioProcess() {
    const systemAudioProcess = ffmpeg.startSystemAudioProcess();
    systemAudioProcess.on('error', console.error);
    return systemAudioProcess;
  }

  startSilentProcess() {
    this.silentProcess = ffmpeg.startSilentProcess();

    this.silentProcess.stdout.pipe(this.passthrough, { end: false });
    this.silentProcess.on('error', console.error);

    return this.silentProcess;
  }

  startFilterProcess(filepath) {
    if (this.filterProcess) {
      this.filterProcess.kill('SIGKILL');
    }
    this.filterProcess = ffmpeg.startFilterProcess(filepath);

    this.filterProcess.on('error', console.error);
    this.filterProcess.on('close', () => this.stop());

    return this.filterProcess;
  }

  startVoiceProcess() {
    console.log('Starting voice process...');
    if (this.silentProcess) {
      this.silentProcess.kill();
    }

    this.voiceProcess = ffmpeg.startVoiceProcess();
    this.voiceProcess.stdout.pipe(this.passthrough, { end: false });
    this.voiceProcess.on('close', () => this.startSilentProcess());
    this.voiceProcess.on('error', console.error);
  }

  startPiperProcess(message = '', model = 'kristin') {
    const command = `echo "${message}" | piper --model models/${model}.onnx --output_raw`;
    this.piper = spawn('sh', ['-c', command]);
    this.setupPiperProcessHandlers();
  }

  setupPiperProcessHandlers() {
    this.voice = ffmpeg.startVoiceProcess();
    this.piper.stdout.pipe(this.voice.stdin);
    this.silentProcessKilled = false;

    this.voice.stdout.on('data', (data) => writeVoiceToPassthrough(data));
    this.voice.on('close', () => this.startSilentProcess());
  }

  writeVoiceToPassthrough = (data) => {
    if (!this.silentProcessKilled && this.silent) {
      this.silent.kill();
      this.silentProcessKilled = true;
    }
    this.passthrough.write(data);
  }

  triggerVoiceProcess = (message, model) => {
    console.log('Triggering voice process...');
    if (process.env.NODE_ENV === 'production') {
      this.startPiperProcess(message, model);
    } else {
      this.startVoiceProcess();
    }
  };

  async stop() {
    await this.cleanup();
    setTimeout(() => this.start(), 200);
  }

  async cleanup() {
    try {
      this.cleanupStreams();
      this.cleanupProcesses();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  cleanupStreams() {
    if (this.passthrough) {
      this.passthrough.unpipe();
      this.passthrough.destroy();
      this.passthrough = null;
    }

    if (this.broadcast) {
      this.broadcast.removeAllListeners();
    }
  }

  cleanupProcesses() {
    if (this.silentProcess) {
      ffmpeg.killProcess(this.silentProcess);
      this.silentProcess = null;
    }

    if (this.systemAudioProcess) {
      ffmpeg.killProcess(this.systemAudioProcess);
      this.systemAudioProcess = null;
    }

    if (this.filterProcess) {
      ffmpeg.killProcess(this.filterProcess);
      this.filterProcess = null;
    }
  }
}

export default Radio;
