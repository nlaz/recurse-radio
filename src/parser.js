import assert from 'assert';

const ParserState = {
  INIT: -1,
  BUFFERING: 0,
  SKIPPING: 1,
  PASSTHROUGH: 2,
};

export default class Parser {
  constructor(stream) {
    if (!stream || typeof stream._transform !== 'function') {
      throw new Error('Must be a Transform stream');
    }

    this.stream = stream;
    this.init();
  }

  init() {
    this.bytesLeft = 0;
    this.buffers = [];
    this.buffered = 0;
    this.state = ParserState.INIT;
    this.callback = null;
    this.output =
      typeof this.stream.push === 'function' ? this.stream.push.bind(this.stream) : null;
  }

  bytes(n, fn) {
    this._setupOperation(n, fn, ParserState.BUFFERING, 'buffering');
  }

  skipBytes(n, fn) {
    this._setupOperation(n, fn, ParserState.SKIPPING, 'skipping');
  }

  passthrough(n, fn) {
    this._setupOperation(n, fn, ParserState.PASSTHROUGH, 'passing through');
  }

  _setupOperation(n, fn, state, operation) {
    assert(!this.callback, 'There is already a "callback" set!');
    this.bytesLeft = n;
    this.callback = fn;
    this.state = state;
  }

  transform(chunk, output, fn) {
    this.data(chunk, output || this.output, fn);
  }

  data(chunk, output, fn) {
    if (this.bytesLeft <= 0) {
      return fn(new Error('Got data but not parsing anything'));
    }

    const chunkSize = Math.min(chunk.length, this.bytesLeft);
    const currentChunk = chunk.slice(0, chunkSize);

    this._process(currentChunk, output, (err) => {
      if (err) return fn(err);
      if (chunk.length > chunkSize) {
        this.data(chunk.slice(chunkSize), output, fn);
      } else {
        fn();
      }
    });
  }

  _process(chunk, output, fn) {
    this.bytesLeft -= chunk.length;

    if (this.state === ParserState.BUFFERING) {
      this.buffers.push(chunk);
      this.buffered += chunk.length;
    } else if (this.state === ParserState.PASSTHROUGH) {
      output(chunk);
    }

    if (this.bytesLeft === 0) {
      this._executeCallback(chunk, output, fn);
    } else {
      fn();
    }
  }

  _executeCallback(chunk, output, fn) {
    const cb = this.callback;
    if (cb && this.state === ParserState.BUFFERING && this.buffers.length > 1) {
      chunk = Buffer.concat(this.buffers, this.buffered);
    }
    if (this.state !== ParserState.BUFFERING) {
      chunk = null;
    }
    this._resetState();

    if (cb) {
      const args = chunk ? [chunk] : [];
      if (output) args.push(output);
      const async = cb.length > args.length;
      if (async) args.push(fn);
      const result = cb.apply(this.stream, args);
      if (!async || fn === result) return fn();
    }
  }

  _resetState() {
    this.callback = null;
    this.buffered = 0;
    this.state = ParserState.INIT;
    this.buffers.length = 0;
  }
}
