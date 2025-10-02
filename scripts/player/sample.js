import { SpatialEffect } from './effects/spatial.js';
import { ConvolverEffect } from './effects/convolver.js';
import { SendEffect } from './effects/send.js';
import { MersenneTwister } from './mt/mersenne-twister.js';

// const { OggVorbisDecoderWebWorker } = window["ogg-vorbis-decoder"];

class DecoderPool {
    decoderCount = 0;
    maxDecoders = 1;
    freeDecoders = [];
    waiting = [];
    constructor(maxDecoders) {
        this.maxDecoders = maxDecoders;
    }
    async get() {
        if (this.freeDecoders.length > 0) {
            return Promise.resolve(this.freeDecoders.pop())
        }
        if (this.decoderCount < this.maxDecoders) {
            this.decoderCount++;
            return Promise.resolve(this.createDecoder());
        }
        return new Promise((resolve, reject) => {
            this.waiting.push(resolve);s
        });
    }
    put(decoder) {
        if (this.waiting.length > 0) {
            const resolve = this.waiting.shift();
            resolve(decoder);
        } else {
            this.freeDecoders.push(decoder);
        }
    }
    async createDecoder() {
        const decoder = new OggVorbisDecoderWebWorker();
        await decoder.ready;
        return decoder;
    }
}

const decoderPool = new DecoderPool(4);

const easingFunctions = {
    'linear': e => e,
    'easeIn': e => 1 - Math.cos(e * Math.PI * .5),
    'easeOut': e => Math.sin(e * Math.PI * .5),
}

function lerp(e, t, n) {
    return e + (t - e) * n;
}

function getRandomInRange(min, max, fn = Math) {
    return fn.random() * (max - min) + min;
}

const length = ({x, z}) => Math.sqrt(x * x + z * z)

function getRandomPositionAndVelocity(minAngle, maxAngle, minDistance, maxDistance, speed, reverseDirection, audioLength, fn = Math) {
    // Generate random position
    const angle = getRandomInRange(minAngle, maxAngle, fn);
    const distance = getRandomInRange(minDistance, maxDistance, fn);
    const position = polarToCartesian(angle, distance, fn);
    // console.log('angle', angle, 'distance', distance, 'pos', position);

    if (reverseDirection) {
        position.z = -position.z;
    }

    // Calculate velocity vector towards/away from the observer
    const unitVector = calculateUnitVectorTowardsObserver(position);
    const velocity = {
        x: unitVector.x * speed,
        y: unitVector.y * speed,
        z: unitVector.z * speed
    };

    // Calculate end position
    const endPosition = {
        x: position.x + velocity.x * audioLength,
        y: position.y + velocity.y * audioLength,
        z: position.z + velocity.z * audioLength
    };

    return { position, velocity, endPosition };
}

function polarToCartesian(angle, distance) {
    const radian = angle * (Math.PI / 180);
    return {
        x: distance * Math.sin(radian),
        y: 0, // Assuming a 2D plane
        z: distance * Math.cos(radian),
    };
}

function calculateUnitVectorTowardsObserver(position) {
    const magnitude = Math.sqrt(position.x**2 + position.y**2 + position.z**2);
    return {
        x: -position.x / magnitude,
        y: -position.y / magnitude,
        z: -position.z / magnitude
    };
}

