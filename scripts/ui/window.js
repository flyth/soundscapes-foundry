
Hooks.on("hotbarDrop", async (bar, data, slot) => {
    if (data?.type === 'soundscapes-scene') {
        const macro = await Macro.create({
            name: data.name,
            type: "script",
            // img: item.img,
            command: `Hooks.call('soundscapesSetScene', ${JSON.stringify(data.scene)});`,
            // flags: { "boilerplate.itemMacro": true }
        });
        game.user.assignHotbarMacro(macro, slot);
    }

    if (data?.type === 'soundscapes-element') {
        let icon;
        if (data.element.element.icon)  {
            icon = game.settings.get('soundscapes','storageUrl') + 'icons/' + data.element.element.icon[0] + '/' + data.element.element.icon[1] + '/' + data.element.element.icon
        }
        const macro = await Macro.create({
            name: data.name,
            type: "script",
            img: icon, // item.img,
            command: `Hooks.call('soundscapesPlayElement', ${JSON.stringify(data.element)});`,
            // flags: { "boilerplate.itemMacro": true }
        });
        game.user.assignHotbarMacro(macro, slot);
    }
});

class SoundScapes {
    soundsets = {
        sets: [],
    }
    currentSet = null
    currentMood = null;
    search = null;
    constructor(vnode) {
        this.rootPath = game.settings.get('soundscapes','storageUrl');
        fetch(game.settings.get('soundscapes','inventoryUrl')).then(response => response.json()).then(j => {
            this.soundsets = j;
            j.sets.forEach(s => {
                s.search = s.name.toLowerCase();
                s.moods.forEach((m, idx) => {
                    m.search = m.name.toLowerCase();
                    m.set = s; // for backwards reference in search results
                    m.idx = idx;
                })
                Object.values(s.elements).forEach(el => {
                    el.search = el.name.toLowerCase();
                });
            })
            m.redraw();
        });
    }
    view() {
        return m('.flexrow', { style: { 'position': 'relative', 'height': '100%' } }, [
            m('.flex1.part', { style: { 'overflow-y': 'auto', 'height': '100%' } }, [
                m('input[type=text]', {
                    style: { marginBotton: '10px' },
                    onkeyup: (ev) => {
                        this.search = ev.target.value?.toLowerCase() || null;
                        if (this.search && this.search.length > 2) {
                            const moodResults = [];
                            const elementResults = {};
                            this.soundsets.sets.forEach(s => {
                                s.moods.forEach(m => {
                                    if (m.search.indexOf(this.search) >= 0) {
                                        moodResults.push({ ...m, name: m.name + ' (' + s.name + ')' });
                                    }
                                })
                                Object.keys(s.elements).forEach(k => {
                                    const el = s.elements[k];
                                    if (el.search.indexOf(this.search) >= 0) {
                                        elementResults[k] = el;
                                    }
                                })
                            });
                            this.currentSet = {
                                name: 'Search Results for ' + this.search,
                                moods: moodResults,
                                elements: elementResults,
                            }
                        } else {
                            this.search = null;
                        }
                    }
                }),
                m('ul', this.soundsets.sets.filter(s => { return (!this.search || s.search.indexOf(this.search) >= 0 ) }).map(s => {
                    return m('li', {
                        // ondragstart: (ev) => {
                        //     ev.dataTransfer.setData('text/plain', JSON.stringify({ type: 'soundscapes-mood' }))
                        // },
                        onpointerup: () => {
                            this.currentSet = s;
                            document.getElementById('soundscapes-set-view').scrollTop = 0;
                        },
                        style: {
                            backgroundColor: (this.currentSet === s) ? 'rgba(255,255,255,0.3)' : '',
                        }
                    }, s.name);
                })),
            ]),
            m('.flex3.part[id=soundscapes-set-view]', { style: { 'overflow-y': 'auto', 'height': '100%' } }, !this.currentSet ? null : [
                m('h2', [
                    m('button.soundscapes-stop-btn', {
                        onpointerdown: () => {
                            window.ss.stop();
                        }
                    }, m('i.fa.fa-stop')),
                    this.currentSet.name,
                ]),
                m('h3', 'Scenes'),
                m('.flexrow', [
                    m('.flex1', m('ul', this.currentSet.moods.map((mood, idx) => {
                        return m('li[draggable=true]', {
                            ondragstart: (ev) => {
                                ev.dataTransfer.setData('text/plain', JSON.stringify({ type: 'soundscapes-scene', name: mood.name, scene: window.ss.buildScene(mood.set, mood.idx, this.soundsets.samples) }))
                            },
                            onpointerup: (ev) => {
                                window.ss.load(mood.set, mood.idx, this.soundsets.samples);
                                this.currentMood = mood;
                            },
                            style: {
                                backgroundColor: (mood === this.currentMood) ? 'rgba(255,255,255,0.3)' : '',
                            }
                        }, mood.name);
                    }))),
                ]),
                m('h3', 'Mixed Elements'),
                m('.flex1', m('.soundscapes-elements', !this.currentSet ? null : Object.keys(this.currentSet.elements).map((k) => {
                    const el = this.currentSet.elements[k];
                    return m('.soundscapes-element[draggable=true]', {
                        ondragstart: (ev) => {
                            ev.dataTransfer.setData('text/plain', JSON.stringify({ type: 'soundscapes-element', name: el.name, element: window.ss.buildOneshot({ ...el, minStartDelay: 0, maxStartDelay: 0 }, this.soundsets.samples) }))
                        },
                        onpointerup: () => {
                            window.ss.oneshot({ ...el, minStartDelay: 0, maxStartDelay: 0 }, this.soundsets.samples);
                        }
                    }, [
                        m('.soundscapes-icon', {
                            style: {
                                backgroundImage: el.icon ? 'url(' + this.rootPath + 'icons/' + el.icon[0] + '/' + el.icon[1] + '/' + el.icon + ')' : 'linear-gradient(75deg,#909090 0%,#e5e5e5 66%)',
                            },
                        }),
                        m('.soundscapes-element-name', el.name),
                    ]);
                }))),
                m('h3', 'Samples'),
                m('.flex1', m('.soundscapes-elements', !this.currentSet ? null : Object.keys(this.currentSet.elements).map((k) => {
                    const el = this.currentSet.elements[k];
                    const sampleLookup = {};
                    return el.samples.filter(s => !sampleLookup[''+s.sample]).map(s => {
                        const sample = this.soundsets.samples[s.sample];
                        sampleLookup[''+s.sample] = sample;
                        return m('.soundscapes-element', {
                            onpointerup: () => {
                                window.ss.oneshot({
                                    name: 'Oneshot',
                                    type: 'oneshot',
                                    samples: [{ sample: s.sample }],
                                }, this.soundsets.samples);
                            }
                        }, [
                            m('.soundscapes-icon-sample', {
                                style: {
                                    backgroundImage: sample.icon ? 'url(' + this.rootPath + 'icons/' + sample.icon[0] + '/' + sample.icon[1] + '/' + sample.icon + ')' : 'linear-gradient(75deg,#909090 0%,#e5e5e5 66%)',
                                },
                            }),
                            m('.soundscapes-element-name', sample.name),
                        ]);
                    });
                }))),
            ])
        ]);
    }
    oncreate() {

    }
}


