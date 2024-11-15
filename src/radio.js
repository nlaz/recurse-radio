import Broadcast from './broadcast.js';
import { spawn } from 'child_process';
import { PassThrough, pipeline } from 'stream';
import { selectRandomTrack } from './utils.js';
import * as ffmpeg from './ffmpeg.js';

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
    this.passthrough = null;
    this.start();
  }

  async start() {
    try {
      this.passthrough = new PassThrough();
      const { currentTrack, filepath } = selectRandomTrack();
      this.filterProcess = this.startFilterProcess(filepath);
      this.silentProcess = this.startSilentProcess();

      if (process.env.NODE_ENV === 'production') {
        this.systemAudioProcess = this.startSystemAudioProcess();
      }

      console.log(`Now playing: ${currentTrack}`, new Date());

      this.passthrough.pipe(this.filterProcess.stdin).on('error', (error) => {
        console.error('Pipe error:', error);
      });

      const outputStream = new PassThrough();

      pipeline(this.filterProcess.stdout, outputStream, (err) => {
        if (err) console.error('Source pipeline error:', err);
      });

      pipeline(outputStream, this.broadcast, (err) => {
        if (err) console.error('Broadcast pipeline error:', err);
      });

      if (process.env.NODE_ENV === 'production') {
        pipeline(outputStream, this.systemAudioProcess.stdin, (err) => {
          if (err) console.error('System audio pipeline error:', err);
        });
      }
    } catch (error) {
      console.error('Start error:', error);
      this.stop();
    }
  }

  subscribe() {
    return this.broadcast.subscribe();
  }

  unsubscribe(id) {
    this.broadcast.unsubscribe(id);
  }

  startSystemAudioProcess() {
    const systemAudioProcess = ffmpeg.startSystemAudioProcess();

    systemAudioProcess.on('error', (error) => {
      console.error('System audio process error:', error);
    });

    systemAudioProcess.on('data', (chunk) => {
      console.log('systemAudioProcess', chunk);
    });

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

    this.voiceProcess = ffmpeg.startVoiceProcess();

    this.voiceProcess.stdout.pipe(this.passthrough, { end: false });

    this.voiceProcess.on('close', (code) => {
      console.log(`Voice process closed with code ${code}`);
      this.startSilentProcess();
    });

    this.voiceProcess.on('error', console.error);
  }

  startPiperProcess(message, model = 'kristin') {
    try {
      if (!message) {
        console.error('No message provided to piper process');
        return;
      }
      console.log('Starting piper process, message:', message);
      const command = `echo "${message}" | piper --model models/${model}.onnx --output_raw`;

      this.piperProcess = spawn('sh', ['-c', command]);

      this.piperProcess.stdout.on('data', (data) => {
        console.log('piper process output:', data.toString());
      });

      this.piperProcess.stderr.on('data', (error) => {
        console.error('piper process error:', error.toString());
      });

      this.piperProcess.on('error', (error) => {
        console.error('piper process spawn error:', error);
      });

      this.voiceProcess = ffmpeg.startVoiceProcess();

      this.piperProcess.stdout.pipe(this.voiceProcess.stdin);

      this.voiceProcess.on('error', (error) => {
        console.error('Voice process error:', error);
      });

      let silentProcessKilled = false;

      this.voiceProcess.stdout.on('data', (data) => {
        if (!silentProcessKilled && this.silentProcess) {
          this.silentProcess.kill();
          silentProcessKilled = true;
        }
        this.passthrough.write(data);
      });

      this.voiceProcess.on('close', () => this.startSilentProcess());
    } catch (error) {
      console.error('Error starting piper process', error);
    }
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
    console.log('Stopping radio...');
    this.isShuttingDown = true;

    try {
      if (this.passthrough) {
        this.passthrough.unpipe();
        this.passthrough.destroy();
        this.passthrough = null;
      }

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

      if (this.broadcast) {
        this.broadcast.removeAllListeners();
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }

    this.isShuttingDown = false;
    setTimeout(() => this.start(), 200);
  }
}

export default Radio;