export class Sample {
    audioBuf = null;
    loadingStart = 0;
    loaded = false;
    loading = false;
    freed = false;
    node;
    gainNode;
    id = 0;
    instances = {};
    schedule = [];
    constructor(s, element, sample, elementConfig) {
        this.s = s;
        this.element = element;
        this.elementConfig = elementConfig;
        this.sample = sample;
        this.url = sample.src.id;
    }
    free(fadeTime) {
        this.freed = true;
        let fadeOut = 3.0;
        if (fadeTime) fadeOut = fadeTime;
        const currentTime = this.s.getCurrentTime();
        Object.values(this.instances).forEach(s => {
            const { node, gainNode, startTime } = s;
            const thisFadeOut = Math.max(0, Math.min(fadeOut, this.sample.duration - (currentTime - startTime)));
            if (thisFadeOut > 0) {
                gainNode.gain.cancelScheduledValues(currentTime);
                const vals2 = [];
                for (let e = 0; e < 32; e++) {
                    const n = easingFunctions.easeOut(e / 31);
                    vals2.push(lerp(gainNode.gain.value, 0, n)); // this.element.volume
                }
                try {
                    gainNode.gain.setValueCurveAtTime(vals2, currentTime, thisFadeOut);
                } catch (error) {
                    if (/AudioParam.setValueCurveAtTime: Can't add events during a curve event/.test(error.message)) {
                        logger.error(error)
                    } else {
                        throw error
                    }
                }
                node.stop(currentTime + thisFadeOut);
            }
        })
        this.instances = {};
        this.audioBuf = null;
    }
    async loadAndPlay(scheduledTime, startOffset, seed) {
        let offset = 0;
        if (!this.loaded && !this.loading) {
            this.loading = true;
            const file = this.url;
            this.loadingStart = this.s.getCurrentTime();

            if (navigator.userAgent.includes("Safari/") && !navigator.userAgent.includes("Chrome/")) {
                const response = await fetch(this.s.rootPath+'samples/' + file[0] + '/' + file[1] + '/' + file.replace('oggx', 'webm'));
                const buf = await response.arrayBuffer();

                // const decoder = new OggVorbisDecoderWebWorker();
                // await decoder.ready;

                const decoder = await decoderPool.get();

                console.log('decoder worker ready, decoding');
                const { channelData, samplesDecoded, sampleRate, bitDepth } = await decoder.decodeFile(new Uint8Array(buf));
                console.log('done decoding', channelData.length, 'channels with', channelData[0].length, 'samples, ', sampleRate, ' samplerate, ', bitDepth, ' bitdepth');

                const myArrayBuffer = this.s.audioContext.createBuffer(
                    channelData.length,
                    channelData[0].length,
                    sampleRate,
                );

                decoderPool.put(decoder);

                channelData.forEach((c, i) => {
                    myArrayBuffer.copyToChannel(c, i);
                });

                this.audioBuf = myArrayBuffer;
            } else {
                const response = await fetch(this.s.rootPath+'samples/' + file[0] + '/' + file[1] + '/' + file.replace('oggx', 'webm'));
                const buf = await response.arrayBuffer();

                this.audioBuf = await this.s.audioContext.decodeAudioData(buf);
            }

            if (!this.elementConfig.instantPlayback) {
                offset = this.s.getCurrentTime() - this.loadingStart;
            }

            // console.log('loading took', offset/1000, 's');

            this.loading = false;
            this.loaded = true;

            if (this.freed) return;

            // Add loading time, if necessary
            if (scheduledTime < this.s.getCurrentTime()) startOffset += offset;

            // Clean any instances that were scheduled while loading
            this.schedule.forEach((s) => {
                this.play(s[0], s[1], seed);
            });
            this.schedule = [];
        }
        if (this.loading) {
            this.schedule.push([scheduledTime, startOffset]);
            return;
        }
        await this.play(scheduledTime, startOffset, seed);
    }

