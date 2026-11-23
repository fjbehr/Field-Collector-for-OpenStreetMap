// SPDX-License-Identifier: GPL-3.0-or-later
// Central configuration.
//
// OAuth2 client IDs: register the app once per OSM server (see README.md,
// "Register the app with OpenStreetMap"). The client ID is public, so it can
// be compiled into the app; students then only need their own OSM account.
// The values can also be overridden at runtime in Settings.

export const APP_NAME = 'Field Collector for OpenStreetMap';
export const APP_SHORT_NAME = 'Field Collector'; // home-screen label
export const APP_VERSION = '0.2.1';
export const COPYRIGHT = 'Copyright (C) 2026 Franz-Josef Behr and contributors';
export const LICENSE_NAME = 'GNU General Public License, version 3 or later (GPL-3.0-or-later)';
// Public repository with the source code (GPL: whoever receives the APK must be
// able to get the source). Leave empty until the repository is published.
export const SOURCE_URL = '';

// Custom URL scheme that Android routes back to the app after OSM login.
// Must match the intent filter in android/app/src/main/AndroidManifest.xml
// and the redirect URI registered at openstreetmap.org.
export const OAUTH_REDIRECT_URI = 'osmfieldcollector://oauth';
export const OAUTH_SCOPES = 'read_prefs write_api';
// Only requested when "upload GPS traces" is switched on in Settings. The OSM
// app registration must allow it ("Upload GPS traces" / write_gpx).
export const OAUTH_SCOPES_GPX = 'read_prefs write_api write_gpx';

export const OSM_SERVERS = {
  production: {
    label: 'OpenStreetMap (live)',
    web: 'https://www.openstreetmap.org',
    api: 'https://api.openstreetmap.org',
    clientId: 'pp1Q4fCfa-rCqDRX80-27ZvM0awTCK6OjFFS8-G7hyQ', // public client ID (www.openstreetmap.org/oauth2/applications)
  },
  dev: {
    label: 'OSM test server (master.apis.dev)',
    web: 'https://master.apis.dev.openstreetmap.org',
    api: 'https://master.apis.dev.openstreetmap.org',
    clientId: 'AWHkt4ww2W5hdoSy7p-fpQ8pqWBqpbzoaD4iiIgngkE', // public client ID (master.apis.dev.openstreetmap.org)
  },
};

// Base maps. OSM tiles may be cached passively (tiles you have looked at),
// but bulk pre-downloading of tile.openstreetmap.org is not allowed by the
// OSM tile usage policy. Use an offline .pmtiles file for areas without
// network (see README.md, "Offline base map").
export const BASEMAPS = {
  osm: {
    label: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxNativeZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  esri: {
    label: 'Esri World Imagery (aerial)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 19,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  },
};

export const DEFAULT_SETTINGS = {
  project: 'My survey',
  email: '',
  server: 'production',
  clientIdProduction: '',
  clientIdDev: '',
  basemap: 'osm',
  customTileUrl: '',
  changesetComment: '',
  changesetHashtags: '',
  // GPS
  averageSeconds: 5,
  maxAccuracy: 20, // metres; fixes worse than this are ignored while recording
  minDistance: 3, // metres between automatically recorded way points
  simplifyTolerance: 1.5, // metres (Douglas-Peucker) applied to GPS-recorded ways
  tileCacheMax: 20000, // max number of cached tiles
  snapDistance: 5, // metres; new way points this close to an existing way/point are connected to it
  // Appearance
  theme: 'auto', // auto (follow phone) | light | dark
  // Photos
  photoMaxSize: 1600, // longest side in pixels (JPEG)
  // Upload the raw GPS tracks of walked ways to "My GPS traces" (needs write_gpx)
  uploadTraces: false,
  traceVisibility: 'identifiable', // private | trackable | public | identifiable
};

// Survey template of the current project (from a teacher's QR code / file):
// { v, project, hashtags, comment, fields: [{ key, label, type, options, required }], favourites: [...] }
export const TEMPLATE_VERSION = 1;

// Start view when no GPS fix is available yet: Tamale, Northern Region, Ghana.
export const START_VIEW = { lat: 9.4034, lon: -0.8424, zoom: 13 };
