// SPDX-License-Identifier: GPL-3.0-or-later
// Collects the licence texts of all libraries that end up in the app into
// public/licenses/ (shown in More → About). Runs automatically before
// `npm run build`.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const out = join(root, 'public', 'licenses');
mkdirSync(out, { recursive: true });

// Libraries bundled into the app (JavaScript) or compiled into the APK.
const JS = [
  'leaflet', 'lucide', 'fflate', 'jsqr', 'qrcode-generator', 'pmtiles',
  '@capacitor/core', '@capacitor/android', '@capacitor/app', '@capacitor/browser',
  '@capacitor/filesystem', '@capacitor/share', '@capacitor-community/background-geolocation',
  'capacitor-email-composer',
];

// Packages that ship without a licence file: standard text + copyright from the project.
const FALLBACK = {
  'qrcode-generator': { holder: 'Copyright (c) 2009 Kazuhiko Arase', text: 'MIT' },
  'pmtiles': { holder: 'Copyright 2021 Protomaps LLC', text: 'BSD-3-Clause' },
};
const TEXTS = {
  'MIT': (c) => `${c}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
  'BSD-3-Clause': (c) => `${c}

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`,
};

const line = '='.repeat(78);
const parts = [
  'Field Collector for OpenStreetMap – third-party software',
  '',
  'This app contains the following open-source software. Their licences allow',
  'use in a GPL-3.0-or-later app; their copyright notices and licence texts follow.',
  '',
];
const list = [];

for (const name of JS) {
  const dir = join(root, 'node_modules', name);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE'].map((f) => join(dir, f)).find(existsSync);
  let text;
  if (file) text = readFileSync(file, 'utf8').trim();
  else if (FALLBACK[name]) text = TEXTS[FALLBACK[name].text](FALLBACK[name].holder);
  else throw new Error(`No licence text found for ${name}`);
  list.push({ name, version: pkg.version, license: pkg.license, url: pkg.homepage || '' });
  parts.push(line, `${name} ${pkg.version} – ${pkg.license}${pkg.homepage ? ` – ${pkg.homepage}` : ''}`, line, '', text, '');
}

// Native Android libraries in the APK (licence text: Apache-2.0 as included above for jsQR).
const NATIVE = [
  { name: 'AndroidX / Android Jetpack (appcompat, coordinatorlayout, core-splashscreen)', license: 'Apache-2.0', url: 'https://developer.android.com/jetpack/androidx', holder: 'Copyright The Android Open Source Project' },
  { name: 'Apache Cordova Android framework', license: 'Apache-2.0', url: 'https://cordova.apache.org', holder: 'Copyright The Apache Software Foundation' },
];
for (const n of NATIVE) {
  list.push({ name: n.name, version: '', license: n.license, url: n.url });
  parts.push(line, `${n.name} – ${n.license} – ${n.url}`, line, '', `${n.holder}.`,
    'Licensed under the Apache License, Version 2.0 (full text above, see jsqr).', '');
}

writeFileSync(join(out, 'THIRD-PARTY-NOTICES.txt'), parts.join('\n'));
writeFileSync(join(out, 'third-party.json'), JSON.stringify(list, null, 1));
copyFileSync(join(root, 'LICENSE'), join(out, 'LICENSE.txt'));
console.log(`Licences of ${list.length} components written to public/licenses/`);
