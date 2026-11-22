import 'leaflet/dist/leaflet.css';
import './styles.css';
import L from 'leaflet';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

import { APP_NAME, APP_VERSION, BASEMAPS, DEFAULT_SETTINGS, OSM_SERVERS, START_VIEW } from './config.js';
import * as db from './db.js';
import * as gps from './gps.js';
import { distance, lineLength, ringArea, simplify, fmtDistance, fmtArea } from './geo.js';
import { CachedTileLayer, PmtilesLayer, openPmtiles, setCacheLimit } from './tiles.js';
import { featureLabel, isAreaTags } from './presets.js';
import { openEditor } from './editor.js';
import * as osm from './osm.js';
import { FORMATS, buildFiles, safeName, sendEmail, shareFiles, saveToDocuments } from './export.js';
import {
  $, $$, esc, toast, openSheet, closeSheet, hasOpenSheet, closeDialog,
  confirmDialog, alertDialog, promptDialog, choiceDialog, busy,
} from './ui.js';

const native = Capacitor.isNativePlatform();

const state = {
  settings: { ...DEFAULT_SETTINGS },
  features: new Map(),
  recording: null, // { mode: 'auto'|'vertex'|'crosshair', nodes: [], paused, startedAt }
  follow: true,
  existing: null,
  showExisting: true,
};

// ======================================================================
// Map
// ======================================================================
const map = L.map('map', { zoomControl: false, maxZoom: 22, attributionControl: true })
  .setView([START_VIEW.lat, START_VIEW.lon], START_VIEW.zoom);
L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
map.attributionControl.setPrefix('');

