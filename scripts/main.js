/* global $, Combat, CONFIG, game, Hooks, ItemDirectory */
import { Soundscape } from './player/soundscape.js';
import { SoundScapesApp } from './ui/window.js';

let ss = new Soundscape();
window.ss = ss;

Hooks.on('globalAmbientVolumeChanged', (volume) => {
    ss.setVolume(volume);
    console.log('volume to', volume);
});

const ssApp = new SoundScapesApp()

Hooks.on('renderSidebarTab', (app, html) => {
    console.log('sidebar', app);
    if (app.options.id !== 'playlists' && app.id !== 'playlists') return;
    const btn = $(
        `
            <div class="header-actions action-buttons flexrow">
                <button id="soundscapeOpen">
                    <i></i> SoundScapes
                </button>
            </div>
            `
    );
    html.find(".directory-header").prepend(btn);
    btn.on("click", async event => {
        ssApp.render(true);
    });
});

Hooks.once('ready', async () => {
    await game.settings.register('soundscapes', 'currentScene', {
        name: 'Currently playing scene',
        scope: 'world',
        config: false,
        type: String,
        onChange: value => {
            const scene = JSON.parse(value);
            console.log('setting new scene', scene);
            if (scene.moods) {
                ss.load(scene, 0, scene.samples, scene.startTime / 1000);
            } else {
                ss.stop();
            }
        },
        filePicker: false,
        requiresReload: true,
    });

    await game.settings.register('soundscapes', 'storageUrl', {
        name: 'Storage URL',
        hint: 'Root path to sample repository, samples and reverbs.',
        scope: 'world',
        config: true,
        type: String,
        onChange: value => {
            ss.rootPath = value;
        },
        filePicker: false,
        requiresReload: true,
    });
    const rootPath = game.settings.get('soundscapes','storageUrl');

    await game.settings.register('soundscapes', 'inventoryUrl', {
        name: 'Inventory URL',
        hint: 'Path to inventory JSON.',
        scope: 'client',
        config: true,
        type: String,
        onChange: value => {},
        filePicker: true,
        requiresReload: true,
    });

    Hooks.on('soundscapesSetScene', scene => {
        // ss.load(scene, 0, scene.samples);
        game.settings.set('soundscapes', 'currentScene', JSON.stringify({ ...scene, startTime: Date.now() }))
        console.log(scene);
    });

    Hooks.on('soundscapesPlayElement', (element) => {
        // ss.load(scene, 0, scene.samples);
        // game.settings.set('soundscapes', 'currentScene', JSON.stringify({ ...scene, startTime: Date.now() }))
        ss.oneshot(element.element, element.samples);
        console.log(element);
    });

    const ctx = await game.audio.awaitFirstGesture();

    console.log('SoundScapes | got first gesture');

    ss.init(ctx, rootPath);
    ss.setVolume(game.settings.get("core", "globalAmbientVolume"));

    const scene = JSON.parse(game.settings.get('soundscapes', 'currentScene'));
    if (scene.moods) {
        ss.load(scene, 0, scene.samples, scene.startTime / 1000);
    }

});

Hooks.on('updateScene', (scene, data) => {
    if (hasProperty(data, 'flags.soundscapes')) {
        console.log('updateSceneHook', data);
    }
});
