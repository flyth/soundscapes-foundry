import { Soundscape } from './soundscape.js';

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").then(registration => {
        window.registration = registration;
    });
}

const ss = new Soundscape();
ss.init();

const root = document.getElementById('list');
fetch('full.json')
    .then(response => response.json())
    .then(json => {
        json.sets.forEach(s => {
            const el = document.createElement('li');
            const title = document.createElement('div');
            title.innerText = s.name;
            el.appendChild(title);

            const sub = document.createElement('ul');
            s.moods.forEach((m, i) => {
                const mood = document.createElement('li');
                const btn = document.createElement('button')
                btn.innerText = m.name;
                mood.append(btn);
                sub.appendChild(mood);
                btn.onclick = () => {
                    ss.load(s, i, json.samples)
                }
            });

            el.appendChild(sub);
            root.appendChild(el)
        })
    });