let baseLayer = null;
const existingLayer = L.layerGroup().addTo(map);
const featureLayer = L.layerGroup().addTo(map);
const recordLayer = L.layerGroup().addTo(map);
const gpsAccuracy = L.circle([0, 0], { radius: 1, color: '#1a73e8', weight: 1, fillOpacity: 0.12, interactive: false });
const gpsDot = L.circleMarker([0, 0], { radius: 7, color: '#fff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1, interactive: false });

async function setBasemap() {
  const s = state.settings;
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = null;
  try {
    if (s.basemap === 'offline') {
      const blob = await db.get('files', 'basemap');
      if (!blob) throw new Error('No offline base map imported yet (Settings → Offline base map).');
      const { pmtiles, header } = await openPmtiles(blob);
      baseLayer = new PmtilesLayer(pmtiles, header, { attribution: 'Offline base map' });
    } else if (s.basemap === 'custom' && s.customTileUrl) {
      baseLayer = new CachedTileLayer('custom', s.customTileUrl, { maxNativeZoom: 19, maxZoom: 22 });
    } else if (s.basemap === 'none') {
      return;
    } else {
      const b = BASEMAPS[s.basemap] || BASEMAPS.osm;
      baseLayer = new CachedTileLayer(s.basemap in BASEMAPS ? s.basemap : 'osm', b.url, {
        maxNativeZoom: b.maxNativeZoom, maxZoom: 22, attribution: b.attribution,
      });
    }
    baseLayer.addTo(map);
    baseLayer.bringToBack();
  } catch (e) {
    toast(e.message, 5000);
  }
}

const STYLE = {
  new: { color: '#e8590c', fill: '#ff922b' },
  uploaded: { color: '#2b8a3e', fill: '#51cf66' },
  untagged: { color: '#c92a2a', fill: '#ff6b6b' },
};
function styleOf(f) {
  if (f.status === 'uploaded') return STYLE.uploaded;
  return Object.keys(f.tags || {}).length ? STYLE.new : STYLE.untagged;
}

function renderFeatures() {
  featureLayer.clearLayers();
  for (const f of state.features.values()) {
    if (f.project !== state.settings.project && !state.settings.showAllProjects) continue;
    const st = styleOf(f);
    let layer;
    if (f.type === 'node') {
      layer = L.circleMarker([f.lat, f.lon], { radius: 8, color: '#fff', weight: 2, fillColor: st.fill, fillOpacity: 1 });
    } else {
      const ll = f.nodes.map((p) => [p.lat, p.lon]);
      layer = f.closed
        ? L.polygon(ll, { color: st.color, weight: 3, fillColor: st.fill, fillOpacity: 0.25 })
        : L.polyline(ll, { color: st.color, weight: 4 });
    }
    layer.bindTooltip(esc(featureLabel(f)), { direction: 'top', offset: [0, -6] });
    layer.on('click', () => editFeature(f.id));
    layer.addTo(featureLayer);
  }
  updateCounts();
}

function renderExisting() {
  existingLayer.clearLayers();
  const d = state.existing;
  if (!d || !state.showExisting) return;
  for (const w of d.ways) {
    const closed = w.c.length > 3 && w.c[0] === w.c.at(-1);
    const opts = { color: '#6c757d', weight: 2, opacity: 0.8, dashArray: w.tags.highway ? null : '4 4', interactive: true };
    const layer = closed && isAreaTags(w.tags) ? L.polygon(w.c, { ...opts, fillOpacity: 0.08 }) : L.polyline(w.c, opts);
    layer.bindTooltip(esc(osmLabel(w.tags, `way ${w.id}`)));
    layer.addTo(existingLayer);
  }
  for (const p of d.points) {
    L.circleMarker(p.c, { radius: 5, color: '#495057', weight: 1, fillColor: '#adb5bd', fillOpacity: 0.9 })
      .bindTooltip(esc(osmLabel(p.tags, `node ${p.id}`)))
      .addTo(existingLayer);
  }
}
const osmLabel = (t, fallback) => t.name || featureLabel({ tags: t, type: 'node' }) || fallback;

map.on('dragstart', () => setFollow(false));

function setFollow(on) {
  state.follow = on;
  $('#btn-follow').classList.toggle('active', on);
  const fix = gps.lastFix();
  if (on && fix) map.setView([fix.lat, fix.lon], Math.max(map.getZoom(), 17));
}

// ======================================================================
// GPS status
// ======================================================================
let firstFix = true;
gps.onFix((fix) => {
  gpsDot.setLatLng([fix.lat, fix.lon]);
  gpsAccuracy.setLatLng([fix.lat, fix.lon]).setRadius(fix.accuracy || 1);
  if (!map.hasLayer(gpsDot)) { gpsAccuracy.addTo(map); gpsDot.addTo(map); }
  if (firstFix) {
    firstFix = false;
    if (state.follow) map.setView([fix.lat, fix.lon], 17);
  } else if (state.follow) {
    map.panTo([fix.lat, fix.lon], { animate: true });
  }
  const badge = $('#gps-badge');
  const acc = fix.accuracy ?? 999;
  badge.textContent = `GPS ±${acc < 100 ? acc.toFixed(0) : '>99'} m${fix.simulated ? ' (sim)' : ''}`;
  badge.className = acc <= 5 ? 'good' : acc <= state.settings.maxAccuracy ? 'ok' : 'bad';
  onRecordingFix(fix);
});
gps.onError((err) => {
  const badge = $('#gps-badge');
  badge.textContent = err.code === 'NOT_AUTHORIZED' ? 'GPS: no permission' : 'GPS: no signal';
  badge.className = 'bad';
  if (err.code === 'NOT_AUTHORIZED' && native) {
    confirmDialog('This app needs location permission to record points and ways. Open settings now?', 'Open settings').then(
      (ok) => ok && gps.openSettings()
    );
  }
});
setInterval(() => {
  const fix = gps.lastFix();
  if (fix && Date.now() - fix.time > 15000) {
    $('#gps-badge').textContent = 'GPS: waiting…';
    $('#gps-badge').className = 'bad';
  }
}, 5000);

// ======================================================================
// Features
// ======================================================================
async function newFeature(props) {
  const f = {
    id: await db.nextFeatureId(),
    project: state.settings.project,
    created: Date.now(),
    updated: Date.now(),
    tags: {},
    extra: {},
    note: '',
    status: 'new',
    ...props,
  };
  await db.saveFeature(f);
  state.features.set(f.id, f);
  renderFeatures();
  return f;
}

function editFeature(id, isNew = false) {
  const f = state.features.get(id);
  if (!f) return;
  openEditor(f, {
    isNew,
    onSave: async (updated) => {
      await db.saveFeature(updated);
      state.features.set(updated.id, updated);
      renderFeatures();
    },
    onDelete: async (d) => {
      await db.deleteFeature(d.id);
      state.features.delete(d.id);
      renderFeatures();
    },
    onMove: f.type === 'node' ? moveNode : null,
  });
}

async function moveNode(f) {
  const how = await choiceDialog('Move point to…', [
    { value: 'gps', label: 'Current GPS position', desc: `averaged over ${state.settings.averageSeconds} s` },
    { value: 'center', label: 'Map crosshair', desc: 'close the editor first to position the map' },
  ]);
  if (how === 'gps') {
    const pos = await captureAveraged();
    return pos && { lat: pos.lat, lon: pos.lon, altitude: pos.altitude, accuracy: pos.accuracy, samples: pos.samples };
  }
  if (how === 'center') {
    const c = map.getCenter();
    return { lat: c.lat, lon: c.lng, accuracy: null, samples: null };
  }
  return null;
}

// GPS averaging with a progress dialog. Returns position or null.
async function captureAveraged() {
  if (!gps.isRunning()) await gps.start();
  const s = state.settings;
  const bd = document.createElement('div');
  bd.className = 'dialog-backdrop';
  bd.innerHTML = `<div class="dialog"><h3>Measuring position…</h3>
    <p class="big" data-acc>waiting for GPS</p>
    <div class="progress"><div></div></div>
    <p class="muted">Stand still at the feature. Fixes better than ±${s.maxAccuracy} m are averaged.</p>
    <div class="dialog-actions"><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-now>Use now</button></div></div>`;
  bd._cancel = () => gps.averagePosition.cancel?.();
  document.body.appendChild(bd);
  const p = gps.averagePosition(s.averageSeconds, s.maxAccuracy, ({ elapsed, samples, fix }) => {
    bd.querySelector('.progress div').style.width = `${Math.min(100, (elapsed / s.averageSeconds) * 100)}%`;
    bd.querySelector('[data-acc]').textContent = fix ? `±${fix.accuracy.toFixed(1)} m · ${samples} good fixes` : 'waiting for GPS';
  });
  bd.querySelector('[data-cancel]').onclick = () => gps.averagePosition.cancel();
  bd.querySelector('[data-now]').onclick = () => {
    // finish early with what we have
    const fix = gps.lastFix();
    if (!fix) return toast('No GPS fix yet');
    gps.averagePosition.cancel();
    bd._early = { lat: fix.lat, lon: fix.lon, altitude: fix.altitude, accuracy: fix.accuracy, samples: 1 };
  };
  try {
    return await p;
  } catch (e) {
    if (bd._early) return bd._early;
    if (e.message !== 'cancelled') toast(e.message);
    return null;
  } finally {
    bd.remove();
  }
}

// ---------- add point ----------
async function addPoint() {
  const how = await choiceDialog('Add point', [
    { value: 'gps', label: '📡 At my GPS position', desc: `stand at the feature, averaged over ${state.settings.averageSeconds} s` },
    { value: 'center', label: '✛ At the map crosshair', desc: 'for features you cannot stand at (fenced, across a river…)' },
  ]);
  if (!how) return;
  let props;
  if (how === 'gps') {
    const pos = await captureAveraged();
    if (!pos) return;
    props = { type: 'node', lat: pos.lat, lon: pos.lon, altitude: pos.altitude, accuracy: pos.accuracy, samples: pos.samples, source: 'gps' };
  } else {
    const c = map.getCenter();
    props = { type: 'node', lat: c.lat, lon: c.lng, accuracy: null, source: 'map' };
  }
  const f = await newFeature(props);
  editFeature(f.id, true);
}

// ======================================================================
// Way recording
// ======================================================================
async function startWay() {
  if (state.recording) return;
  const mode = await choiceDialog('Record way (line or area)', [
    { value: 'auto', label: '🚶 Walk it – automatic GPS track', desc: `adds a point every ${state.settings.minDistance} m; works with the screen off` },
    { value: 'vertex', label: '📍 Corner by corner – GPS', desc: 'stand at each corner/bend and tap “Add point” (best for buildings & fields)' },
    { value: 'crosshair', label: '✛ Draw on the map', desc: 'move the map and tap “Add point” at the crosshair' },
  ]);
  if (!mode) return;
  state.recording = { mode, nodes: [], track: [], paused: false, startedAt: Date.now() };
  if (mode !== 'crosshair') {
    await gps.startBackground();
    setFollow(true);
  }
  await persistRecording();
  showRecordPanel();
}

function onRecordingFix(fix) {
  const r = state.recording;
  if (!r || r.mode !== 'auto' || r.paused) return;
  if (fix.accuracy > state.settings.maxAccuracy) return updateRecordPanel();
  const pt = { lat: fix.lat, lon: fix.lon, time: fix.time, accuracy: fix.accuracy };
  const last = r.nodes.at(-1);
  if (!last || distance(last, pt) >= state.settings.minDistance) {
    r.nodes.push(pt);
    persistRecordingThrottled();
  }
  updateRecordPanel();
}

let persistTimer = null;
function persistRecordingThrottled() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => { persistTimer = null; persistRecording(); }, 3000);
}
const persistRecording = () => db.kvSet('recording', state.recording);

