// OpenStreetMap login (OAuth 2.0 with PKCE) and API 0.6 upload.
//
// Flow: the system browser opens the OSM login page; after the user grants
// access, OSM redirects to osmfieldcollector://oauth?code=…, Android hands
// that URL back to the app (App 'appUrlOpen' event) and the code is exchanged
// for an access token. No client secret is needed (public client).

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { APP_NAME, APP_VERSION, OAUTH_REDIRECT_URI, OAUTH_SCOPES, OSM_SERVERS } from './config.js';
import * as db from './db.js';

const native = Capacitor.isNativePlatform();

export function serverConfig(settings) {
  const key = settings.server in OSM_SERVERS ? settings.server : 'production';
  const s = { ...OSM_SERVERS[key], key };
  const override = key === 'dev' ? settings.clientIdDev : settings.clientIdProduction;
  if (override) s.clientId = override.trim();
  return s;
}

// ---------- OAuth 2.0 + PKCE ----------
function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomString(n = 48) {
  return b64url(crypto.getRandomValues(new Uint8Array(n)));
}

export async function login(settings) {
  const srv = serverConfig(settings);
  if (!srv.clientId) {
    throw new Error('No OAuth client ID configured for this server. Enter it in Settings (see README).');
  }
  if (!native) {
    throw new Error('Login works in the Android app only (it needs the osmfieldcollector:// redirect).');
  }
  const verifier = randomString(48);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = randomString(16);
  await db.kvSet('oauthPending', { verifier, state, server: srv.key, clientId: srv.clientId });
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: srv.clientId,
    redirect_uri: OAUTH_REDIRECT_URI,
    scope: OAUTH_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  await Browser.open({ url: `${srv.web}/oauth2/authorize?${params}` });
}

// Called with the redirect URL. Returns the stored auth object.
export async function handleRedirect(url) {
  const u = new URL(url);
  const pending = await db.kvGet('oauthPending');
  try { await Browser.close(); } catch { /* already closed */ }
  if (!pending) throw new Error('Unexpected login response');
  const err = u.searchParams.get('error');
  if (err) throw new Error(`Login refused: ${u.searchParams.get('error_description') || err}`);
  if (u.searchParams.get('state') !== pending.state) throw new Error('Login state mismatch, please try again');
  const srv = OSM_SERVERS[pending.server];
  const res = await fetch(`${srv.web}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: u.searchParams.get('code'),
      redirect_uri: OAUTH_REDIRECT_URI,
      client_id: pending.clientId,
      code_verifier: pending.verifier,
    }),
  });
  if (!res.ok) throw new Error(`Token request failed (HTTP ${res.status}): ${await res.text()}`);
  const tok = await res.json();
  const auth = { server: pending.server, token: tok.access_token, user: null };
  await db.kvDel('oauthPending');
  auth.user = await fetchUser(srv.api, auth.token);
  await db.kvSet(`auth:${pending.server}`, auth);
  return auth;
}

async function fetchUser(api, token) {
  const res = await fetch(`${api}/api/0.6/user/details.json`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Could not read user details (HTTP ${res.status})`);
  const j = await res.json();
  return { id: j.user.id, name: j.user.display_name, changesets: j.user.changesets?.count };
}

export const getAuth = (serverKey) => db.kvGet(`auth:${serverKey}`);
export const logout = (serverKey) => db.kvDel(`auth:${serverKey}`);

// ---------- XML helpers ----------
export function xmlEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#10;');
}
function tagXml(tags, indent = '    ') {
  return Object.entries(tags)
    .filter(([k, v]) => k.trim() && String(v).trim() !== '')
    .map(([k, v]) => `${indent}<tag k="${xmlEsc(k.trim())}" v="${xmlEsc(String(v).trim().slice(0, 255))}"/>`)
    .join('\n');
}
export function cleanTags(tags) {
  const out = {};
  for (const [k, v] of Object.entries(tags || {})) {
    if (k.trim() && String(v).trim() !== '') out[k.trim()] = String(v).trim();
  }
  return out;
}

// Build the list of OSM elements (with negative placeholder ids) for a set of
// collected features.
export function buildElements(features) {
  let nextId = -1;
  const nodes = []; // {id, lat, lon, tags, feature}
  const ways = []; // {id, refs, tags, feature}
  for (const f of features) {
    if (f.type === 'node') {
      nodes.push({ id: nextId--, lat: f.lat, lon: f.lon, tags: cleanTags(f.tags), feature: f });
    } else {
      const refs = f.nodes.map((p) => {
        const id = nextId--;
        nodes.push({ id, lat: p.lat, lon: p.lon, tags: {}, feature: null });
        return id;
      });
      if (f.closed && refs.length > 2) refs.push(refs[0]);
      ways.push({ id: nextId--, refs, tags: cleanTags(f.tags), feature: f });
    }
  }
  return { nodes, ways };
}

const c7 = (x) => Number(x).toFixed(7);

export function osmChangeXml({ nodes, ways }, changesetId) {
  const out = [`<osmChange version="0.6" generator="${APP_NAME} ${APP_VERSION}">`, '  <create>'];
  for (const n of nodes) {
    const t = tagXml(n.tags);
    out.push(`    <node id="${n.id}" changeset="${changesetId}" lat="${c7(n.lat)}" lon="${c7(n.lon)}"${t ? '>' : '/>'}`);
    if (t) out.push(t.replace(/^ {4}/gm, '      '), '    </node>');
  }
  for (const w of ways) {
    out.push(`    <way id="${w.id}" changeset="${changesetId}">`);
    for (const r of w.refs) out.push(`      <nd ref="${r}"/>`);
    const t = tagXml(w.tags, '      ');
    if (t) out.push(t);
    out.push('    </way>');
  }
  out.push('  </create>', '</osmChange>');
  return out.join('\n');
}

