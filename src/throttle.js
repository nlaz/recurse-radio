import { Transform } from 'stream';
import Parser from './parser.js';

export default class Throttle extends Transform {
  constructor(opts) {
    super(opts);
    const options = this._normalizeOptions(opts);

    this.bps = options.bps;
    this.chunkSize = Math.max(1, options.chunkSize);
    this.totalBytes = 0;
    this.startTime = Date.now();

    this.parser = new Parser(this);
    this._passthroughChunk();
  }

  _normalizeOptions(opts) {
    const options = typeof opts === 'number' ? { bps: opts } : { ...opts };

    if (options.bps == null) {
      throw new Error('Must pass a "bps" (bytes-per-second) option');
    }

    options.lowWaterMark ??= 0;
    options.highWaterMark ??= 0;
    options.chunkSize ??= Math.floor(options.bps / 10);

    return options;
  }

  _passthroughChunk() {
    this.parser.passthrough(this.chunkSize, this._onchunk.bind(this));
    this.totalBytes += this.chunkSize;
  }

  _transform(chunk, encoding, callback) {
    this.parser.transform(chunk, this.push.bind(this), callback);
  }

  _onchunk(output, done) {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const expectedBytes = elapsedSeconds * this.bps;
    const excessBytes = this.totalBytes - expectedBytes;

    if (excessBytes > 0) {
      const sleepTime = (excessBytes / this.bps) * 1000;
      if (sleepTime > 0) {
        setTimeout(() => this._continueChunking(done), sleepTime);
      } else {
        this._continueChunking(done);
      }
    } else {
      this._continueChunking(done);
    }
  }

  _continueChunking(done) {
    this._passthroughChunk();
    done();
  }
}
