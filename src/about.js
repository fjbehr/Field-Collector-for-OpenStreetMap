// SPDX-License-Identifier: GPL-3.0-or-later
// About screen: version, copyright, licence notice (GPL "Appropriate Legal
// Notices"), plain-language disclaimer, privacy summary, attributions and
// the licences of the bundled open-source components.
import { Browser } from '@capacitor/browser';
import { APP_NAME, APP_VERSION, COPYRIGHT, LICENSE_NAME, SOURCE_URL } from './config.js';
import { icon } from './icons.js';
import { openSheet, esc } from './ui.js';
import appIcon from '../resources/icon.svg?url';

const link = (url, text) => `<a href="${esc(url)}" data-ext>${text || esc(url.replace(/^https?:\/\//, ''))}</a>`;

async function showText(title, path) {
  const sheet = openSheet({ title, body: '<pre class="license-text">Loading…</pre>' });
  const pre = sheet.querySelector('.license-text');
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pre.textContent = await res.text();
  } catch (err) {
    pre.textContent = `Could not load the text (${err.message}). It is also available at https://www.gnu.org/licenses/gpl-3.0.html`;
  }
}

export async function openAbout() {
  const sheet = openSheet({
    title: 'About',
    className: 'about',
    body: `
      <div class="about-head">
        <img class="about-logo" src="${appIcon}" alt="">
        <div><b>${APP_NAME}</b><small>Version ${APP_VERSION}</small></div>
      </div>
      <p>${COPYRIGHT}</p>
      <p class="legal">This program is free software: you can redistribute it and/or modify it under the terms of the
        GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or
        (at your option) any later version.</p>
      <p class="legal">This program is distributed in the hope that it will be useful, but <b>WITHOUT ANY WARRANTY</b>;
        without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General
        Public License for more details.</p>
      <div class="btn-row">
        <button class="btn" data-license>${icon('info')}Licence (GPL-3.0)</button>
      </div>
      <p class="hint">${LICENSE_NAME}. Source code: ${SOURCE_URL ? link(SOURCE_URL) : 'available from the author on request.'}</p>

      <h3>${icon('alert', 'sm')}Please note</h3>
      <ul class="notes">
        <li><b>Use at your own risk.</b> The app is free and provided “as is”. There is no guarantee that it works
          correctly or without errors.</li>
        <li><b>GPS is not exact.</b> Positions can be several metres off, under trees or near buildings even more.
          Do not use the app for navigation or safety-related purposes.</li>
        <li><b>Back up your data.</b> Everything is stored only on this phone. Uninstalling the app, clearing its data
          or losing the phone deletes it. Export the ZIP and make backups regularly.</li>
        <li><b>Uploads are public and permanent.</b> Everything uploaded to OpenStreetMap can be seen by everyone,
          together with your OSM user name and the time. Never upload personal data (names of people, phone
          numbers, health information…).</li>
        <li><b>Survey answers and photos are your responsibility.</b> They stay on the phone and in your exports.
          Ask people for their consent before interviewing or photographing them, and protect the data
          (in Ghana: Data Protection Act, 2012 – Act 843).</li>
      </ul>

      <h3>${icon('eye-off', 'sm')}Privacy</h3>
      <p class="hint">The app has no advertising, no analytics and no tracking. Your data leaves the phone only when you
        upload, export or share it. It connects to: openstreetmap.org (login, upload, loading OSM data),
        the map tile servers you choose (OpenStreetMap, Esri), Nominatim (place search) and taginfo (tag
        suggestions). Their privacy policies apply.</p>

      <h3>${icon('layers', 'sm')}Map data</h3>
      <p class="hint">Map data © ${link('https://www.openstreetmap.org/copyright', 'OpenStreetMap contributors')},
        available under the Open Database Licence (ODbL). What you upload becomes part of OpenStreetMap under the
        same licence (${link('https://osmfoundation.org/wiki/Licence/Contributor_Terms', 'Contributor Terms')}).
        Place search: ${link('https://nominatim.org', 'Nominatim')}. Aerial imagery: © Esri, Maxar, Earthstar
        Geographics. “OpenStreetMap” is a trademark of the OpenStreetMap Foundation; this app is not made or
        endorsed by the Foundation.</p>

      <h3>${icon('list', 'sm')}Open-source components</h3>
      <div class="components">Loading…</div>
      <button class="btn small" data-notices>Show all licence texts</button>`,
  });

  sheet.addEventListener('click', (e) => {
    const a = e.target.closest('[data-ext]');
    if (a) {
      e.preventDefault();
      Browser.open({ url: a.getAttribute('href') }).catch(() => {});
    } else if (e.target.closest('[data-license]')) {
      showText('GNU General Public License v3', './licenses/LICENSE.txt');
    } else if (e.target.closest('[data-notices]')) {
      showText('Open-source licences', './licenses/THIRD-PARTY-NOTICES.txt');
    }
  });

  const box = sheet.querySelector('.components');
  try {
    const list = await (await fetch('./licenses/third-party.json')).json();
    box.innerHTML = `<table class="comp-table">${list.map((c) => `<tr>
        <td>${c.url ? link(c.url, esc(c.name)) : esc(c.name)}${c.version ? ` <small>${esc(c.version)}</small>` : ''}</td>
        <td>${esc(c.license)}</td></tr>`).join('')}</table>`;
  } catch {
    box.textContent = 'Leaflet, Lucide, fflate, jsQR, qrcode-generator, PMTiles, Capacitor, AndroidX.';
  }
}
