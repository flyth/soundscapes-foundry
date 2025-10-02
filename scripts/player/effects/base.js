export class BaseEffect {
    node = null;
    constructor(ctx, params = {}) {
        this.ctx = ctx;
        this.params = params;
        this.init();
    }
    init() {}
    connect(target) {
        this.node.connect(target);
    }
    disconnect(target) {
        this.node.disconnect(target);
    }
}
