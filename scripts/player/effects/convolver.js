import { BaseEffect } from './base.js';
import { fetchURL } from '../cache.js';

export class ConvolverEffect extends BaseEffect {
    init() {
        this.node = this.ctx.createConvolver();
        fetchURL(this.params.url)
            // .then(response => response.arrayBuffer())
            .then(buf => this.ctx.decodeAudioData(buf))
            .then(audioBuf => this.node.buffer = audioBuf);
    }
}
