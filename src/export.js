// Export formats and delivery (email, share sheet, save to Documents).
//
//   GeoJSON – for QGIS (all OSM tags + private survey fields + metadata)
//   GPX     – waypoints and raw GPS tracks
//   .osm    – JOSM file of features not yet uploaded
//   Backup  – complete internal data (without photos), can be restored in Settings
//   ZIP     – GeoJSON + GPX + photos/ folder, for QGIS

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { EmailComposer } from 'capacitor-email-composer';
import { APP_NAME, APP_VERSION } from './config.js';
import { buildElements, cleanTags, osmFileXml, xmlEsc } from './osm.js';
import { featureLabel } from './presets.js';
import { zipSync, strToU8 } from 'fflate';
import { photoBlob, photoFileName } from './photos.js';

const native = Capacitor.isNativePlatform();

// ---------- formats ----------
function geometry(f) {
  if (f.type === 'node') {
    const c = [f.lon, f.lat];
    if (f.altitude != null) c.push(Math.round(f.altitude * 10) / 10);
    return { type: 'Point', coordinates: c };
  }
  const ring = f.nodes.map((p) => [p.lon, p.lat]);
  if (f.closed && ring.length >= 3) return { type: 'Polygon', coordinates: [[...ring, ring[0]]] };
  return { type: 'LineString', coordinates: ring };
}

export function toGeoJSON(features) {
  return JSON.stringify(
    {
      type: 'FeatureCollection',
      name: 'osm_field_survey',
      features: features.map((f) => ({
        type: 'Feature',
        id: f.id,
        geometry: geometry(f),
        properties: {
          ...cleanTags(f.tags),
          ...cleanTags(f.extra), // private survey fields (never uploaded to OSM)
          _id: f.id,
          _project: f.project,
          _label: featureLabel(f),
          _created: new Date(f.created).toISOString(),
          _accuracy_m: f.accuracy != null ? Math.round(f.accuracy * 10) / 10 : null,
          _samples: f.samples ?? null,
          _status: f.kind === 'edit' ? (f.status === 'uploaded' ? 'edit_uploaded' : 'edited') : f.status,
          _osm_id: f.osmId ? `${f.type === 'node' ? 'n' : 'w'}${f.osmId}` : null,
          _note: f.note || null,
          _photo: f.photos?.length ? photoFileName(f, 0) : null,
          _photos: f.photos?.length ? f.photos.map((p, i) => photoFileName(f, i)).join(';') : null,
        },
      })),
    },
    null,
    1
  );
}

