import { Element } from './element.js';
import { ConvolverEffect } from './effects/convolver.js';

class ReverbController extends GainNode {
    refCount = 0;
    reverbName = '';
    ctx;
    constructor(ctx, reverbName, url, out) {
        super(ctx)
        this.ctx = ctx;
        this.reverbName = reverbName;
        this.out = out || ctx.destination;
        this.url = url;
    }
    inc() {
        this.refCount++;
        if (this.refCount > 0 && !this.conv) {
            // console.log('loading reverb', this.reverbName);
            this.conv = new ConvolverEffect(this.ctx, {
                url: this.url,
            })
            this.connect(this.conv.node);

            setTimeout(() => {
                if (this.refCount > 0) this.conv.connect(this.out);
            }, 1000);
        }
    }
    dec() {
        // console.log('dec reverb', this.reverbName);
        this.refCount--;
        if (this.refCount <= 0 && this.conv) {
            // console.log('unloading reverb', this.reverbName);
            this.conv.disconnect(this.out);
            this.disconnect(this.conv.node);
            this.conv = null;
        }
    }
}

export class Soundscape {
    serverTimeOffset = 0;

    volume = 0.5;
    setVolume(val) {
        this.volume = val;
        if (this.gainNode) this.gainNode.gain.value = val;
    }

    async init2() {
        const ctx = await new AudioContext();
        this.init(ctx);
    }

    async init(audioCtx, rootPath = './') {
        if (!audioCtx) {
            audioCtx = await new AudioContext();
        }
        this.rootPath = rootPath;
        this.audioContext = audioCtx;

        this.gainNode = new GainNode(this.audioContext);
        this.gainNode.connect(this.audioContext.destination);
        this.gainNode.gain.value = this.volume;
        // default compressor

        this.compressor = new DynamicsCompressorNode(this.audioContext, {
            attack: 0.003,
            knee: 30,
            ratio: 12,
            release: 0.25,
            threshold: -24,
        })
        this.compressor.connect(this.gainNode);
        this.destination = this.compressor;

        const convs = [
            'alley',
            'auditorium',
            'soft_furnished_room',
            'hallway',
            'city',
            'metal_room',
            'forest',
            'stone_dungeon',
            'cave',
            'plain',
            'stone_corridor',
            'mountains',
            'stone_room',
            'hangar',
            'flooded_cavern',
            'through_a_heavy_door',
            'concert_hall',
            'poisoned',
            'carpetted_hallway',
            'through_a_light_door',
            'crazed',
            'vanilla_room',
            'dazed',
            'underwater',
            'sewer',
            'parking_lot',
            'padded_cell',
            'concert_hall_a', // Dry Long, Dry Short
            'bathroom',
            'arena',
            'quarry',
        ]

        convs.forEach(c => {
            const conv = new ReverbController(
                this.audioContext,
                c,
                this.rootPath + 'conv/' + c + '.wav',
                this.compressor,
            )
            this.sends[c] = conv;
            // conv.connect(this.compressor);
        });

    }

    getServerTime() {
        return (Date.now() - this.serverTimeOffset) / 1000;
    }

    getCurrentTime() {
        return this.audioContext.currentTime;
    }

    toLog(e) {
        const t = e * this.dbRange - this.dbRange;
        return t === -this.dbRange ? 0 : Math.pow(10, t / 20);
    }

    dbRange = 37.5;

    fromLog(e) {
        let v = n.gain.value;
        v = 1 - 20 * Math.log10(e) / -this.dbRange;
    }

    samples = {};
    elements = {};

    sends = {};

    activeElements = [];
    oneshotElement = null;

    buildOneshot(e, lookup) {
        const sampleLookup = {};
        const samples = [];
        const element = { ...e };
        delete element.name;
        element.samples = element.samples.map(s => {
            let id = sampleLookup[''+s.sample];
            if (id === undefined) {
                id = samples.length;

                const oldSample = lookup[s.sample];
                const newSample = { ...oldSample };
                delete(newSample.name);
                samples.push(newSample);

                sampleLookup[''+s.sample] = id;
            }
            return { ...s, sample: id };
        })
        return {
            element: element,
            samples
        }
    }

    buildScene(set, idx, lookup) {
        const samples = [];

        const elements = [];
        const requiredElements = {};
        const moodElements = set.moods[idx].elements.map(e => {
            console.log(e);
            let newId = requiredElements[''+e.id];
            if (newId === undefined) {
                newId = elements.length;
                elements.push(set.elements[e.id]);
                requiredElements[''+e.id] = newId;
            }
            return { ...e, id: newId }
        });

        const newSet = {
            elements: elements.map(e => {
                const sampleLookup = {};
                const element = { ...e };
                delete element.name;
                delete element.search;
                element.samples = element.samples.map(s => {
                    let id = sampleLookup[''+s.sample];
                    if (id === undefined) {
                        id = samples.length;

                        const oldSample = lookup[s.sample];
                        const newSample = { ...oldSample };
                        delete(newSample.name);
                        samples.push(newSample);

                        sampleLookup[''+s.sample] = id;
                    }
                    return { ...s, sample: id };
                })
                return element;
            }),
            moods: [
                { ...set.moods[idx], elements: moodElements },
            ],
            samples,
        }
        delete newSet.moods[0].set;
        console.log(newSet);
        return newSet;
    }

    async load(set, idx, lookup, startTime, seed) {
        console.log(this);
        await this.audioContext.resume();

        if (!startTime) startTime = this.getServerTime()
        if (seed === undefined) seed = startTime * 1000;

        // TODO: fade?
        // Object.values(this.activeElements).forEach(el => el.free());
        this.stop();

        set.moods[idx].elements.forEach((el, elId) => {
            if (!el.active) return;

            const element = set.elements[el.id];
            const ne = new Element(this, element, el, lookup, startTime, seed+elId);
            this.activeElements.push(ne);
        });
    }
    async oneshot(element, lookup) {
        if (this.oneshotElement) {
            this.oneshotElement.free(.1);
            this.oneshotElement = null;
        }
        const ne = new Element(this, element, { volume: 1.0, active: true, instantPlayback: true }, lookup, this.getServerTime(), Math.random()*1000);
        this.oneshotElement = ne;
    }
    stop() {
        this.activeElements.forEach(el => el.free());
        this.activeElements = [];
        if (this.oneshotElement) {
            this.oneshotElement.free(.1);
            this.oneshotElement = null;
        }
    }
}