function showRecordPanel() {
  const r = state.recording;
  $('#bottom-bar').hidden = true;
  const p = $('#record-panel');
  p.hidden = false;
  p.innerHTML = `
    <div class="rec-info"><span class="rec-dot"></span><span data-info></span></div>
    <div class="rec-buttons">
      ${r.mode === 'auto' ? '<button class="btn" data-pause>Pause</button>' : '<button class="btn primary" data-add>+ Add point</button>'}
      <button class="btn" data-undo>Undo</button>
      <button class="btn" data-more>⋯</button>
    </div>
    <div class="rec-buttons">
      <button class="btn primary" data-finish-line>Finish line</button>
      <button class="btn primary" data-finish-area>Finish area</button>
    </div>`;
  document.body.classList.toggle('crosshair-on', true);
  updateRecordPanel();
}

function updateRecordPanel() {
  const r = state.recording;
  if (!r) return;
  recordLayer.clearLayers();
  const ll = r.nodes.map((p) => [p.lat, p.lon]);
  if (ll.length) {
    L.polyline(ll, { color: '#d6336c', weight: 4, dashArray: r.paused ? '6 6' : null }).addTo(recordLayer);
    ll.forEach((c) => L.circleMarker(c, { radius: 3, color: '#d6336c', weight: 1, fillOpacity: 1 }).addTo(recordLayer));
  }
  const fix = gps.lastFix();
  const info = $('#record-panel [data-info]');
  if (!info) return;
  const len = lineLength(r.nodes);
  const accTxt = r.mode !== 'crosshair' && fix ? ` · GPS ±${fix.accuracy.toFixed(0)} m${fix.accuracy > state.settings.maxAccuracy ? ' (too poor – skipped)' : ''}` : '';
  info.textContent = `${r.paused ? 'PAUSED · ' : ''}${r.nodes.length} points · ${fmtDistance(len)}${accTxt}`;
}

async function recordAddPoint() {
  const r = state.recording;
  if (r.mode === 'crosshair') {
    const c = map.getCenter();
    r.nodes.push({ lat: c.lat, lon: c.lng, time: Date.now(), accuracy: null });
  } else {
    const pos = await captureAveraged();
    if (!pos || !state.recording) return;
    r.nodes.push({ lat: pos.lat, lon: pos.lon, time: Date.now(), accuracy: pos.accuracy });
  }
  await persistRecording();
  updateRecordPanel();
}

