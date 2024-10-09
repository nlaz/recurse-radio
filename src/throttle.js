import { Transform } from 'stream';

class Throttle extends Transform {
  constructor(bytesPerSecond) {
    super({ bps: bytesPerSecond });

    this.chunkSize = Math.floor(bytesPerSecond / 10);
    this.totalBytes = 0;
    this.startTime = Date.now();
  }

  _transform(chunk, encoding, callback) {
    this.#processChunk(chunk, callback);
  }

  #processChunk = (chunk, callback) => {
    const remainingBytes = chunk.length;
    const bytesToPush = Math.min(remainingBytes, this.chunkSize);

    this.push(chunk.slice(0, bytesToPush));
    this.totalBytes += bytesToPush;

    if (remainingBytes > bytesToPush) {
      setImmediate(() => this.#processChunk(chunk.slice(bytesToPush), callback));
    } else {
      this.#waitForNextChunk(callback);
    }
  };

  #waitForNextChunk = (callback) => {
    const totalSeconds = (Date.now() - this.startTime) / 1000;
    const expectedBytes = totalSeconds * this.bytesPerSecond;

    if (this.totalBytes > expectedBytes) {
      const excessBytes = this.totalBytes - expectedBytes;
      const sleepTime = (excessBytes / this.bytesPerSecond) * 1000;

      if (sleepTime > 0) {
        setTimeout(callback, sleepTime);
      } else {
        callback();
      }
    } else {
      callback();
    }
  };
}

export default Throttle;
