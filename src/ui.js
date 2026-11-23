// SPDX-License-Identifier: GPL-3.0-or-later
// Tiny UI toolkit: sheets (full-screen panels), dialogs and toasts.
import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let toastTimer;
export function toast(msg, ms = 2500) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---- sheets: stacked full-screen panels; Android back closes the top one ----
const stack = [];

export function openSheet({ title, body, footer = '', onClose, className = '' }) {
  const el = document.createElement('section');
  el.className = `sheet ${className}`;
  el.innerHTML = `
    <header class="sheet-head">
      <button class="icon-btn" data-close aria-label="Back">${icon('arrow-left')}</button>
      <h2>${title}</h2>
    </header>
    <div class="sheet-body">${body}</div>
    ${footer ? `<footer class="sheet-foot">${footer}</footer>` : ''}`;
  document.body.appendChild(el);
  const entry = { el, onClose };
  stack.push(entry);
  el.querySelector('[data-close]').addEventListener('click', () => closeSheet(el));
  requestAnimationFrame(() => el.classList.add('open'));
  return el;
}

export function closeSheet(el) {
  const i = el ? stack.findIndex((s) => s.el === el) : stack.length - 1;
  if (i < 0) return false;
  const [entry] = stack.splice(i, 1);
  entry.el.classList.remove('open');
  setTimeout(() => entry.el.remove(), 200);
  entry.onClose?.();
  return true;
}

export const hasOpenSheet = () => stack.length > 0 || !!$('.dialog-backdrop');

// ---- dialogs ----
function dialog(inner, setup, cls = '') {
  return new Promise((resolve) => {
    const bd = document.createElement('div');
    bd.className = `dialog-backdrop ${cls}`;
    bd.innerHTML = `<div class="dialog" role="dialog">${inner}</div>`;
    document.body.appendChild(bd);
    const done = (v) => { bd.remove(); resolve(v); };
    bd._cancel = () => done(null);
    // tap outside an action sheet closes it
    if (cls.includes('action-sheet')) bd.addEventListener('click', (e) => { if (e.target === bd) done(null); });
    requestAnimationFrame(() => bd.classList.add('open'));
    setup(bd, done);
  });
}

export function closeDialog() {
  const bd = $('.dialog-backdrop');
  if (bd) { bd._cancel(); return true; }
  return false;
}

export function confirmDialog(msg, ok = 'OK', cancel = 'Cancel', danger = false) {
  return dialog(
    `<p>${msg}</p><div class="dialog-actions">
       <button class="btn" data-v="0">${cancel}</button>
       <button class="btn ${danger ? 'danger' : 'primary'}" data-v="1">${ok}</button></div>`,
    (bd, done) => bd.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => done(b.dataset.v === '1')))
  ).then((v) => !!v);
}

export function alertDialog(msg) {
  return dialog(`<p>${msg}</p><div class="dialog-actions"><button class="btn primary">OK</button></div>`, (bd, done) =>
    bd.querySelector('button').addEventListener('click', () => done(true))
  );
}

export function promptDialog(msg, value = '', placeholder = '') {
  return dialog(
    `<label class="field"><span>${msg}</span><input type="text" value="${esc(value)}" placeholder="${esc(placeholder)}"></label>
     <div class="dialog-actions"><button class="btn" data-v="0">Cancel</button><button class="btn primary" data-v="1">OK</button></div>`,
    (bd, done) => {
      const input = bd.querySelector('input');
      input.focus();
      input.select();
      input.addEventListener('keydown', (e) => e.key === 'Enter' && done(input.value));
      bd.querySelectorAll('[data-v]').forEach((b) =>
        b.addEventListener('click', () => done(b.dataset.v === '1' ? input.value : null))
      );
    }
  );
}

// Action sheet sliding up from the bottom.
// options: [{ value, label, desc, icon, tone: 'danger'|'active' }]
export function choiceDialog(title, options) {
  return dialog(
    `<div class="grabber"></div><h3>${title}</h3><div class="choice-list">${options
      .map((o, i) => `<button class="choice ${o.tone || ''}" data-i="${i}">
          ${o.icon ? `<span class="choice-ico">${icon(o.icon)}</span>` : ''}
          <span class="choice-text"><b>${o.label}</b>${o.desc ? `<small>${o.desc}</small>` : ''}</span>
          ${o.tone === 'active' ? icon('check', 'choice-end') : icon('chevron-right', 'choice-end')}
        </button>`)
      .join('')}</div>
     <button class="btn ghost block" data-cancel>Cancel</button>`,
    (bd, done) => {
      bd.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => done(options[b.dataset.i].value)));
      bd.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    },
    'action-sheet'
  );
}

// Busy overlay with a message that can be updated.
export function busy(msg) {
  const el = document.createElement('div');
  el.className = 'dialog-backdrop busy';
  el.innerHTML = `<div class="dialog"><div class="spinner"></div><p>${esc(msg)}</p></div>`;
  el._cancel = () => {};
  document.body.appendChild(el);
  return {
    update: (m) => { el.querySelector('p').textContent = m; },
    close: () => el.remove(),
  };
}
