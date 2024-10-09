import fs from 'fs';
import Broadcast from './broadcast.js';
import { spawn } from 'child_process';
import * as mm from 'music-metadata';
import { BITRATE } from './utils.js';

const THRESHOLD = 0.02;
const RATIO = 4;
const ATTACK = 20;
const RELEASE = 300;

export const ffmpegArgs = (input, vocal, duration) => {
  return [
    '-re',
    '-i', input,
    '-i', vocal,
    '-filter_complex',
    '[1:a]adelay=3000|3000[delayed_vocals];' +
    `[delayed_vocals]apad=whole_dur=${duration}[padded_vocals];` +
    '[padded_vocals]asplit=2[vocals_for_sidechain][vocals_for_mix];' +
    `[0:a][vocals_for_sidechain]sidechaincompress=threshold=${THRESHOLD}:ratio=${RATIO}:attack=${ATTACK}:release=${RELEASE}[compressed_main];` +
    '[compressed_main][vocals_for_mix]amix=inputs=2:duration=longest[final_mix]',
    '-map', '[final_mix]',
    '-ac', '2',
    '-b:a', '196k',
    '-ar', '48000',
    '-f', 'mp3',
    'pipe:1'
  ];
};

class Radio {
  constructor() {
    this.ffmpeg = null;
    this.broadcast = new Broadcast();
    this.run();
  }

  async run() {
    const currentTrack = this.selectRandomTrack();
    const input = `./library/${currentTrack}`;
    const bumper = './bumper.mp3';
    const duration = await this.getTrackDuration(input);
    this.ffmpeg = spawn('ffmpeg', ffmpegArgs(input, bumper, duration));
    console.log(`Now playing: ${currentTrack}`);

    this.ffmpeg.on('close', () => this.stop());
    this.ffmpeg.on('error', () => this.stop());
    this.ffmpeg.stdout.pipe(this.broadcast);
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

  async getTrackDuration(filePath) {
    try {
      const metadata = await mm.parseFile(filePath);
      return metadata.format.duration || 0;
    } catch (error) {
      console.error('Error getting track duration:', error);
      return 0;
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