export function toGPX(features) {
  const iso = (t) => new Date(t).toISOString();
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="${APP_NAME} ${APP_VERSION}" xmlns="http://www.topografix.com/GPX/1/1">`,
  ];
  for (const f of features.filter((x) => x.type === 'node')) {
    out.push(`  <wpt lat="${f.lat.toFixed(7)}" lon="${f.lon.toFixed(7)}">`);
    if (f.altitude != null) out.push(`    <ele>${f.altitude.toFixed(1)}</ele>`);
    out.push(`    <time>${iso(f.created)}</time>`, `    <name>${xmlEsc(featureLabel(f))}</name>`);
    const desc = Object.entries(cleanTags(f.tags)).map(([k, v]) => `${k}=${v}`).join('; ');
    if (desc) out.push(`    <desc>${xmlEsc(desc)}</desc>`);
    out.push('  </wpt>');
  }
  for (const f of features.filter((x) => x.type === 'way')) {
    const pts = f.track && f.track.length ? f.track : f.nodes;
    out.push('  <trk>', `    <name>${xmlEsc(featureLabel(f))}</name>`, '    <trkseg>');
    for (const p of pts) {
      out.push(`      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${p.time ? `<time>${iso(p.time)}</time>` : ''}</trkpt>`);
    }
    out.push('    </trkseg>', '  </trk>');
  }
  out.push('</gpx>');
  return out.join('\n');
}

export function toOsmFile(features) {
  return osmFileXml(buildElements(features.filter((f) => f.status !== 'uploaded')));
}

export function toBackup(features, settings) {
  return JSON.stringify({ app: APP_NAME, version: APP_VERSION, exported: new Date().toISOString(), settings, features });
}

const ZIP_README = `Exported from ${APP_NAME}

*.geojson  – open in QGIS: Layer > Add Layer > Add Vector Layer
*.gpx      – waypoints and raw GPS tracks
photos/    – photos of the features; the attribute "_photo" / "_photos"
             holds the path relative to this folder.

Tip (QGIS): Layer Properties > Attributes Form > field "_photo" >
widget type "Attachment", path relative to this folder, show as image.
`;

async function toZip(features, settings, base) {
  const files = {
    [`${base}.geojson`]: strToU8(toGeoJSON(features)),
    [`${base}.gpx`]: strToU8(toGPX(features)),
    'README.txt': strToU8(ZIP_README),
  };
  for (const f of features) {
    for (const [i, p] of (f.photos || []).entries()) {
      const blob = await photoBlob(p.id);
      if (blob) files[photoFileName(f, i)] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
    }
  }
  return zipSync(files, { level: 6 });
}

export const FORMATS = {
  zip: { label: 'ZIP for QGIS (GeoJSON + GPX + photos)', ext: 'zip', mime: 'application/zip', make: (f, s, base) => toZip(f, s, base) },
  geojson: { label: 'GeoJSON (QGIS)', ext: 'geojson', mime: 'application/geo+json', make: (f) => toGeoJSON(f) },
  gpx: { label: 'GPX (GPS tracks & waypoints)', ext: 'gpx', mime: 'application/gpx+xml', make: (f) => toGPX(f) },
  osm: { label: 'OSM XML (JOSM, not-uploaded only)', ext: 'osm', mime: 'application/xml', make: (f) => toOsmFile(f) },
  backup: { label: 'Backup (restore in this app)', ext: 'json', mime: 'application/json', make: (f, s) => toBackup(f, s) },
};

export function safeName(s) {
  return (s || 'survey').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'survey';
}

export async function buildFiles(features, formats, settings, baseName) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const base = `${baseName}_${stamp}`;
  const out = [];
  for (const k of formats) {
    out.push({
      name: `${base}${k === 'backup' ? '_backup' : ''}.${FORMATS[k].ext}`,
      mime: FORMATS[k].mime,
      data: await FORMATS[k].make(features, settings, base),
    });
  }
  return out;
}

// Uint8Array → base64 (in chunks, large ZIP files)
function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const writeOpts = (file) => (typeof file.data === 'string' ? { data: file.data, encoding: Encoding.UTF8 } : { data: toBase64(file.data) });

// ---------- delivery ----------
async function writeCache(file) {
  const r = await Filesystem.writeFile({
    path: `export/${file.name}`,
    ...writeOpts(file),
    directory: Directory.Cache,
    recursive: true,
  });
  return r.uri;
}

function browserDownload(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([file.data], { type: file.mime }));
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export async function sendEmail(files, to, subject, body) {
  if (!native) {
    files.forEach(browserDownload);
    location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return;
  }
  const uris = await Promise.all(files.map(writeCache));
  await EmailComposer.open({
    to: to ? [to] : [],
    subject,
    body,
    attachments: uris.map((u) => ({ type: 'absolute', path: decodeURIComponent(u.replace(/^file:\/\//, '')) })),
  });
}

export async function shareFiles(files, title) {
  if (!native) return files.forEach(browserDownload);
  const uris = await Promise.all(files.map(writeCache));
  await Share.share({ title, files: uris, dialogTitle: title });
}

export async function saveToDocuments(files) {
  if (!native) {
    files.forEach(browserDownload);
    return 'Downloads';
  }
  for (const f of files) {
    await Filesystem.writeFile({
      path: `OSMFieldCollector/${f.name}`,
      ...writeOpts(f),
      directory: Directory.Documents,
      recursive: true,
    });
  }
  return 'Documents/OSMFieldCollector';
}
