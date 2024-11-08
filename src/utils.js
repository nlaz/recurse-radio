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