async function finishWay(closed) {
  const r = state.recording;
  const min = closed ? 3 : 2;
  if (r.nodes.length < min) return toast(`An ${closed ? 'area needs at least 3' : 'line needs at least 2'} points`);
  let nodes = r.nodes;
  // A closed area recorded by walking ends near its start – drop the duplicate end point.
  if (closed && nodes.length > 3 && distance(nodes[0], nodes.at(-1)) < Math.max(state.settings.minDistance * 2, 5)) {
    nodes = nodes.slice(0, -1);
  }
  let track = null;
  if (r.mode === 'auto') {
    track = nodes;
    const ring = closed ? [...nodes, nodes[0]] : nodes;
    nodes = simplify(ring, state.settings.simplifyTolerance);
    if (closed) nodes = nodes.slice(0, -1);
  }
  const acc = r.nodes.filter((n) => n.accuracy != null).map((n) => n.accuracy);
  const f = await newFeature({
    type: 'way',
    closed,
    mode: r.mode,
    nodes,
    track,
    accuracy: acc.length ? acc.reduce((a, b) => a + b, 0) / acc.length : null,
  });
  await stopRecording();
  toast(`${closed ? 'Area' : 'Line'} saved: ${nodes.length} points, ${closed ? fmtArea(ringArea(nodes)) : fmtDistance(lineLength(nodes))}`);
  editFeature(f.id, true);
}

async function stopRecording() {
  state.recording = null;
  recordLayer.clearLayers();
  await db.kvDel('recording');
  await gps.stopBackground();
  $('#record-panel').hidden = true;
  $('#bottom-bar').hidden = false;
  document.body.classList.remove('crosshair-on');
}

$('#record-panel').addEventListener('click', async (e) => {
  const r = state.recording;
  if (!r) return;
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.pause != null) {
    r.paused = !r.paused;
    b.textContent = r.paused ? 'Resume' : 'Pause';
    await persistRecording();
    updateRecordPanel();
  } else if (b.dataset.add != null) {
    recordAddPoint();
  } else if (b.dataset.undo != null) {
    r.nodes.pop();
    await persistRecording();
    updateRecordPanel();
  } else if (b.dataset.finishLine != null) {
    finishWay(false);
  } else if (b.dataset.finishArea != null) {
    finishWay(true);
  } else if (b.dataset.more != null) {
    const what = await choiceDialog('Recording', [
      ...(r.mode !== 'crosshair' ? [{ value: 'center', label: '✛ Add point at crosshair', desc: 'mix in a point you cannot walk to' }] : []),
      { value: 'cancel', label: '🗑 Discard this recording' },
    ]);
    if (what === 'center') {
      const c = map.getCenter();
      r.nodes.push({ lat: c.lat, lon: c.lng, time: Date.now(), accuracy: null });
      await persistRecording();
      updateRecordPanel();
    } else if (what === 'cancel' && (await confirmDialog(`Discard ${r.nodes.length} recorded points?`, 'Discard', 'Keep recording', true))) {
      await stopRecording();
    }
  }
});

// ======================================================================
// List
// ======================================================================
function projectFeatures(all = false) {
  return [...state.features.values()].filter((f) => all || f.project === state.settings.project).sort((a, b) => b.created - a.created);
}

function openList() {
  let all = false;
  const sheet = openSheet({
    title: 'Collected features',
    body: `<label class="inline-check"><input type="checkbox" data-all> all projects</label><div class="summary"></div><div class="feature-list"></div>`,
    footer: `<button class="btn" data-clean>Remove uploaded…</button>`,
  });
  const render = () => {
    const list = projectFeatures(all);
    const n = (fn) => list.filter(fn).length;
    $('.summary', sheet).innerHTML = `${list.length} features · ${n((f) => f.status !== 'uploaded')} not uploaded · ${n((f) => f.status === 'uploaded')} uploaded`;
    $('.feature-list', sheet).innerHTML = list.length
      ? list.map((f) => `
        <button class="feature-item ${f.status}" data-id="${f.id}">
          <span class="ficon ${f.type === 'node' ? 'pt' : f.closed ? 'ar' : 'ln'}"></span>
          <span><b>${esc(featureLabel(f))}</b>
          <small>${f.type === 'node' ? 'point' : f.closed ? `area · ${fmtArea(ringArea(f.nodes))}` : `line · ${fmtDistance(lineLength(f.nodes))}`}
            · ${new Date(f.created).toLocaleString()}${all ? ` · ${esc(f.project)}` : ''}
            ${f.status === 'uploaded' ? ' · ✓ uploaded' : Object.keys(f.tags).length ? '' : ' · ⚠ no tags'}</small></span>
        </button>`).join('')
      : '<p class="muted">Nothing collected yet. Use “Point” or “Way” on the map.</p>';
  };
  sheet.addEventListener('click', async (e) => {
    const item = e.target.closest('.feature-item');
    if (item) {
      const f = state.features.get(Number(item.dataset.id));
      closeSheet(sheet);
      setFollow(false);
      if (f.type === 'node') map.setView([f.lat, f.lon], Math.max(map.getZoom(), 18));
      else map.fitBounds(L.latLngBounds(f.nodes.map((p) => [p.lat, p.lon])), { maxZoom: 19, padding: [40, 40] });
      editFeature(f.id);
    } else if (e.target.closest('[data-clean]')) {
      const up = projectFeatures(all).filter((f) => f.status === 'uploaded');
      if (!up.length) return toast('No uploaded features to remove');
      if (await confirmDialog(`Remove ${up.length} uploaded features from the phone? Export them first if you still need them for QGIS.`, 'Remove', 'Cancel', true)) {
        for (const f of up) { await db.deleteFeature(f.id); state.features.delete(f.id); }
        renderFeatures();
        render();
      }
    }
  });
  $('[data-all]', sheet).addEventListener('change', (e) => { all = e.target.checked; render(); });
  render();
}

