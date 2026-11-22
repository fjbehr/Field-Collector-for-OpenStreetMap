// Project templates ("survey forms") shared by a teacher via QR code or file.
//
// A template contains: project name, changeset hashtags/comment, survey form
// fields (private attributes asked for every feature) and favourites
// (pre-filled tag sets). It is compressed (deflate) and base64url-encoded so
// that it fits into a QR code:   OFC1:<base64url(deflate(json))>

import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';
import { TEMPLATE_VERSION } from './config.js';
import { icon } from './icons.js';

const PREFIX = 'OFC1:';
export const FIELD_TYPES = ['text', 'number', 'select', 'check', 'textarea'];

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeTemplate(tpl) {
  return PREFIX + b64url(deflateSync(strToU8(JSON.stringify({ ...tpl, v: TEMPLATE_VERSION })), { level: 9 }));
}

// Accepts the QR text (OFC1:…) or a plain JSON file content.
export function decodeTemplate(text) {
  const s = String(text || '').trim();
  let obj;
  try {
    obj = s.startsWith(PREFIX) ? JSON.parse(strFromU8(inflateSync(unb64url(s.slice(PREFIX.length))))) : JSON.parse(s);
  } catch {
    throw new Error('This is not a project template of this app.');
  }
  return validateTemplate(obj);
}

export function validateTemplate(t) {
  if (!t || typeof t !== 'object' || !t.project) throw new Error('The template has no project name.');
  const str = (x, max = 200) => String(x ?? '').slice(0, max);
  return {
    v: Number(t.v) || 1,
    project: str(t.project, 80).trim(),
    hashtags: str(t.hashtags),
    comment: str(t.comment, 255),
    fields: (Array.isArray(t.fields) ? t.fields : []).slice(0, 40).filter((f) => f && f.key).map((f) => ({
      key: str(f.key, 60).trim(),
      label: str(f.label || f.key, 120),
      type: FIELD_TYPES.includes(f.type) ? f.type : 'text',
      options: Array.isArray(f.options) ? f.options.map((o) => str(o, 60)).slice(0, 30) : [],
      required: !!f.required,
    })),
    favourites: (Array.isArray(t.favourites) ? t.favourites : []).slice(0, 40).filter((f) => f && f.name && f.tags).map((f) => ({
      name: str(f.name, 80),
      geom: str(f.geom, 3),
      tags: Object.fromEntries(Object.entries(f.tags).map(([k, v]) => [str(k, 255), str(v, 255)])),
      extra: Object.fromEntries(Object.entries(f.extra || {}).map(([k, v]) => [str(k, 60), str(v, 255)])),
    })),
  };
}

// QR code as SVG markup.
export function qrSvg(text) {
  const qr = qrcode(0, 'L');
  qr.addData(text, 'Byte');
  qr.make();
  return { svg: qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true }), version: (qr.getModuleCount() - 17) / 4 };
}

// Decode a QR code from an image file (photo of the teacher's QR code).
export async function readQrFromImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const res = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
  if (!res) throw new Error('No QR code found in the picture. Take it closer and sharper.');
  return res.data;
}

// Live camera scanner. Resolves with the QR text, or null when cancelled.
export function scanQr() {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'dialog-backdrop scanner';
    el.innerHTML = `
      <video playsinline muted></video>
      <div class="scan-frame"></div>
      <div class="scan-bar">
        <p data-msg>Point the camera at the teacher’s QR code</p>
        <label class="btn">${icon('image-plus')}Use a photo<input type="file" accept="image/*" hidden data-img></label>
        <button class="btn primary" data-cancel>Cancel</button>
      </div>`;
    document.body.appendChild(el);
    const video = el.querySelector('video');
    const msg = el.querySelector('[data-msg]');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let stream = null;
    let stopped = false;
    const done = (v) => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
      el.remove();
      resolve(v);
    };
    el._cancel = () => done(null);
    el.querySelector('[data-cancel]').onclick = () => done(null);
    el.querySelector('[data-img]').onchange = async (e) => {
      try { done(await readQrFromImage(e.target.files[0])); } catch (err) { msg.textContent = err.message; }
    };
    const tick = () => {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const scale = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const res = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
        if (res?.data) return done(res.data);
      }
      requestAnimationFrame(tick);
    };
    if (!navigator.mediaDevices?.getUserMedia) {
      msg.textContent = 'The live camera is not available – use “Use a photo” instead.';
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        video.srcObject = s;
        video.play().catch(() => {});
        requestAnimationFrame(tick);
      })
      .catch(() => { msg.textContent = 'No camera access – allow the camera in the Android settings, or use “Use a photo”.'; });
  });
}