// Plain .osm file (JOSM-compatible) for not-yet-uploaded features.
export function osmFileXml(elements) {
  const out = [`<?xml version="1.0" encoding="UTF-8"?>`, `<osm version="0.6" generator="${APP_NAME} ${APP_VERSION}" upload="true">`];
  for (const n of elements.nodes) {
    const t = tagXml(n.tags);
    out.push(`  <node id="${n.id}" action="modify" visible="true" lat="${c7(n.lat)}" lon="${c7(n.lon)}"${t ? '>' : '/>'}`);
    if (t) out.push(t, '  </node>');
  }
  for (const w of elements.ways) {
    out.push(`  <way id="${w.id}" action="modify" visible="true">`);
    for (const r of w.refs) out.push(`    <nd ref="${r}"/>`);
    const t = tagXml(w.tags);
    if (t) out.push(t);
    out.push('  </way>');
  }
  out.push('</osm>');
  return out.join('\n');
}

// ---------- validation ----------
export function validate(features) {
  const problems = [];
  for (const f of features) {
    const tags = cleanTags(f.tags);
    const label = `#${f.id}`;
    if (!Object.keys(tags).length) problems.push(`${label}: has no tags`);
    if (f.type === 'way') {
      if (f.nodes.length < 2) problems.push(`${label}: a way needs at least 2 points`);
      if (f.closed && f.nodes.length < 3) problems.push(`${label}: an area needs at least 3 points`);
    }
    for (const k of Object.keys(tags)) {
      if (k.length > 255) problems.push(`${label}: key too long`);
    }
  }
  return problems;
}

// ---------- upload ----------
async function api(srv, token, method, path, body) {
  const res = await fetch(`${srv.api}/api/0.6/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/xml; charset=utf-8' },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`OSM API ${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return text;
}

// Uploads features in one changeset. Returns { changesetId, idMap } where
// idMap maps feature.id → new OSM id.
export async function upload(features, settings, { comment, onStep = () => {} }) {
  const srv = serverConfig(settings);
  const auth = await getAuth(srv.key);
  if (!auth) throw new Error('Please log in to OpenStreetMap first.');
  const elements = buildElements(features);
  const hashtags = (settings.changesetHashtags || '')
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : `#${h}`));
  const fullComment = [comment.trim(), ...hashtags.filter((h) => !comment.includes(h))].join(' ').trim();
  const csTags = {
    created_by: `${APP_NAME} ${APP_VERSION}`,
    comment: fullComment,
    source: 'survey',
    'survey:date': new Date().toISOString().slice(0, 10),
  };
  if (hashtags.length) csTags.hashtags = hashtags.join(';');

  onStep('Opening changeset…');
  const csXml = `<osm><changeset>\n${tagXml(csTags)}\n</changeset></osm>`;
  const changesetId = (await api(srv, auth.token, 'PUT', 'changeset/create', csXml)).trim();

  let diff;
  try {
    onStep(`Uploading ${elements.nodes.length} nodes and ${elements.ways.length} ways…`);
    diff = await api(srv, auth.token, 'POST', `changeset/${changesetId}/upload`, osmChangeXml(elements, changesetId));
  } finally {
    onStep('Closing changeset…');
    try { await api(srv, auth.token, 'PUT', `changeset/${changesetId}/close`); } catch (e) { console.warn(e); }
  }

  const doc = new DOMParser().parseFromString(diff, 'application/xml');
  const newIds = new Map();
  for (const el of doc.querySelectorAll('node, way')) {
    newIds.set(Number(el.getAttribute('old_id')), Number(el.getAttribute('new_id')));
  }
  const idMap = new Map();
  for (const n of elements.nodes) if (n.feature) idMap.set(n.feature.id, newIds.get(n.id));
  for (const w of elements.ways) idMap.set(w.feature.id, newIds.get(w.id));
  return { changesetId, idMap, url: `${srv.web}/changeset/${changesetId}` };
}

// ---------- existing OSM data (read only, to avoid duplicates) ----------
export async function fetchExisting(settings, bounds) {
  const srv = serverConfig(settings);
  const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].map((x) => x.toFixed(6)).join(',');
  const res = await fetch(`${srv.api}/api/0.6/map?bbox=${bbox}`);
  if (res.status === 400) throw new Error('Area too large or too many objects – zoom in further.');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'application/xml');
  const tagsOf = (el) => {
    const t = {};
    for (const tg of el.querySelectorAll(':scope > tag')) t[tg.getAttribute('k')] = tg.getAttribute('v');
    return t;
  };
  const coords = new Map();
  const points = [];
  for (const n of doc.querySelectorAll('osm > node')) {
    const c = [Number(n.getAttribute('lat')), Number(n.getAttribute('lon'))];
    coords.set(n.getAttribute('id'), c);
    const t = tagsOf(n);
    if (Object.keys(t).length) points.push({ id: n.getAttribute('id'), c, tags: t });
  }
  const ways = [];
  for (const w of doc.querySelectorAll('osm > way')) {
    const c = [...w.querySelectorAll(':scope > nd')].map((nd) => coords.get(nd.getAttribute('ref'))).filter(Boolean);
    ways.push({ id: w.getAttribute('id'), c, tags: tagsOf(w) });
  }
  const data = { server: srv.key, bbox, fetched: Date.now(), points, ways };
  await db.kvSet('existingOsm', data);
  return data;
}