// ======================================================================
// Upload to OSM
// ======================================================================
async function openUpload() {
  const s = state.settings;
  const srv = osm.serverConfig(s);
  let all = false;
  const sheet = openSheet({
    title: 'Upload to OpenStreetMap',
    body: `
      <div class="card" data-login></div>
      <label class="inline-check"><input type="checkbox" data-all> include all projects</label>
      <div class="card" data-summary></div>
      <label class="field"><span>Changeset comment (what did you map?)</span>
        <textarea data-comment rows="3" placeholder="e.g. Boreholes, school and footpaths in Kpalsi surveyed on foot">${esc(s.changesetComment)}</textarea></label>
      <p class="hint">Hashtags added: ${esc(s.changesetHashtags || '–')} · source=survey</p>
      <p class="hint">Only upload what you have verified on the ground. Do not upload personal data (names of private persons, phone numbers of individuals). Private survey fields are never uploaded.</p>`,
    footer: `<button class="btn primary" data-upload>Upload</button>`,
  });

  async function renderLogin() {
    const auth = await osm.getAuth(srv.key);
    $('[data-login]', sheet).innerHTML = auth
      ? `Server: <b>${esc(srv.label)}</b><br>Logged in as <b>${esc(auth.user?.name)}</b> <button class="btn small" data-logout>Log out</button>`
      : `Server: <b>${esc(srv.label)}</b><br>Not logged in. <button class="btn small primary" data-loginbtn>Log in</button>
         <br><small class="muted">You need a free account on ${esc(srv.web.replace('https://', ''))}.</small>`;
  }
  function pending() {
    return projectFeatures(all).filter((f) => f.status !== 'uploaded');
  }
  function renderSummary() {
    const list = pending();
    const problems = osm.validate(list);
    const nodes = list.filter((f) => f.type === 'node').length;
    $('[data-summary]', sheet).innerHTML = `<b>${list.length}</b> features to upload (${nodes} points, ${list.length - nodes} ways)` +
      (problems.length ? `<div class="warn"><b>${problems.length} problem(s) – these features will be skipped:</b><br>${problems.slice(0, 8).map(esc).join('<br>')}</div>` : '');
  }
  await renderLogin();
  renderSummary();
  $('[data-all]', sheet).addEventListener('change', (e) => { all = e.target.checked; renderSummary(); });

  sheet.addEventListener('click', async (e) => {
    if (e.target.closest('[data-loginbtn]')) {
      if (!navigator.onLine) return alertDialog('No network connection. Log in when you are back online – your data stays safe on the phone.');
      try { await osm.login(s); } catch (err) { alertDialog(esc(err.message)); }
    } else if (e.target.closest('[data-logout]')) {
      await osm.logout(srv.key);
      renderLogin();
    } else if (e.target.closest('[data-upload]')) {
      const comment = $('[data-comment]', sheet).value.trim();
      if (comment.length < 10) return alertDialog('Please describe your changes in the changeset comment (at least 10 characters).');
      if (!navigator.onLine) return alertDialog('No network connection. Try again when you are online.');
      const ok = pending().filter((f) => !osm.validate([f]).length);
      if (!ok.length) return alertDialog('Nothing to upload.');
      if (srv.key === 'production' && !(await confirmDialog(`Upload ${ok.length} features to the live OpenStreetMap database? They will be visible to everyone.`, 'Upload'))) return;
      state.settings.changesetComment = comment;
      await saveSettings();
      const b = busy('Uploading…');
      try {
        const res = await osm.upload(ok, s, { comment, onStep: b.update });
        for (const f of ok) {
          f.status = 'uploaded';
          f.osmId = res.idMap.get(f.id);
          f.changeset = res.changesetId;
          await db.saveFeature(f);
        }
        b.close();
        renderFeatures();
        renderSummary();
        if (await confirmDialog(`Uploaded ${ok.length} features in changeset ${res.changesetId}. Thank you for mapping!`, 'Open changeset', 'Close')) {
          Browser.open({ url: res.url });
        }
      } catch (err) {
        b.close();
        if (err.status === 401) { await osm.logout(srv.key); renderLogin(); }
        alertDialog(`Upload failed: ${esc(err.message)}<br><br>Your data is still on the phone.`);
      }
    }
  });
  sheet._refreshLogin = renderLogin;
  uploadSheet = sheet;
}
let uploadSheet = null;

// ======================================================================
// Export / email
// ======================================================================
function openExport() {
  const s = state.settings;
  const sheet = openSheet({
    title: 'Export & send',
    body: `
      <label class="inline-check"><input type="checkbox" data-all> all projects (otherwise only “${esc(s.project)}”)</label>
      <div class="card" data-count></div>
      <fieldset class="formats">${Object.entries(FORMATS).map(([k, f]) =>
        `<label class="inline-check"><input type="checkbox" value="${k}" ${k === 'geojson' || k === 'gpx' ? 'checked' : ''}> ${esc(f.label)}</label>`).join('')}</fieldset>
      <label class="field"><span>Send to e-mail address</span><input type="email" data-email value="${esc(s.email)}" placeholder="you@example.com"></label>
      <p class="hint">Without network the e-mail waits in your mail app’s outbox. GeoJSON opens directly in QGIS (Layer → Add Vector Layer).</p>`,
    footer: `<button class="btn" data-save>Save on phone</button><button class="btn" data-share>Share…</button><button class="btn primary" data-mail>E-mail</button>`,
  });
  const scope = () => projectFeatures($('[data-all]', sheet).checked);
  const updateCount = () => { $('[data-count]', sheet).textContent = `${scope().length} features`; };
  $('[data-all]', sheet).addEventListener('change', updateCount);
  updateCount();
  sheet.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-save],[data-share],[data-mail]');
    if (!action) return;
    const list = scope();
    const formats = $$('.formats input:checked', sheet).map((i) => i.value);
    if (!list.length) return toast('Nothing to export');
    if (!formats.length) return toast('Choose at least one format');
    const base = safeName($('[data-all]', sheet).checked ? 'osm_survey_all' : s.project);
    const files = buildFiles(list, formats, s, base);
    try {
      if (action.dataset.mail != null) {
        const email = $('[data-email]', sheet).value.trim();
        if (email !== s.email) { s.email = email; await saveSettings(); }
        await sendEmail(files, email, `${APP_NAME}: ${s.project} (${list.length} features)`,
          `Survey data exported from ${APP_NAME} ${APP_VERSION}\nProject: ${s.project}\nFeatures: ${list.length}\nFiles: ${files.map((f) => f.name).join(', ')}\n`);
      } else if (action.dataset.share != null) {
        await shareFiles(files, `${APP_NAME} export`);
      } else {
        const where = await saveToDocuments(files);
        alertDialog(`Saved ${files.length} file(s) to <b>${esc(where)}</b>.`);
      }
    } catch (err) {
      if (!/cancel/i.test(err.message)) alertDialog(`Export failed: ${esc(err.message)}`);
    }
  });
}

