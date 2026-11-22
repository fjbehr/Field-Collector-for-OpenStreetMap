// Short illustrated tutorial: shown on first start and from Menu → Tutorial.
import { icon } from './icons.js';

const SLIDES = [
  {
    icon: 'map-pinned',
    title: 'Welcome!',
    text: 'Collect points, lines and areas for <b>OpenStreetMap</b> with your phone’s GPS – also where there is <b>no network</b>. Everything is saved on the phone.',
  },
  {
    icon: 'point',
    title: 'Add a point',
    text: 'Stand at the feature (borehole, school, shop…) and tap <span class="kbd">${point} Point</span> → <b>At my GPS position</b>. Keep still for a few seconds while the position is averaged.',
  },
  {
    icon: 'way',
    title: 'Record a way',
    text: 'Tap <span class="kbd">${way} Way</span> and choose: <b>Walk it</b> (path, road, river), <b>Corner by corner</b> (building, field) or <b>Draw on the map</b>. Then tap <b>Finish line</b> or <b>Finish area</b>.',
  },
  {
    icon: 'star',
    title: 'Type, details & photos',
    text: 'Choose the type, e.g. <i>Borehole</i>, and fill in the fields. Add <b>photos</b>. Save frequent combinations as a <span class="kbd">${star} favourite</span> – next time it is one tap.',
  },
  {
    icon: 'snap',
    title: 'Connect & correct',
    text: 'Before you start, open <b>More → Load existing OSM data</b> (with network). New ways then <b>connect</b> to existing roads, and you can tap an existing object to <b>correct its tags</b>.',
  },
  {
    icon: 'qr',
    title: 'Project template',
    text: 'Your teacher can share the survey form as a <b>QR code</b>: <b>More → Project template → Scan QR code</b>. You get the project name, the questions and favourites at once.',
  },
  {
    icon: 'upload',
    title: 'Upload & export',
    text: 'Back with network: <span class="kbd">${upload} Upload</span> sends your data to OpenStreetMap (log in once). <b>More → Export</b> gives a ZIP for QGIS or sends it by e-mail.',
  },
];

const fill = (s) => s.replace(/\$\{(\w+)\}/g, (_, n) => icon(n, 'sm'));

export function showTutorial() {
  return new Promise((resolve) => {
    let i = 0;
    const el = document.createElement('div');
    el.className = 'dialog-backdrop tutorial';
    document.body.appendChild(el);
    const done = () => { el.remove(); resolve(); };
    el._cancel = done;
    const render = () => {
      const s = SLIDES[i];
      const last = i === SLIDES.length - 1;
      el.innerHTML = `
        <div class="dialog tut-card" role="dialog" aria-label="Tutorial">
          <button class="icon-btn tut-skip" data-skip aria-label="Close tutorial">${icon('x')}</button>
          <div class="tut-ico">${icon(s.icon)}</div>
          <h3>${s.title}</h3>
          <p>${fill(s.text)}</p>
          <div class="tut-dots">${SLIDES.map((_, j) => `<span class="${j === i ? 'on' : ''}"></span>`).join('')}</div>
          <div class="tut-actions">
            ${i > 0 ? `<button class="btn" data-back>${icon('chevron-left')}Back</button>` : '<span></span>'}
            <button class="btn primary" data-next>${last ? `${icon('check')}Let’s start` : `Next${icon('chevron-right')}`}</button>
          </div>
        </div>`;
    };
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-skip]')) return done();
      if (e.target.closest('[data-back]')) { i--; render(); }
      if (e.target.closest('[data-next]')) {
        if (i === SLIDES.length - 1) return done();
        i++; render();
      }
    });
    render();
  });
}
