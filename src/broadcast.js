import { PassThrough, Writable } from 'stream';
import { generateSessionId, BITRATE } from './utils.js';
import { Throttler } from 'throttler';

class Broadcast extends Writable {
  constructor() {
    super();
    this.subscribers = new Map();
    this.throttler = this.#setupThrottler();
    this.firstChunk = true;
  }

  subscribe() {
    const id = generateSessionId();
    const passthrough = PassThrough();

    this.subscribers.set(id, passthrough);

    return { id, passthrough };
  }

  subscriberCount() {
    return this.subscribers.size;
  }

  unsubscribe(id) {
    this.subscribers.delete(id);
  }

  broadcast(chunk) {
    if (this.firstChunk) {
      console.log('First chunk', new Date());
      this.firstChunk = false;
    }
    for (const passthrough of this.subscribers.values()) {
      passthrough.write(chunk);
    }
  }

  write(chunk, encoding, callback) {
    this.throttler.write(chunk, encoding, callback);
  }

  #setupThrottler = () => {
    const throttler = new Throttler(BITRATE / 8);
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