// ======================================================================
// Existing OSM data
// ======================================================================
async function loadExisting() {
  if (!navigator.onLine) return alertDialog('Loading existing OSM data needs network. Data loaded before stays available offline.');
  if (map.getZoom() < 15) return toast('Zoom in further (to a village or less) first');
  const b = busy('Loading OSM data for this view…');
  try {
    state.existing = await osm.fetchExisting(state.settings, map.getBounds());
    state.showExisting = true;
    renderExisting();
    b.close();
    toast(`Loaded ${state.existing.points.length} points and ${state.existing.ways.length} ways (stored for offline use)`, 4000);
  } catch (e) {
    b.close();
    alertDialog(`Could not load OSM data: ${esc(e.message)}`);
  }
}

// ======================================================================
// Settings
// ======================================================================
async function saveSettings() {
  await db.kvSet('settings', state.settings);
  $('#project-name').textContent = state.settings.project;
  setCacheLimit(state.settings.tileCacheMax);
}

async function openSettings() {
  const s = state.settings;
  const tileCount = await db.count('tiles');
  const hasBasemap = !!(await db.get('files', 'basemap'));
  const basemapInfo = (await db.kvGet('basemapInfo')) || null;
  const sheet = openSheet({
    title: 'Settings',
    body: `
      <h3>Survey</h3>
      <label class="field"><span>Current project</span><input data-k="project" value="${esc(s.project)}"></label>
      <label class="field"><span>My e-mail address (for exports)</span><input type="email" data-k="email" value="${esc(s.email)}"></label>
      <label class="inline-check"><input type="checkbox" data-k="showAllProjects" ${s.showAllProjects ? 'checked' : ''}> show features of all projects on the map</label>

      <h3>Map</h3>
      <label class="field"><span>Base map</span><select data-k="basemap">
        ${Object.entries(BASEMAPS).map(([k, b]) => `<option value="${k}" ${s.basemap === k ? 'selected' : ''}>${esc(b.label)}</option>`).join('')}
        <option value="offline" ${s.basemap === 'offline' ? 'selected' : ''}>Offline base map (.pmtiles)</option>
        <option value="custom" ${s.basemap === 'custom' ? 'selected' : ''}>Custom tile URL</option>
        <option value="none" ${s.basemap === 'none' ? 'selected' : ''}>None</option></select></label>
      <label class="field"><span>Custom tile URL ({z}/{x}/{y})</span><input data-k="customTileUrl" value="${esc(s.customTileUrl)}" placeholder="https://…/{z}/{x}/{y}.png"></label>
      <div class="card">
        <b>Offline base map</b><br>
        ${hasBasemap ? `Imported: ${esc(basemapInfo?.name || 'basemap.pmtiles')} (${((basemapInfo?.size || 0) / 1e6).toFixed(1)} MB, zoom ${basemapInfo?.minZoom}–${basemapInfo?.maxZoom})` : 'None imported.'}
        <br><label class="btn small file-btn">Import .pmtiles…<input type="file" data-pmtiles accept=".pmtiles,application/octet-stream" hidden></label>
        ${hasBasemap ? '<button class="btn small" data-rmbasemap>Remove</button>' : ''}
        <p class="hint">Create it in QGIS (Processing → “Generate XYZ tiles (MBTiles)”) and convert with <code>pmtiles convert area.mbtiles area.pmtiles</code>. See README.</p>
      </div>
      <div class="card">Cached map tiles: <b>${tileCount}</b> (max <input class="tiny" data-k="tileCacheMax" inputmode="numeric" value="${s.tileCacheMax}">)
        <button class="btn small" data-cleartiles>Clear</button>
        <p class="hint">Tiles you have looked at are kept for offline use. Before going to the field, look at your survey area at zoom levels 14–19 while online.</p></div>

      <h3>GPS</h3>
      <label class="field"><span>Averaging time for points (seconds)</span><input data-k="averageSeconds" inputmode="numeric" value="${s.averageSeconds}"></label>
      <label class="field"><span>Ignore fixes worse than (m)</span><input data-k="maxAccuracy" inputmode="numeric" value="${s.maxAccuracy}"></label>
      <label class="field"><span>Min. distance between track points (m)</span><input data-k="minDistance" inputmode="decimal" value="${s.minDistance}"></label>
      <label class="field"><span>Simplify walked ways, tolerance (m, 0 = off)</span><input data-k="simplifyTolerance" inputmode="decimal" value="${s.simplifyTolerance}"></label>

      <h3>OpenStreetMap</h3>
      <label class="field"><span>Server</span><select data-k="server">
        ${Object.entries(OSM_SERVERS).map(([k, v]) => `<option value="${k}" ${s.server === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
      <label class="field"><span>Changeset hashtags</span><input data-k="changesetHashtags" value="${esc(s.changesetHashtags)}" placeholder="#UDS #MapGhana"></label>
      <details><summary>OAuth client IDs (advanced)</summary>
        <label class="field"><span>Client ID – live server</span><input data-k="clientIdProduction" value="${esc(s.clientIdProduction)}" placeholder="${OSM_SERVERS.production.clientId ? 'built-in' : 'not set'}"></label>
        <label class="field"><span>Client ID – test server</span><input data-k="clientIdDev" value="${esc(s.clientIdDev)}" placeholder="${OSM_SERVERS.dev.clientId ? 'built-in' : 'not set'}"></label>
        <p class="hint">Redirect URI to register: <code>osmfieldcollector://oauth</code>, scopes: read_prefs, write_api.</p>
      </details>

      <h3>Data</h3>
      <div class="card">
        <label class="btn small file-btn">Restore backup…<input type="file" data-restore accept=".json,application/json" hidden></label>
        <button class="btn small" data-existing-clear>Clear loaded OSM data</button>
        <p class="hint">Create backups regularly via Export → “Backup”. Uninstalling the app deletes all data on the phone.</p>
      </div>
      <p class="muted">${APP_NAME} ${APP_VERSION} · Map data © OpenStreetMap contributors (ODbL)</p>`,
    onClose: async () => {
      await saveSettings();
      await setBasemap();
      renderFeatures();
    },
  });

  sheet.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.k) {
      const k = el.dataset.k;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (typeof DEFAULT_SETTINGS[k] === 'number') {
        v = Number(String(v).replace(',', '.'));
        if (!Number.isFinite(v) || v < 0) v = DEFAULT_SETTINGS[k];
      }
      if (k === 'project') v = v.trim() || DEFAULT_SETTINGS.project;
      s[k] = v;
      await saveSettings();
    } else if (el.dataset.pmtiles != null && el.files[0]) {
      const file = el.files[0];
      const b = busy(`Importing ${file.name} (${(file.size / 1e6).toFixed(0)} MB)…`);
      try {
        const { header } = await openPmtiles(file);
        await db.put('files', file, 'basemap');
        await db.kvSet('basemapInfo', { name: file.name, size: file.size, minZoom: header.minZoom, maxZoom: header.maxZoom });
        s.basemap = 'offline';
        await saveSettings();
        b.close();
        closeSheet(sheet);
        map.fitBounds([[header.minLat, header.minLon], [header.maxLat, header.maxLon]]);
        setFollow(false);
        toast('Offline base map imported');
      } catch (err) {
        b.close();
        alertDialog(`Import failed: ${esc(err.message)}`);
      }
    } else if (el.dataset.restore != null && el.files[0]) {
      try {
        const data = JSON.parse(await el.files[0].text());
        if (!Array.isArray(data.features)) throw new Error('Not a backup file');
        if (!(await confirmDialog(`Restore ${data.features.length} features? Features with the same id are overwritten.`, 'Restore'))) return;
        let maxId = (await db.kvGet('seq')) || 0;
        for (const f of data.features) { await db.saveFeature(f); state.features.set(f.id, f); maxId = Math.max(maxId, f.id); }
        await db.kvSet('seq', maxId);
        renderFeatures();
        toast(`Restored ${data.features.length} features`);
      } catch (err) {
        alertDialog(`Restore failed: ${esc(err.message)}`);
      }
    }
  });
  sheet.addEventListener('click', async (e) => {
    if (e.target.closest('[data-cleartiles]') && (await confirmDialog('Delete all cached map tiles?', 'Delete', 'Cancel', true))) {
      await db.clear('tiles');
      closeSheet(sheet);
      toast('Tile cache cleared');
    } else if (e.target.closest('[data-rmbasemap]') && (await confirmDialog('Remove the offline base map?', 'Remove', 'Cancel', true))) {
      await db.del('files', 'basemap');
      await db.kvDel('basemapInfo');
      if (s.basemap === 'offline') s.basemap = 'osm';
      closeSheet(sheet);
    } else if (e.target.closest('[data-existing-clear]')) {
      state.existing = null;
      await db.kvDel('existingOsm');
      renderExisting();
      toast('Loaded OSM data cleared');
    }
  });
}

// ======================================================================
// Menus & wiring
// ======================================================================
async function openMore() {
  const v = await choiceDialog('Menu', [
    { value: 'export', label: '✉ Export & send by e-mail', desc: 'GeoJSON for QGIS, GPX, OSM, backup' },
    { value: 'existing', label: '⬇ Load existing OSM data here', desc: 'see what is already mapped (needs network, kept offline)' },
    ...(state.existing ? [{ value: 'toggle', label: state.showExisting ? '◌ Hide existing OSM data' : '◉ Show existing OSM data' }] : []),
    { value: 'project', label: '📁 Switch project', desc: `current: ${esc(state.settings.project)}` },
    { value: 'settings', label: '⚙ Settings' },
    { value: 'help', label: '? Help' },
  ]);
  if (v === 'export') openExport();
  else if (v === 'existing') loadExisting();
  else if (v === 'toggle') { state.showExisting = !state.showExisting; renderExisting(); }
  else if (v === 'project') switchProject();
  else if (v === 'settings') openSettings();
  else if (v === 'help') openHelp();
}

async function switchProject() {
  const projects = [...new Set([...state.features.values()].map((f) => f.project).concat(state.settings.project))].sort();
  const v = await choiceDialog('Project', [
    ...projects.map((p) => ({ value: p, label: p === state.settings.project ? `● ${esc(p)}` : esc(p), desc: `${[...state.features.values()].filter((f) => f.project === p).length} features` })),
    { value: '__new', label: '+ New project…' },
  ]);
  if (!v) return;
  let name = v;
  if (v === '__new') {
    name = (await promptDialog('Name of the new project (e.g. community and topic)', '', 'Kpalsi water points 2026'))?.trim();
    if (!name) return;
  }
  state.settings.project = name;
  await saveSettings();
  renderFeatures();
  toast(`Project: ${name}`);
}

function openHelp() {
  openSheet({
    title: 'Help',
    body: `
      <h3>Collecting</h3>
      <p><b>Point</b>: stand at the feature and tap Point → GPS. The position is averaged over a few seconds. For features you cannot reach, move the map so the crosshair is on it.</p>
      <p><b>Way</b>: “Walk it” records a GPS track while you walk (screen may be off). “Corner by corner” is best for buildings and fields: stand at each corner and tap Add point. Finish as <i>line</i> (road, path, river) or <i>area</i> (building, field, compound).</p>
      <p>Then choose the type (e.g. Borehole, School, Footpath) and fill in the fields. Colours: <span style="color:#e8590c">orange</span> = new, <span style="color:#c92a2a">red</span> = no tags yet, <span style="color:#2b8a3e">green</span> = uploaded.</p>
      <h3>Without network</h3>
      <p>Everything is stored on the phone. Upload and e-mail later. Map tiles you looked at before are available offline; for aerial imagery without network import an offline base map (Settings).</p>
      <h3>Uploading</h3>
      <p>Log in with your OSM account and upload. Try the <b>test server</b> first (Settings → Server). New ways are not connected to existing roads – check and connect them afterwards in iD (openstreetmap.org → Edit) or JOSM.</p>
      <h3>QGIS</h3>
      <p>Export as GeoJSON and open it in QGIS. All tags become attributes; your private survey fields too. Attributes starting with “_” are metadata (accuracy, date, project, OSM id).</p>`,
  });
}

$('#btn-point').addEventListener('click', addPoint);
$('#btn-way').addEventListener('click', startWay);
$('#btn-list').addEventListener('click', openList);
$('#btn-upload').addEventListener('click', openUpload);
$('#btn-more').addEventListener('click', openMore);
$('#btn-follow').addEventListener('click', () => setFollow(!state.follow));
$('#btn-zoom-in').addEventListener('click', () => map.zoomIn());
$('#btn-zoom-out').addEventListener('click', () => map.zoomOut());
$('#project-name').addEventListener('click', switchProject);

function updateCounts() {
  const pending = [...state.features.values()].filter((f) => f.status !== 'uploaded').length;
  $('#btn-upload .count').textContent = pending ? pending : '';
}

// Android back button: close dialogs/sheets first, never kill a recording.
App.addListener('backButton', () => {
  if (closeDialog()) return;
  if (closeSheet()) return;
  App.minimizeApp();
}).catch(() => {});

// OSM login redirect (osmfieldcollector://oauth?code=…)
App.addListener('appUrlOpen', async ({ url }) => {
  if (!url.startsWith('osmfieldcollector://oauth')) return;
  try {
    const auth = await osm.handleRedirect(url);
    toast(`Logged in as ${auth.user?.name}`, 3500);
    uploadSheet?._refreshLogin?.();
  } catch (e) {
    alertDialog(esc(e.message));
  }
}).catch(() => {});

// Pause the foreground GPS watcher when the app is in the background
// (saves battery) – unless a way is being recorded.
App.addListener('appStateChange', ({ isActive }) => {
  if (state.recording && state.recording.mode !== 'crosshair') return;
  if (isActive) gps.start();
  else gps.stop();
}).catch(() => {});

window.addEventListener('online', () => $('#net-badge').hidden = true);
window.addEventListener('offline', () => $('#net-badge').hidden = false);

// ======================================================================
// Start-up
// ======================================================================
(async function init() {
  $('#net-badge').hidden = navigator.onLine;
  await db.requestPersistence();
  const stored = await db.kvGet('settings');
  state.settings = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  setCacheLimit(state.settings.tileCacheMax);
  $('#project-name').textContent = state.settings.project;
  for (const f of await db.allFeatures()) state.features.set(f.id, f);
  state.existing = (await db.kvGet('existingOsm')) || null;
  await setBasemap();
  renderFeatures();
  renderExisting();
  await gps.start();

  // Resume an interrupted recording (app was closed or killed by Android).
  const rec = await db.kvGet('recording');
  if (rec) {
    if (await confirmDialog(`An unfinished way recording with ${rec.nodes.length} points was found. Continue it?`, 'Continue', 'Discard')) {
      state.recording = rec;
      if (rec.mode !== 'crosshair') await gps.startBackground();
      showRecordPanel();
    } else {
      await db.kvDel('recording');
    }
  }
  if (!stored) {
    const name = await promptDialog(`Welcome to ${APP_NAME}!<br>Name your first project (e.g. community and topic):`, '', 'Kpalsi water points 2026');
    if (name && name.trim()) { state.settings.project = name.trim(); }
    await saveSettings();
  }
})();
