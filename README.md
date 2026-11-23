# Field Collector for OpenStreetMap

An offline-first Android app for collecting OpenStreetMap **nodes and ways with the phone's GPS**, tagging them with presets based on
[Map Features](https://wiki.openstreetmap.org/wiki/Map_features), and later

* **uploading** them to OpenStreetMap (OAuth 2.0 login), and/or
* **exporting / e-mailing** them as GeoJSON (QGIS), GPX, `.osm` (JOSM) or a backup file.

Built for field work in places with little or no mobile network (e.g. student projects of the University for Development Studies in
rural communities of Northern Ghana): everything is stored on the phone, network is only needed for login/upload and e-mail.

Source code: https://github.com/fjbehr/Field-Collector-for-OpenStreetMap (GPL-3.0-or-later)

Technology: HTML/CSS/**JavaScript** (no framework) + [Capacitor 8](https://capacitorjs.com) as the Android shell, [Leaflet](https://leafletjs.com) for the map.

---

## Features

| | |
|---|---|
| **Points** | GPS position averaged over N seconds (weighted by accuracy), or at the map crosshair |
| **Ways** | *Walk it* (automatic GPS track, keeps recording with the screen off), *corner by corner* (averaged GPS position per vertex), or *draw on the map*. Finish as line or area. Walked tracks are simplified (Douglas-Peucker); the raw track is kept for GPX export. Interrupted recordings are restored after an app restart. |
| **Tagging** | ~190 presets in 18 categories (incl. boreholes, CHPS compounds, markets, shea trees, farmland, footpaths…), form fields per preset, raw tag table / text view with key & value suggestions (offline lists + taginfo when online), `?` opens the OSM wiki |
| **Favourites** | Save the attributes of a feature as a favourite (e.g. "Borehole – Afridev, working") and apply them with one tap; recently used tag sets are offered too |
| **Photos** | Take photos (or pick from the gallery) per feature; scaled down and stored on the phone, exported in the ZIP for QGIS – never uploaded to OSM |
| **Private survey fields** | Research attributes (e.g. `households=12`) and notes that are **exported to QGIS but never uploaded** to OSM |
| **Project templates** | A teacher defines the survey form (questions with type, choices, required), hashtags and favourites once and shares it as a **QR code** or file; students scan it |
| **Projects** | Each feature belongs to a project (e.g. one community survey); export/upload per project or all |
| **Offline maps** | Tiles you looked at are cached; import an offline raster base map (`.pmtiles`, e.g. drone/aerial imagery from QGIS); load existing OSM data of an area (kept offline) |
| **Connect & correct** | New ways are **connected** to loaded OSM ways (existing node reused, or a junction node inserted into the existing way) and to each other; **existing OSM objects** can be tapped to correct their tags |
| **Upload** | OAuth 2.0 (PKCE) login, one changeset per upload with `source=survey`, comment and hashtags; validation before upload; live server or the OSM **test server**; optionally the raw GPS tracks to *My GPS traces* |
| **Export** | ZIP for QGIS (GeoJSON + GPX + photos), GeoJSON, GPX, OSM XML, backup JSON → e-mail (pre-filled with your address), Android share sheet (WhatsApp, Drive, Bluetooth…) or *Documents/OSMFieldCollector* |
| **Find a place** | Search button (top bar): online via [Nominatim](https://nominatim.org) (OSM data, policy-compliant: search on request only, max. 1/s, cached); offline in your own data, the loaded OSM data and recently found places; coordinates such as `9.4034, -0.8424` work offline |
| **Look & feel** | Light and dark theme (follows the phone or fixed in Settings), large touch targets, short tutorial on first start (Help → Show the tutorial) |

---

## 1. One-time setup: register the app with OpenStreetMap

Uploading needs an OAuth 2.0 *client ID*. You register the app **once**; students then just log in with their own OSM accounts.

1. Log in at <https://www.openstreetmap.org> → *My Account* → *OAuth 2 applications* → *Register new application*
   (direct link: <https://www.openstreetmap.org/oauth2/applications/new>).
2. Name: `Field Collector for OpenStreetMap` (or your own name)
   Redirect URI: `osmfieldcollector://oauth`
   **Uncheck** *Confidential application* (a mobile app cannot keep a secret).
   Permissions: **Read user preferences** and **Modify the map**.
   Optional: **Upload GPS traces** (`write_gpx`) – only needed if students should also upload their raw GPS tracks
   (Settings → "also upload the GPS tracks…"). The app only asks for this permission when that setting is on;
   an existing registration can be edited later to add it.
3. Copy the **Client ID** into `src/config.js` → `OSM_SERVERS.production.clientId` and rebuild.
   (Alternatively, enter it on the phone under *Settings → OpenStreetMap → OAuth client IDs*.)
4. For testing, do the same on the test server <https://master.apis.dev.openstreetmap.org> (separate account and
   registration) and put that ID into `OSM_SERVERS.dev.clientId`. Select *Settings → Server → OSM test server* in the app.
   **Do all first tests on the test server.**

## 2. Build

Requirements: Node.js ≥ 20, JDK 21, Android SDK (platform 36, build-tools 35/36). Android Studio installs the SDK for you.

```powershell
npm install
npm run build            # builds the web app into dist/
npx cap sync android     # copies it into the Android project
cd android; .\gradlew.bat assembleDebug
```

The APK is `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to the phone (USB, Google Drive, WhatsApp…) and
install it (allow *install unknown apps*). Or open the `android` folder in Android Studio and press *Run*.

For distribution to many students build a signed release APK (Android Studio → *Build → Generate Signed App Bundle/APK*)
and keep the keystore safe – updates must be signed with the same key.

### Development in the browser

```powershell
npm run dev
```

Open <http://localhost:5173/?sim> – `?sim` simulates a GPS walk in Tamale, so the app can be tested on a PC.
(Login only works in the Android app because it needs the `osmfieldcollector://` redirect.)

## 3. Field workflow (for students)

**Before going to the field (with network):**
1. Create a project (tap the project name at the top) – or scan the teacher's QR code: *More → Project template → Scan QR code*.
2. Look at the survey area on the map at zoom levels 14–19 so the tiles are cached, *or* import an offline base map (see 4).
3. *More → Load existing OSM data here* (zoomed in on the community): shows what is already mapped, lets new ways connect to it and lets you correct existing objects.
4. Log in to OSM once (*Upload → Log in*); the login is remembered.

**Teachers: share a survey form.** *More → Project template*: add the questions (e.g. "Households using it" – number –
required; "Water quality" – select – clear, turbid, smelly), tick favourites, set hashtags, then *Show QR code*
(students scan it) or *Share file* (WhatsApp/e-mail; students use *Import file*). The answers are private survey fields:
they appear as columns in QGIS and are never uploaded to OSM.

**In the field (no network needed):**
* **Point**: stand at the feature → *Point → At my GPS position* → wait for the averaging → choose the type (e.g. *Borehole (hand pump)*) → fill in the fields → *Save*.
* **Way**: *Way →* choose a mode → walk / add corners → *Finish line* or *Finish area* → choose the type.
* Use *Private survey fields* (or the template's survey form) for data that is for your research only (e.g. number of users per day, water quality, interview codes). It is exported to QGIS but never uploaded.
* Add **photos** in the editor; save frequent attribute combinations with **☆ Save as favourite**.
* Tap a grey (existing) OSM object to correct its tags – the change is uploaded with your next upload (violet = edited).
* Do **not** put personal data (names of private persons, phone numbers of individuals) into OSM tags.

**Back with network:**
* *Upload* → write a meaningful changeset comment → *Upload*. Features turn green.
* *More → Export & send* → **ZIP for QGIS** (GeoJSON + GPX + photos) → *E-mail* (to yourself) or *Share*. Make a **Backup** regularly – uninstalling the app deletes its data (the backup does not contain photos; keep the ZIP).
* New ways connect to existing ways within the snap distance (Settings → GPS, default 5 m) if the existing OSM data was loaded. Check junctions afterwards on openstreetmap.org.

## 4. Offline base map from QGIS (aerial imagery without network)

1. In QGIS load the imagery (e.g. drone orthophoto, or an XYZ layer such as Esri World Imagery) and zoom to the community.
2. *Processing Toolbox → Raster tools → Generate XYZ tiles (MBTiles)*: extent = community, zoom 12–19, format JPG, quality 75.
3. Convert the MBTiles to PMTiles with the [`pmtiles` command line tool](https://github.com/protomaps/go-pmtiles/releases):
   `pmtiles convert community.mbtiles community.pmtiles`
4. Copy the `.pmtiles` file to the phone, then *Settings → Offline base map → Import .pmtiles…*.

Only raster `.pmtiles` (PNG/JPEG/WebP) are supported. Respect the imagery licence; for tracing into OSM only sources permitted for OSM
may be used (see <https://wiki.openstreetmap.org/wiki/Esri>, <https://osmlab.github.io/editor-layer-index/>).
Note: bulk pre-downloading of `tile.openstreetmap.org` tiles is not allowed by the
[tile usage policy](https://operations.osmfoundation.org/policies/tiles/) – that's why the app only caches tiles you actually viewed.

## 5. Using the data in QGIS

Unpack the ZIP, then *Layer → Add Layer → Add Vector Layer* → select the `.geojson`. QGIS asks which geometry types to load (points, lines, polygons).
To show photos: *Layer Properties → Attributes Form* → field `_photo` → widget **Attachment**, path relative to the unpacked folder, display as image.
All OSM tags and private fields are attributes. Columns starting with `_` are metadata:

| column | meaning |
|---|---|
| `_id` | feature number in the app |
| `_project` | project name |
| `_created` | date/time collected (UTC) |
| `_accuracy_m` | estimated GPS accuracy in metres |
| `_samples` | number of GPS fixes averaged |
| `_status` | `new`, `uploaded`, `edited` or `edit_uploaded` (corrected existing OSM object) |
| `_osm_id` | OSM id after upload (`n123…` node, `w123…` way) |
| `_photo`, `_photos` | path of the first photo / all photos (`photos/<id>_<n>.jpg`, separated by `;`) |

The GPX file contains points as waypoints and the **raw** GPS tracks of walked ways.

## Project structure

```
index.html            app shell
src/main.js           map, recording, list, upload, export & settings screens
src/editor.js         tag editor & preset picker (favourites, photos, survey form)
src/favourites.js     favourites & recently used tag sets
src/photos.js         photo capture, scaling, storage, viewer
src/snap.js           connecting new ways to existing ways
src/search.js         place search (Nominatim, offline, coordinates)
src/template.js       project templates: QR code (create/scan), file import
src/tutorial.js       first-start tutorial
src/theme.js          light / dark theme
src/presets.js        presets & fields (Map Features subset) – extend here
src/gps.js            GPS (background-geolocation plugin / browser / simulation)
src/osm.js            OAuth 2.0 PKCE, osmChange upload, existing data download
src/export.js         GeoJSON / GPX / OSM / backup, e-mail & share
src/tiles.js          cached tile layer, offline .pmtiles layer
src/icons.js          SVG icons (Lucide, bundled for offline use) & category icons
src/ui.js             sheets, dialogs, bottom-sheet menus, toasts
src/db.js             IndexedDB storage
src/config.js         client IDs, servers, base maps, defaults, copyright, source URL
src/about.js          About screen: licence notice, disclaimer, privacy, attributions
scripts/make-notices.mjs  collects the licences of bundled libraries into public/licenses/ (runs with `npm run build`)
LICENSE               GNU GPL version 3
resources/icon.svg    app icon source – run `node scripts/make-icons.mjs` after changing it
android/              Capacitor Android project (manifest: permissions, OAuth redirect)
```

## Known limitations / ideas

* Existing OSM objects: only their **tags** can be corrected; moving, reshaping or deleting them is not supported (use iD/JOSM/Vespucci).
* Connecting needs the existing OSM data of the area loaded beforehand; an edit made by someone else in the meantime leads to an upload conflict (load the data again and repeat).
* Photos are not uploaded anywhere (OSM itself does not store photos – Panoramax would be an option).
* UI is English only; translations (e.g. Dagbani, Twi, French, German) are planned.
* Planned: optional larger text.
* GPS accuracy of phones is typically 3–10 m; averaging helps for points. For precise surveys use an external GNSS receiver (Android *mock location*).

## Licence & disclaimer

Copyright (C) 2026 Franz-Josef Behr and contributors

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License
as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but **WITHOUT ANY WARRANTY**; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
The full text is in [LICENSE](LICENSE) and in the app (*More → About*).

**Please note** (also shown in the app):

* Use at your own risk – the app is free and provided “as is”, without any guarantee that it works correctly.
* GPS positions can be several metres off; do not use the app for navigation or safety-related purposes.
* Data is stored only on the phone; uninstalling or losing the phone deletes it – export and back up regularly.
* Everything uploaded to OpenStreetMap is public and permanent and shows your OSM user name; never upload personal data.
* Private survey answers and photos are the responsibility of whoever collects them (consent, data protection –
  in Ghana the Data Protection Act, 2012, Act 843).

**Privacy:** no advertising, analytics or tracking. The app only contacts openstreetmap.org (login, upload, loading data),
the chosen tile servers (OpenStreetMap, Esri), Nominatim (place search) and taginfo (tag suggestions).

**Source code:** https://github.com/fjbehr/Field-Collector-for-OpenStreetMap – the GPL requires that whoever receives
the APK can also get the source code; the About screen links to this repository (`SOURCE_URL` in `src/config.js`).

**Third-party software:** Leaflet (BSD-2-Clause), Lucide (ISC), fflate (MIT), jsQR (Apache-2.0), qrcode-generator (MIT),
PMTiles (BSD-3-Clause), Capacitor and plugins (MIT), AndroidX and Cordova Android (Apache-2.0) – full texts in
`public/licenses/THIRD-PARTY-NOTICES.txt`. Map data © OpenStreetMap contributors (ODbL). “OpenStreetMap” is a trademark of
the OpenStreetMap Foundation; this project is not made or endorsed by the Foundation.
