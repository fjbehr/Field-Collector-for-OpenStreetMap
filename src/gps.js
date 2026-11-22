// GPS access.
//
// On Android the @capacitor-community/background-geolocation plugin is used.
// A normal watcher runs while the app is visible; while a way is being
// recorded a "background" watcher with a persistent notification keeps GPS
// running even when the screen is off.
//
// In a desktop browser (development) navigator.geolocation is used, and with
// "?sim" in the URL a simulated walk around Tamale is generated.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { averageFixes } from './geo.js';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
const native = Capacitor.isNativePlatform();
const simulate = !native && new URLSearchParams(location.search).has('sim');

const listeners = new Set();
let watcherId = null;
let watcherIsBackground = false;
let last = null;
let errorHandler = () => {};

export function lastFix() {
  return last;
}
export function onFix(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function onError(fn) {
  errorHandler = fn;
}

function emit(fix) {
  last = fix;
  for (const fn of listeners) {
    try { fn(fix); } catch (e) { console.error(e); }
  }
}

function fromPlugin(loc) {
  return {
    lat: loc.latitude,
    lon: loc.longitude,
    accuracy: loc.accuracy,
    altitude: loc.altitude,
    speed: loc.speed,
    bearing: loc.bearing,
    time: loc.time || Date.now(),
    simulated: loc.simulated,
  };
}

async function addNativeWatcher(background) {
  const opts = { requestPermissions: true, stale: false, distanceFilter: 0 };
  if (background) {
    opts.backgroundTitle = 'Recording a way';
    opts.backgroundMessage = 'GPS stays on while you record. Open the app to finish.';
  }
  return BackgroundGeolocation.addWatcher(opts, (loc, err) => {
    if (err) {
      errorHandler(err);
      return;
    }
    if (loc) emit(fromPlugin(loc));
  });
}

async function stopWatcher() {
  if (watcherId == null) return;
  const id = watcherId;
  watcherId = null;
  if (native) await BackgroundGeolocation.removeWatcher({ id });
  else if (simulate) clearInterval(id);
  else navigator.geolocation.clearWatch(id);
}

async function startWatcher(background) {
  await stopWatcher();
  watcherIsBackground = background;
  if (native) {
    watcherId = await addNativeWatcher(background);
  } else if (simulate) {
    watcherId = startSimulation();
  } else if (navigator.geolocation) {
    watcherId = navigator.geolocation.watchPosition(
      (p) =>
        emit({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
          altitude: p.coords.altitude,
          speed: p.coords.speed,
          bearing: p.coords.heading,
          time: p.timestamp,
        }),
      (e) => errorHandler({ code: e.code === 1 ? 'NOT_AUTHORIZED' : 'UNAVAILABLE', message: e.message }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 60000 }
    );
  } else {
    errorHandler({ code: 'UNAVAILABLE', message: 'No geolocation available' });
  }
}

export const start = () => startWatcher(false);
export const stop = () => stopWatcher();
export const startBackground = () => startWatcher(true);
export const stopBackground = () => (watcherIsBackground ? startWatcher(false) : Promise.resolve());
export const isRunning = () => watcherId != null;
export const openSettings = () => native && BackgroundGeolocation.openSettings();

// Collect fixes for `seconds` and return their weighted average. Fixes worse
// than `maxAccuracy` are skipped unless nothing better arrives.
export function averagePosition(seconds, maxAccuracy, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const good = [];
    const all = [];
    const t0 = Date.now();
    const off = onFix((f) => {
      all.push(f);
      if (f.accuracy <= maxAccuracy) good.push(f);
      onProgress({ elapsed: (Date.now() - t0) / 1000, samples: good.length, fix: f });
    });
    const timer = setInterval(() => {
      const elapsed = (Date.now() - t0) / 1000;
      onProgress({ elapsed, samples: good.length, fix: last });
      if (elapsed >= seconds && (good.length >= 1 || elapsed >= seconds * 4)) {
        finish();
      }
    }, 250);
    function finish() {
      clearInterval(timer);
      off();
      const used = good.length ? good : all.slice(-3);
      const avg = averageFixes(used);
      if (avg) resolve(avg);
      else reject(new Error('No GPS position received'));
    }
    averagePosition.cancel = () => {
      clearInterval(timer);
      off();
      reject(new Error('cancelled'));
    };
  });
}

// ---- simulation for development in a desktop browser ----
function startSimulation() {
  let lat = 9.4034, lon = -0.8424, heading = Math.random() * 360;
  return setInterval(() => {
    heading += (Math.random() - 0.5) * 40;
    const step = 1.2; // m/s walking
    lat += (step * Math.cos((heading * Math.PI) / 180)) / 111320;
    lon += (step * Math.sin((heading * Math.PI) / 180)) / (111320 * Math.cos((lat * Math.PI) / 180));
    const accuracy = 3 + Math.random() * 6;
    const jitter = () => ((Math.random() - 0.5) * accuracy) / 111320;
    emit({ lat: lat + jitter(), lon: lon + jitter(), accuracy, altitude: 180, speed: step, time: Date.now(), simulated: true });
  }, 1000);
}
