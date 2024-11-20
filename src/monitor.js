import fs from 'fs';
import { PassThrough } from 'stream';

export default class Monitor extends PassThrough {
  constructor(outputFilePath) {
    super();
    this.outputFilePath = outputFilePath;
    this.startTime = Date.now();
    this.chunkData = [];

    this.on('data', this.chunk.bind(this));
    this.on('end', this.writeResults.bind(this));
  }

  chunk(chunk) {
    this.chunkData.push({
      time: Date.now() - this.startTime,
      size: chunk.length,
    });
  }

  writeResults() {
    fs.writeFileSync(this.outputFilePath, JSON.stringify(this.chunkData));
    console.log(`Stream ended. Data written to ${this.outputFilePath}`);
  }
}
