import Broadcast from './broadcast.js';
import Monitor from './monitor.js';
import { spawn } from 'child_process';
import { PassThrough } from 'stream';
import { Throttler } from 'throttler';
import { selectRandomTrack, BITRATE } from './utils.js';
import * as ffmpeg from './ffmpeg.js';
import { addToMessages } from './messages.js';

class Radio {
  constructor() {
    this.currentTrack = null;
    this.broadcast = new Broadcast();
    this.throttler = new Throttler({ bps: BITRATE / 8, chunkSize: 122 });
    this.filter = null;
    this.silent = null;
    this.input = null;
    this.output = null;
    this.system = null;
    this.throttler.pipe(this.broadcast);
    this.start();
  }

  async start() {
    try {
      this.input = new Monitor('input.json');
      this.output = new Monitor('output.json');
      await this.initializeStreams();
      await this.setupPipelines();
    } catch (error) {
      console.error('Start error:', error);
    }
  }

  async initializeStreams() {
    const { currentTrack, filepath } = selectRandomTrack();

    this.currentTrack = currentTrack;
    this.filter = this.startFilterProcess(filepath);
    this.silent = this.startSilentProcess();
    // this.system = this.startSystemAudioProcess();

    addToMessages(`Now playing: ${currentTrack}`, { type: 'system' });
    console.log(`Now playing: ${currentTrack}`, new Date());
  }

  async setupPipelines() {
    this.input.pipe(this.filter.stdin);
    this.filter.stdout.pipe(this.output);
    this.output.pipe(this.throttler, { end: false });
    // this.throttler.pipe(this.system.stdin);
  }

  subscribe() {
    return this.broadcast.subscribe();
  }

  unsubscribe(id) {
    this.broadcast.unsubscribe(id);
  }

  listeners() {
    return this.broadcast.subscribers.size;
  }

  startSystemAudioProcess() {
    const systemAudioProcess = ffmpeg.startSystemAudioProcess();
    systemAudioProcess.on('error', console.error);
    return systemAudioProcess;
  }

  startSilentProcess() {
    this.silent = ffmpeg.startSilentProcess();

    this.silent.stdout.pipe(this.input, { end: false });
    this.silent.on('error', console.error);

    return this.silent;
  }

  startFilterProcess(filepath) {
    if (this.filter) {
      this.filter.kill('SIGKILL');
    }
    this.filter = ffmpeg.startFilterProcess(filepath);

    this.filter.on('error', console.error);
    this.filter.on('close', () => this.stop());

    return this.filter;
  }

  startVoiceProcess() {
    console.log('Starting voice process...');
    if (this.silent) {
      this.silent.kill();
    }

    this.voiceProcess = ffmpeg.startVoiceProcess();
    this.voiceProcess.stdout.pipe(this.input, { end: false });
    this.voiceProcess.on('close', () => this.startSilentProcess());
    this.voiceProcess.on('error', console.error);
  }

  startPiperProcess(message = '', model = 'kristin') {
    const command = `echo "${message}" | piper --model models/${model}.onnx --output_raw`;
    this.piper = spawn('sh', ['-c', command]);
    this.setupPiperProcessHandlers();
  }

  setupPiperProcessHandlers() {
    this.voice = ffmpeg.startPiperVoiceProcess();
    this.piper.stdout.pipe(this.voice.stdin);
    this.silentProcessKilled = false;

    this.voice.stdout.on('data', (data) => this.writeVoiceToPassthrough(data));
    this.voice.on('close', () => this.startSilentProcess());
  }

  writeVoiceToPassthrough = (data) => {
    if (!this.silentProcessKilled && this.silent) {
      this.silent.kill();
      this.silentProcessKilled = true;
    }
    this.input.write(data);
  }

  triggerVoiceProcess = (message, model) => {
    if (process.env.NODE_ENV === 'production') {
      this.startPiperProcess(message, model);
    } else {
      this.startVoiceProcess();
    }
  };

  next() {
    ffmpeg.killProcess(this.filter);
    this.filter = null;
  }

  async stop() {
    let timer;
    try {
      await this.cleanup();
      timer = setTimeout(() => this.start(), 50);
    } catch (error) {
      clearTimeout(timer);
      console.log('Error during stop:', error);
    }
  }

  async cleanup() {
    try {
      this.cleanupStreams();
      this.cleanupProcesses();
    } catch (error) {
      console.error('Error during cleanup:', error);
      throw error;
    }
  }

  cleanupStreams() {
    if (this.input) {
      this.input.unpipe();
      this.input.destroy();
      this.input = null;
    }

    if (this.output) {
      this.output.unpipe();
      this.output.destroy();
      this.output = null;
    }

    if (this.broadcast) {
      this.broadcast.removeAllListeners();
    }
  }

  cleanupProcesses() {
    if (this.silent) {
      ffmpeg.killProcess(this.silent);
      this.silent = null;
    }

    if (this.system) {
      ffmpeg.killProcess(this.system);
      this.system = null;
    }

    if (this.filter) {
      ffmpeg.killProcess(this.filter);
      this.filter = null;
    }
  }
}

export default Radio;
