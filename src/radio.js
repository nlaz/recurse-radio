  import Broadcast from './broadcast.js';
  import { spawn } from 'child_process';
  import { PassThrough, pipeline } from 'stream';
  import { selectRandomTrack } from './utils.js';

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

        // Create a PassThrough stream to duplicate the output
        const outputStream = new PassThrough();

        // Pipe source to PassThrough
        pipeline(
          this.filterProcess.stdout,
          outputStream,
          (err) => {
            if (err) console.error('Source pipeline error:', err);
          }
        );

        // Pipe to first destination
        pipeline(
          outputStream,
          this.broadcast,
          (err) => {
            if (err) console.error('Broadcast pipeline error:', err);
          }
        );

        if (process.env.NODE_ENV === 'production') {
          pipeline(
            outputStream,
            this.systemAudioProcess.stdin,
            (err) => {
              if (err) console.error('System audio pipeline error:', err);
            }
          );
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
      const systemAudioProcess = spawn('ffplay', [
        '-f', 'mp3',           // Format: signed 16-bit little-endian
        '-ar', '48000',          // Match sample rate with filter process (48kHz)
        '-ac', '2',              // Match number of channels (stereo)
        '-i', 'pipe:0',          // Read from stdin
        '-af', 'volume=0.3',    // Keep existing volume adjustment
        '-nodisp'                // Don't display video window
      ]);

      systemAudioProcess.on('error', (error) => {
        console.error('System audio process error:', error);
      });

      systemAudioProcess.on('data', (chunk) => {
        console.log('systemAudioProcess', chunk);
      });

      return systemAudioProcess;
    }

    startSilentProcess() {
      // prettier-ignore
      this.silentProcess = spawn('ffmpeg', [
        '-re',
        '-stream_loop', '-1',
        '-i', './lib/silence.mp3',
        '-f', 'mp3',
        '-ar', '44100',
        '-ac', '2',
        '-preset', 'ultrafast',
        'pipe:1',
      ]);

      this.silentProcess.stdout.pipe(this.passthrough, { end: false });
      this.silentProcess.on('error', console.error);

      return this.silentProcess;
    }

    startFilterProcess(filepath) {
      if (this.filterProcess) {
        this.filterProcess.kill('SIGKILL');
      }
      // prettier-ignore
      this.filterProcess = spawn('ffmpeg', [
        '-y',
        '-loglevel', 'error',
        '-re',
        '-f', 'mp3',
        '-i', 'pipe:0',
        '-f', 'mp3',
        '-re',
        '-i', filepath,
        '-filter_complex',
        '[0:a]asplit=2[vocals_for_sidechain][vocals_for_mix];' +
        `[1:a][vocals_for_sidechain]sidechaincompress=threshold=${THRESHOLD}:ratio=${RATIO}:attack=${ATTACK}:release=${RELEASE}[compressed_main];` +
        '[compressed_main][vocals_for_mix]amix=inputs=2:duration=shortest[mix]',
        '-map', '[mix]',
        '-ac', '2',
        '-b:a', '196k',
        '-ar', '48000',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-f', 'mp3',
        'pipe:1',
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

      // prettier-ignore
      this.voiceProcess = spawn('ffmpeg', [
        '-i', './lib/bumper.mp3',
        '-f', 'mp3',
        '-ar', '44100',
        '-ac', '2',
        '-preset', 'ultrafast',
        'pipe:1'
      ]);

      this.voiceProcess.stdout.pipe(this.passthrough, { end: false });

      this.voiceProcess.on('close', (code) => {
        console.log(`Voice process closed with code ${code}`);
        this.startSilentProcess();
      });

      this.voiceProcess.on('error', console.error);
    }

    startPiperProcess(message, model = "kristin") {
      try {
        if (!message) {
          console.error('No message provided to piper process');
          return;
        }
        console.log('Starting piper process, message:', message);
        const command = `echo "${message}" | piper --model models/${model}.onnx --output_raw`;

        this.piperProcess = spawn('sh', ['-c', command]);

        // Fix: Changed .stdout() to .on() for proper event listening
        this.piperProcess.stdout.on('data', (data) => {
          console.log('piper process output:', data.toString());
        });

        // Fix: Changed .stdout() to .stderr for error events
        this.piperProcess.stderr.on('data', (error) => {
          console.error('piper process error:', error.toString());
        });

        // Add error handler for piperProcess
        this.piperProcess.on('error', (error) => {
          console.error('piper process spawn error:', error);
        });

        // prettier-ignore
        this.voiceProcess = spawn('ffmpeg', [
          '-f', 's16le',
          '-ar', '22050',
          '-ac', '1',
          '-i', 'pipe:0',
          '-f', 'mp3',
          '-ar', '44100',
          '-ac', '2',
          'pipe:1'
        ]);

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
    }

    killProcess(process) {
      if (!process) return;

      try {
        process.stdin?.destroy();
        process.stdout?.destroy();
        process.stderr?.destroy();
        process.kill('SIGKILL');
      } catch (error) {
        console.error('Error killing process:', error);
      }
    }

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
          this.killProcess(this.silentProcess);
          this.silentProcess = null;
        }

        if (this.systemAudioProcess) {
          this.killProcess(this.systemAudioProcess);
          this.systemAudioProcess = null;
        }

        if (this.filterProcess) {
          this.killProcess(this.filterProcess);
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
