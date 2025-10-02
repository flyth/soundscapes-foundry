import { BaseEffect } from './base.js';

export class SendEffect extends BaseEffect {
    init() {
        this.node = this.ctx.createGain();
        this.output = this.ctx.createGain();
        this.send = this.ctx.createGain();
        this.node.connect(this.output);
        this.node.connect(this.send);
        // this.output.gain.value = 2.0;
    }
    connect(target) {
        this.output.connect(target);
    }
    disconnect(target) {
        this.output.disconnect();
        // clean up
        this.node.disconnect();
        this.send.disconnect();
        this.node = null;
        this.output = null;
        this.send = null;
    }
}
