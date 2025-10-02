import { BaseEffect } from './base.js';

export class SpatialEffect extends BaseEffect {
    init() {
        this.node = new PannerNode(this.ctx, {
            panningModel: this.params.panningModel,
            distanceModel: this.params.distanceModel,
            rolloffFactor: this.params.rolloff,
            refDistance: this.params.minDistance,
            maxDistance: this.params.maxDistance,
        })
    }
    setPosition(vec) {
        this.node.positionX.value = vec.x || 0
        this.node.positionY.value = vec.y || 0
        this.node.positionZ.value = vec.z || 0
    }
    getPosition() {
        return {
            x: this.node.positionX.value,
            y: this.node.positionY.value,
            z: this.node.positionZ.value
        };
    }
    moveTo(vec, time) {
        this.node.positionX.linearRampToValueAtTime(
            vec.x,
            this.ctx.currentTime + time,
        )
        this.node.positionY.linearRampToValueAtTime(
            vec.y,
            this.ctx.currentTime + time,
        )
        this.node.positionZ.linearRampToValueAtTime(
            vec.z,
            this.ctx.currentTime + time,
        )
    }
}