    async play(scheduledTime, startOffset, seed) {
        let deinitFuncs = [];

        if (scheduledTime < this.s.getCurrentTime()) {
            startOffset += this.s.getCurrentTime() - scheduledTime;
            scheduledTime = this.s.getCurrentTime();
        }

        // if (scheduledTime < 0) {
        //     startOffset += -scheduledTime;
        //     scheduledTime = 0;
        // }

        const mt = new MersenneTwister(seed)

        let node = this.s.audioContext.createBufferSource();
        let out = this.s.destination;

        let reverb = null;
        let wetGain = 1.0;
        let dryGain = 1.0;
        let drySpatializer = {
            distanceModel: 'exponential',
            maxDistance: 100,
            minDistance: 1,
            panningModel: 'HRTF',
            rolloff: 1,
        }
        let wetSpatializer = {
            distanceModel: 'exponential',
            maxDistance: 100,
            minDistance: 1,
            panningModel: 'HRTF',
            rolloff: .4,
        }
        switch (this.element.reverb) {
            case '19':
                reverb = 'alley';
                dryGain = 2.0;
                drySpatializer = {
                    ...drySpatializer,
                    distanceModel: 'exponential',
                    maxDistance: 30,
                    minDistance: 1,
                    panningModel: 'HRTF',
                    rolloff: 1,
                }
                wetSpatializer = {
                    ...wetSpatializer,
                    distanceModel: 'exponential',
                    maxDistance: 50,
                    minDistance: 1,
                    panningModel: 'HRTF',
                    rolloff: .5,
                }
                break;
            case '11':
                reverb = 'auditorium';
                wetGain = .1;
                break;
            case '15':
                reverb = 'hangar';
                wetGain = .15;
                wetSpatializer = {
                    ...wetSpatializer,
                    distanceModel: 'exponential',
                    maxDistance: 100,
                    minDistance: 1,
                    panningModel: 'HRTF',
                    rolloff: .8,
                }
                break;
            case '12':
                reverb = 'concert_hall';
                dryGain = .5;
                break;
            case '27': // TODO
                reverb = 'poisoned';
                wetGain = .5;
                wetSpatializer = {
                    ...wetSpatializer,
                    distanceModel: 'exponential',
                    maxDistance: 100,
                    minDistance: 1,
                    panningModel: 'HRTF',
                    rolloff: .5,
                }
                break;
            case '16': // TODO
                reverb = 'carpetted_hallway';
                wetGain = .4;
                break;
            case '32':
                reverb = 'through_a_light_door';
                wetGain = .47;
                dryGain = .1;
                wetSpatializer = {
                    ...wetSpatializer,
                    distanceModel: 'inverse',
                    maxDistance: 100,
                    minDistance: 1,
                    panningModel: 'HRTF',
                    rolloff: .7,
                }
                break;
            case '31': // TODO!!!!!
                reverb = 'through_a_heavy_door';
                wetGain = .5;
                dryGain = .0;
                wetSpatializer = {
                    ...wetSpatializer,
                    distanceModel: 'exponential',
                    maxDistance: 100,
                    minDistance: 1,
                    panningModel: 'HRTF',
                    rolloff: .7,
                }
                break;
            case '29': // TODO
                reverb = 'crazed';
                wetGain = .3;
                break;
            case '7': // TODO
                reverb = 'vanilla_room';
                wetGain = .5;
                break;
            case '28': // TODO
                reverb = 'dazed';
                wetGain = .1;
                break;
            case '30':
                reverb = 'flooded_cavern';
                wetGain = .5;
                break;
            case '5': // OFF
                break;
            case '9':
                reverb = 'soft_furnished_room';
                break;
            case '17':
                reverb = 'hallway';
                break;
            case '21':
                reverb = 'city';
                break;
            case '18':
                reverb = 'stone_corridor';
                wetGain = .3;
                break;
            case '23':
                reverb = 'plain';
                break;
            case '22': // TODO
                reverb = 'mountains';
                wetSpatializer = {
                    ...wetSpatializer,
                    distanceModel: 'exponential',
                    maxDistance: 100,
                    minDistance: 1,
                    panningModel: 'HRTF',
                    rolloff: .8,
                }
                break;
            case '20':
                reverb = 'forest';
                break;
            case '1':
                reverb = 'metal_room';
                break;
            case '13':
                reverb = 'cave';
                break;
            case '10':
                reverb = 'stone_room';
                break;
            case '26':
                reverb = 'underwater';
                wetGain = .3;
                break;
            case '25':
                reverb = 'sewer';
                break;
            case '2':
                reverb = 'quarry';
                break;
            case '24':
                reverb = 'parking_lot';
                break;
            case '3':
                reverb = 'stone_dungeon';
                wetGain = 6.33;
                break;
            case '6':
                reverb = 'padded_cell';
                wetGain = .2;
                break;
            case '8':
                reverb = 'bathroom';
                break;
            case '14':
                reverb = 'arena';
                wetGain = .1;
                drySpatializer = {
                    ...drySpatializer,
                    distanceModel: 'exponential',
                    maxDistance: 100,
                    minDistance: 1,
                    panningModel: 'HRTF',
                    rolloff: 1,
                }
                wetSpatializer = {
                    ...wetSpatializer,
                    distanceModel: 'exponential',
                    maxDistance: 100,
                    minDistance: 1,
                    panningModel: 'HRTF',
                    rolloff: .4,
                }
                break;
            default:
                console.log('reverb unknown', this.element.reverb);
        }

        let wetOut;

        if (reverb) {
            // let send = new SendEffect(this.s.audioContext);
            // this.s.sends[reverb].inc();
            // send.send.connect(this.s.sends[reverb].node);
            // send.connect(out);
            // deinitFuncs.push(send);
            // send.send.gain.value = wetReverb;
            // send.output.gain.value = dryReverb; // was node
            // out = send.node;
            this.s.sends[reverb].inc();

            const wetGainNode = new GainNode(this.s.audioContext);
            const dryGainNode = new GainNode(this.s.audioContext);
            dryGainNode.gain.vaue = dryGain;
            dryGainNode.connect(out);
            wetGainNode.gain.value = wetGain;
            wetGainNode.connect(this.s.sends[reverb]);
            deinitFuncs.push(wetGainNode);
            deinitFuncs.push(dryGainNode);
            out = dryGainNode;
            wetOut = wetGainNode;

            // let send = new SendEffect(this.s.audioContext);
            // this.s.sends[reverb].inc();
            // send.send.connect(this.s.sends[reverb]);
            // send.connect(out);
            // deinitFuncs.push(send);
            // send.send.gain.value = wetGain;
            // send.output.gain.value = dryGain; // was node
            // wetOut = send.node;
        }

        // (this.element.type === 'sfx' || this.element.type === 'oneshot') &&
        if (this.element.spatial && this.element.type !== 'music') {
            // find a new position
            const { position, velocity, endPosition } = getRandomPositionAndVelocity(
                this.element.minAngle || 0,
                this.element.maxAngle || 0,
                this.element.minDistance || 0,
                this.element.maxDistance || 0,
                this.element.speed || .0,
                this.element.reverseDirection || false,
                this.sample.duration,
                mt
            );
            // console.log(position, this.element.minAngle, this.element.maxAngle);

            let drySpatial = new SpatialEffect(this.s.audioContext, {
                ...drySpatializer,
                // "distanceModel": "exponential",
                // "panningModel": "HRTF",
                // "maxDistance": 100,
                // "minDistance": 1,
                // "name": "My spatial effect 2",
                // "output": "Global Volume",
                // "position": {
                //     "x": 0,
                //     "y": 0,
                //     "z": 0
                // },
                // "rolloff": 1,
                // "speed": 0,
                // "type": "spatial"
            })
            drySpatial.setPosition(position)

            if (this.element.speed !== 0 &&
                !(position.x === 0 && position.y === 0 && position.z === 0)) {
                // console.log(endPosition, velocity, this.sample.duration, this.element);
                drySpatial.moveTo(endPosition, this.sample.duration);
            }

            drySpatial.connect(out);

            const mono = this.s.audioContext.createGain(); // this.s.audioContext.createChannelMerger(1)
            mono.connect(drySpatial.node);

            if (reverb) {
                let wetSpacial = new SpatialEffect(this.s.audioContext, {
                    ...wetSpatializer,
                })
                wetSpacial.setPosition({
                    x: 0,
                    y: 0,
                    z: length(position)
                });
                deinitFuncs.push(wetSpacial);
                wetSpacial.connect(wetOut);
                mono.connect(wetSpacial.node);
            }

            deinitFuncs.push(drySpatial);
            deinitFuncs.push(mono);

            out = mono;
        }

        let gainNode = this.s.audioContext.createGain();
        gainNode.connect(out);
        gainNode.gain.setValueAtTime(0, this.s.audioContext.currentTime);
        deinitFuncs.push(gainNode);

        if (this.element.crossfade) {
            gainNode.gain.cancelScheduledValues(this.s.audioContext.currentTime);
            let xfd = this.element.crossfadeDuration
            const sampleGain = getRandomInRange(this.sample.minGain || 1.0, this.sample.maxGain || 1.0, mt) * this.elementConfig.volume;
            xfd = Math.min(xfd, this.sample.duration / 2);

            const vals = [];
            for (let e = 0; e < 32; e++) {
                const n = easingFunctions.easeOut(e / 31);
                vals.push(lerp(0, sampleGain, n)); // this.element.volume
            }

            try {
                gainNode.gain.setValueCurveAtTime(vals, scheduledTime, xfd || 1.0)
            } catch (error) {
                if (/AudioParam.setValueCurveAtTime: Can't add events during a curve event/.test(error.message)) {
                    logger.error(error)
                } else {
                    throw error
                }
            }

            const vals2 = [];
            for (let e = 0; e < 32; e++) {
                const n = easingFunctions.easeIn(e / 31);
                vals2.push(lerp(sampleGain, 0, n)); // this.element.volume
            }
            try {
                gainNode.gain.setValueCurveAtTime(vals2, scheduledTime+(this.sample.duration-xfd), xfd || 1.0)
            } catch (error) {
                if (/AudioParam.setValueCurveAtTime: Can't add events during a curve event/.test(error.message)) {
                    logger.error(error)
                } else {
                    throw error
                }
            }
        } else {
            let fadeTime = 0.02;
            if (startOffset > 0) {
                fadeTime = Math.min(1.0, this.sample.duration/2);
                console.log('fadetime adjusted to', this.element.name, fadeTime, this.s.audioContext.currentTime, scheduledTime, startOffset);
            }

            // calc fade-in
            const vals = [];
            for (let e = 0; e < 32; e++) {
                const n = easingFunctions.easeOut(e / 31);
                vals.push(lerp(0, getRandomInRange(this.sample.minGain || 1.0, this.sample.maxGain || 1.0) * this.elementConfig.volume, n, mt)); // this.element.volume
            }
            gainNode.gain.cancelScheduledValues(this.s.audioContext.currentTime);

            try {
                gainNode.gain.setValueCurveAtTime(vals, scheduledTime, fadeTime)
            } catch (error) {
                if (/AudioParam.setValueCurveAtTime: Can't add events during a curve event/.test(error.message)) {
                    logger.error(error)
                } else {
                    throw error
                }
            }
        }

        out = gainNode;

        node.connect(out);
        deinitFuncs.push(node);

        // console.log(this.element.name, 'at', scheduledTime, startOffset);
        node.buffer = this.audioBuf;
        node.start(scheduledTime, startOffset);

        const cleanUp = () => {
            delete(this.instances[id]);
            deinitFuncs.reverse().forEach(f => f.disconnect());
            deinitFuncs = null;
            node.removeEventListener('ended', onEnded)
            node = null;
            if (reverb) {
                this.s.sends[reverb].dec()
            }
            // console.log(this.element.name, 'disconnected');
        }

        const onEnded = () => {
            setTimeout(cleanUp, 5000);
        }

        node.addEventListener('ended', onEnded);

        this.node = node;
        this.gainNode = gainNode;

        const id = this.id++;
        this.instances[id] = {
            startTime: scheduledTime - startOffset,
            node,
            gainNode,
        };
    }
}
