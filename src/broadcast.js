import { PassThrough, Writable } from 'stream';
import { generateSessionId, BITRATE } from './utils.js';
import { Throttler } from 'throttler';

class Broadcast extends Writable {
  constructor() {
    super();
    this.subscribers = new Map();
    this.throttler = this.#setupThrottler();
    this.chunkBuffer = [];
    this.bufferSize = 10;
  }

  subscribe() {
    const id = generateSessionId();
    const passthrough = PassThrough();

    this.subscribers.set(id, passthrough);

    for (const chunk of this.chunkBuffer) {
      passthrough.write(chunk);
    }

    return { id, passthrough };
  }

  subscriberCount() {
    return this.subscribers.size;
  }

  unsubscribe(id) {
    this.subscribers.delete(id);
  }

  broadcast(chunk) {
    this.chunkBuffer.push(chunk);
    if (this.chunkBuffer.length > this.maxBufferSize) {
      this.chunkBuffer.shift();
    }

    for (const passthrough of this.subscribers.values()) {
      passthrough.write(chunk);
    }
  }

  write(chunk, encoding, callback) {
    this.throttler.write(chunk, encoding, callback);
  }

  #setupThrottler = () => {
    const throttler = new Throttler({ bps: BITRATE / 8, chunkSize: 1024 });
    throttler.on('data', (chunk) => {
      this.broadcast(chunk);
    });
    throttler.on('error', (err) => {
      this.logger.error('[Broadcast] Throttle error', err);
    });
    return throttler;
  };

  onStop(callback) {
    this.emitter.on('stop', callback);
  }
}

export default Broadcast;
