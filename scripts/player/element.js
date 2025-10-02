import { Sample } from './sample.js'
import { MersenneTwister } from './mt/mersenne-twister.js';

function shuffleArray(array, fn = Math) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(fn.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

function getRandomInRange(min, max, fn = Math) {
    return fn.random() * (max - min) + min;
}

export class Element {
    // startTime is used to determine fade-ins
    startTime = 0;
    samples = {};
    interval = null;
    lastStartTime = -10000;
    constructor(s, element, elementConfig, lookup, startTime, seed) {
        // at start, load samples for the next 60 seconds - every 30 seconds, recheck if we need
        // to load more samples
        this.lookup = lookup;
        this.s = s;
        this.element = element;
        this.elementConfig = elementConfig;
        this.startTime = startTime;
        this.seed = seed;

        // fill sample info
        this.element.samples.forEach(s => {
            s.src = lookup[s.sample];
        });

        // calculate total length of playlist
        this.totalDuration = this.element.samples.reduce((acc, e) => e.src.duration + acc, 0) / 1000;
        if (this.totalDuration === 0) {
            console.log('empty playlist', this.element.name);
            return;
        }

        // if (this.element.samples.length < 2) return;
        if (this.element.reverseDirection) {
            console.log('rev', this.element);
        }

        this.random = new MersenneTwister(seed);

        // calculate playlists for a maximum 4 runs or 20 minutes, whichever is larger
        this.playlist = [];
        let playlistDuration = 0;
        let lastSample = null;
        let playlistIteration = 0;
        while (true) {
            if (playlistIteration > 1000) {
                console.log('playlist iteration > limit', this.playlist, playlistDuration, this.element);
                break;
            }

            let playlist = [...this.element.samples];

            if (this.element.playlistOrder === 'random' || this.element.playlistOrder === 'shuffle') {
                shuffleArray(playlist, this.random)
            }

            // TODO: if pause is zero, adjust fading time to do a equal power crossfade

            if (playlist.length > 1 && playlist[0].sample === lastSample) {
                // move first track to the end of the list if it's the same as the last track of the previous
                // iteration
                playlist.push(playlist.shift());
            }
            // CHECK for actual samples
            lastSample = playlist[playlist.length-1].sample;

            // fill delays
            playlist = playlist.map((e, idx) => {
                let waitOffset = 0;
                if (idx === 0 && playlistIteration === 0) {
                    // add initial wait offset
                    waitOffset = getRandomInRange(this.element.minStartDelay || 0, this.element.maxStartDelay || 0, this.random);
                } else {
                    waitOffset = getRandomInRange(this.element.minWait || 0, this.element.maxWait || 0, this.random)
                }
                if (this.element.crossfade && !(idx === 0 && playlistIteration === 0)) {
                    waitOffset = -(this.element.crossfadeDuration || 3);
                }
                if (waitOffset < 0 && idx > 0) {
                    // Make sure we don't start before the last sample by adding at least 0.3s
                    const lastDuration = playlist[idx-1].src.duration / 1000;
                    waitOffset = Math.max(waitOffset, -lastDuration+0.3);
                }
                const sample = {
                    ...e,
                    duration: e.src.duration / 1000,
                    startTime: playlistDuration + waitOffset,
                    delayed: waitOffset,
                };
                playlistDuration += waitOffset + (sample.src.duration / 1000);
                return sample;
            })

            playlist.sort((a, b) => {
                return a.startTime - b.startTime;
            });

            this.playlist = this.playlist.concat(playlist);

            if ((playlistDuration > 20 * 60) || (this.element.type === 'oneshot') || (!this.element.repeat) || (this.playlist.length > 300)) {
                // enough
                if (this.playlist.length > 300) {
                    console.log('enough randomness for today');
                }
                break;
            }
            playlistIteration++;
        }

        this.totalPlaylistDuration = playlistDuration;

        if (this.element.type === 'oneshot') {
            this.playlist = [this.playlist[0]];
        }

        // console.log(this.element.name, {
        //     playlistEntries: this.playlist.length,
        //     totalDuration: this.totalDuration,
        //     totalPlaylistDuration: this.totalPlaylistDuration,
        //     element: this.element,
        //     playlist: this.playlist,
        // })

        // console.log('total duration', this.totalDuration, 'for', this.element.samples.length, 'tracks');
        // console.log('pl', this.playlist, this.element.samples);

        this.init();
    }
    init() {
        this.next(true);

        // re-schedule
        this.interval = setInterval(() => {
            this.next();
        }, 30000)
    }
    next(init) {
        const serverTime = this.s.getServerTime();
        const timeInPlaylist = serverTime - this.startTime;

        console.log(this.element);

        let lastStartTime = this.lastStartTime;
        let entryIndex = 0;
        let it = 0;
        while (true) {
            it++;
            if (it > 3000) {
                console.log('iteration limit');
                break;
            }
            const sample = this.playlist[entryIndex % this.playlist.length];
            const sampleStartTime = sample.startTime + Math.floor(entryIndex / this.playlist.length) * this.totalPlaylistDuration;
            if (sampleStartTime <= this.lastStartTime) { // use this.version to start also sounds starting exactly
                // at the same time
                if (sampleStartTime > timeInPlaylist + 60) {
                    // enough data
                    break;
                }
                // fast skip;
                entryIndex++;
                continue;
            }
            // console.log(this.startTime, serverTime, sample.startTime);
            if (sampleStartTime < timeInPlaylist) {
                // Only scrub if initializing
                if (init && (sampleStartTime + sample.src.duration > timeInPlaylist)) {
                    // play rest of sample or skip
                    // console.log('scrub', this.element, sampleStartTime, timeInPlaylist)

                    let newSample = this.samples[sample.sample];
                    if (!newSample) {
                        newSample = new Sample(this.s, this.element, sample, this.elementConfig, this.startTime)
                        this.samples[sample.sample] = newSample;
                    }
                    // timeInPlaylist-sampleStartTime as startOffset?!
                    newSample.loadAndPlay(this.s.getCurrentTime() + (sampleStartTime - timeInPlaylist), 0, this.seed + this.startTime + sampleStartTime);
                    lastStartTime = sampleStartTime;
                }
            } else if (sampleStartTime <= timeInPlaylist + 60) {
                let newSample = this.samples[sample.sample];
                if (!newSample) {
                    newSample = new Sample(this.s, this.element, sample, this.elementConfig, this.startTime)
                    this.samples[sample.sample] = newSample;
                }
                newSample.loadAndPlay(this.s.getCurrentTime() + (sampleStartTime - timeInPlaylist), 0, this.seed + this.startTime + sampleStartTime);
                // console.log(this.element.name, this.s.getCurrentTime(), (sampleStartTime - timeInPlaylist) + 's', this.s.getCurrentTime() + (sampleStartTime - timeInPlaylist));
                lastStartTime = sampleStartTime;
            } else {
                // we're done
                break;
            }
            entryIndex++
            if (entryIndex >= this.playlist.length && (!this.element.repeat || this.element.type === 'oneshot')) {
                break;
            }
        }
        this.lastStartTime = lastStartTime;
    }
    free(fadeTime) {
        Object.values(this.samples).forEach(s => s.free(fadeTime));
        // this.samples.forEach(s => s.free());
        this.samples = null;
        clearInterval(this.interval);
    }
}
