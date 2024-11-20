import { PassThrough, Writable } from 'stream';
import { generateSessionId } from './utils.js';

class Broadcast extends Writable {
  constructor() {
    super();
    this.subscribers = new Map();
    this.chunkBuffer = [];
    this.bufferSize = 0;
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

  write(chunk) {
    this.chunkBuffer.push(chunk);
    if (this.chunkBuffer.length > this.bufferSize) {
      this.chunkBuffer.shift();
    }

    for (const passthrough of this.subscribers.values()) {
      passthrough.write(chunk);
    }
  }

  onStop(callback) {
    this.emitter.on('stop', callback);
  }
}

export default Broadcast;
