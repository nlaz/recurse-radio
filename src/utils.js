import fs from 'fs';

const POSSIBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const BITRATE = 196 * 1024;

export function generateSessionId() {
  const numPossible = POSSIBLE_CHARS.length;
  const sessionIDArray = new Array(10)
    .fill(null)
    .map(() => POSSIBLE_CHARS.charAt((Math.random() * numPossible) | 0));
  return sessionIDArray.join('');
}

export const folder = process.argv[2] ? process.argv[2] : './library';

export const selectRandomTrack = () => {
  const files = fs.readdirSync(folder);
  const mp3Files = files.filter((file) => file.toLowerCase().endsWith('.mp3'));

  if (!mp3Files?.length) {
    throw Error(`No MP3 files found in the folder: ${folder}`);
  }

  const currentTrack = mp3Files[Math.floor(Math.random() * mp3Files.length)];
  const filepath = `${folder}/${currentTrack}`;
  return { currentTrack, filepath };
}
