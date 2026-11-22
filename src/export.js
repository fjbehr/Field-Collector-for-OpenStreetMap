// Export formats and delivery (email, share sheet, save to Documents).
//
//   GeoJSON – for QGIS (all OSM tags + private survey fields + metadata)
//   GPX     – waypoints and raw GPS tracks
//   .osm    – JOSM file of features not yet uploaded
//   Backup  – complete internal data, can be restored in Settings

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { EmailComposer } from 'capacitor-email-composer';
import { APP_NAME, APP_VERSION } from './config.js';
import { buildElements, cleanTags, osmFileXml, xmlEsc } from './osm.js';
import { featureLabel } from './presets.js';

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
          _status: f.status,
          _osm_id: f.osmId ? `${f.type === 'node' ? 'n' : 'w'}${f.osmId}` : null,
          _note: f.note || null,
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

export const FORMATS = {
  geojson: { label: 'GeoJSON (QGIS)', ext: 'geojson', mime: 'application/geo+json', make: (f) => toGeoJSON(f) },
  gpx: { label: 'GPX (GPS tracks & waypoints)', ext: 'gpx', mime: 'application/gpx+xml', make: (f) => toGPX(f) },
  osm: { label: 'OSM XML (JOSM, not-uploaded only)', ext: 'osm', mime: 'application/xml', make: (f) => toOsmFile(f) },
  backup: { label: 'Backup (restore in this app)', ext: 'json', mime: 'application/json', make: (f, s) => toBackup(f, s) },
};

export function safeName(s) {
  return (s || 'survey').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'survey';
}

export function buildFiles(features, formats, settings, baseName) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return formats.map((k) => ({
    name: `${baseName}_${stamp}${k === 'backup' ? '_backup' : ''}.${FORMATS[k].ext}`,
    mime: FORMATS[k].mime,
    data: FORMATS[k].make(features, settings),
  }));
}

// ---------- delivery ----------
async function writeCache(file) {
  const r = await Filesystem.writeFile({
    path: `export/${file.name}`,
    data: file.data,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
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
      data: f.data,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    });
  }
  return 'Documents/OSMFieldCollector';
}