export class SoundScapesApp extends Application {
    constructor(options = {}) {
        super(options);
        console.log('new win');
    }

    /** @inheritdoc */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            title: 'SoundScapes',
            id: 'soundscapes-app',
            template: 'modules/soundscapes/templates/window.hbs',
            classes: ['soundscapes-app'],
            width: Math.min(1000, window.innerWidth * 0.8),
            height: Math.min(1000, window.innerWidth * 0.8),
            resizable: true,
            maximizable: true,
            popOut: true,
            minimizable: true,
        });
    }

    /** @inheritdoc */
    getData(options = {}) {
        return {
        };
    }

    /** @inheritdoc */
    activateListeners(html) {
        super.activateListeners(html);
        // console.log(html.find('#soundscapes-app-content').first())
        m.mount(document.getElementById('soundscapes-app-content'), SoundScapes);
        // m.render(html.find('#soundscapes-app-content')[0], 'fooby')
        // super.activateListeners(html);
        // html.find('button[name="close"]')
        //     .click(this.close.bind(this));
        // html.find('button[name="process"]')
        //     .click(this._process.bind(this));
        // html.find('button[name="convert"]')
        //     .click(this._convert.bind(this));
    }
    async close() {
        await super.close(arguments);
        m.mount(document.getElementById('soundscapes-app-content'), null);
    }
}
