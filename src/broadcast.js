import { PassThrough, Writable } from 'stream';
import Throttle from './throttle.js';
import { generateSessionId, BITRATE } from './utils.js';

class Broadcast extends Writable {
  constructor() {
    super();
    this.subscribers = new Map();
    this.throttler = this.#setupThrottler();
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
    for (const passthrough of this.subscribers.values()) {
      passthrough.write(chunk);
    }
  }

  write(chunk, encoding, callback) {
    this.throttler.write(chunk, encoding, callback);
  }

  #setupThrottler = () => {
    const throttler = new Throttle(BITRATE / 8);
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
