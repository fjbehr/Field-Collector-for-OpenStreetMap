# OSM Field Collector

An offline-first Android app for collecting OpenStreetMap **nodes and ways with the phone's GPS**, tagging them with presets based on
[Map Features](https://wiki.openstreetmap.org/wiki/Map_features), and later

* **uploading** them to OpenStreetMap (OAuth 2.0 login), and/or
* **exporting / e-mailing** them as GeoJSON (QGIS), GPX, `.osm` (JOSM) or a backup file.

Built for field work in places with little or no mobile network (e.g. student projects of the University for Development Studies in
rural communities of Northern Ghana): everything is stored on the phone, network is only needed for login/upload and e-mail.

Technology: HTML/CSS/**JavaScript** (no framework) + [Capacitor 8](https://capacitorjs.com) as the Android shell, [Leaflet](https://leafletjs.com) for the map.

---

## Features

| | |
|---|---|
| **Points** | GPS position averaged over N seconds (weighted by accuracy), or at the map crosshair |
| **Ways** | *Walk it* (automatic GPS track, keeps recording with the screen off), *corner by corner* (averaged GPS position per vertex), or *draw on the map*. Finish as line or area. Walked tracks are simplified (Douglas-Peucker); the raw track is kept for GPX export. Interrupted recordings are restored after an app restart. |
| **Tagging** | ~190 presets in 18 categories (incl. boreholes, CHPS compounds, markets, shea trees, farmland, footpaths…), form fields per preset, raw tag table / text view with key & value suggestions (offline lists + taginfo when online), `?` opens the OSM wiki |
| **Private survey fields** | Research attributes (e.g. `households=12`) and notes that are **exported to QGIS but never uploaded** to OSM |
| **Projects** | Each feature belongs to a project (e.g. one community survey); export/upload per project or all |
| **Offline maps** | Tiles you looked at are cached; import an offline raster base map (`.pmtiles`, e.g. drone/aerial imagery from QGIS); load existing OSM data of an area to avoid duplicates (kept offline) |
| **Upload** | OAuth 2.0 (PKCE) login, one changeset per upload with `source=survey`, comment and hashtags; validation before upload; live server or the OSM **test server** |
| **Export** | GeoJSON, GPX, OSM XML, backup JSON → e-mail (pre-filled with your address), Android share sheet (WhatsApp, Drive, Bluetooth…) or *Documents/OSMFieldCollector* |

---

## 1. One-time setup: register the app with OpenStreetMap

Uploading needs an OAuth 2.0 *client ID*. You register the app **once**; students then just log in with their own OSM accounts.

1. Log in at <https://www.openstreetmap.org> → *My Account* → *OAuth 2 applications* → *Register new application*
   (direct link: <https://www.openstreetmap.org/oauth2/applications/new>).
2. Name: `OSM Field Collector` (or your own name)
   Redirect URI: `osmfieldcollector://oauth`
   **Uncheck** *Confidential application* (a mobile app cannot keep a secret).
   Permissions: **Read user preferences** and **Modify the map**.
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
1. Create a project (tap the project name at the top).
2. Look at the survey area on the map at zoom levels 14–19 so the tiles are cached, *or* import an offline base map (see 4).
3. *Menu → Load existing OSM data here* (zoomed in on the community) to see what is already mapped.
4. Log in to OSM once (*Upload → Log in*); the login is remembered.

**In the field (no network needed):**
* **Point**: stand at the feature → *Point → At my GPS position* → wait for the averaging → choose the type (e.g. *Borehole (hand pump)*) → fill in the fields → *Save*.
* **Way**: *Way →* choose a mode → walk / add corners → *Finish line* or *Finish area* → choose the type.
* Use *Private survey fields* for data that is for your research only (e.g. number of users per day, water quality, interview codes). It is exported to QGIS but never uploaded.
* Do **not** put personal data (names of private persons, phone numbers of individuals) into OSM tags.

**Back with network:**
* *Upload* → write a meaningful changeset comment → *Upload*. Features turn green.
* *More → Export & send* → GeoJSON + GPX → *E-mail* (to yourself) or *Share*. Make a **Backup** regularly – uninstalling the app deletes its data.
* New ways are **not connected** to existing roads/paths. Afterwards open the area in iD (openstreetmap.org → *Edit*) or JOSM and connect them.

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

*Layer → Add Layer → Add Vector Layer* → select the `.geojson`. QGIS asks which geometry types to load (points, lines, polygons).
All OSM tags and private fields are attributes. Columns starting with `_` are metadata:

| column | meaning |
|---|---|
| `_id` | feature number in the app |
| `_project` | project name |
| `_created` | date/time collected (UTC) |
| `_accuracy_m` | estimated GPS accuracy in metres |
| `_samples` | number of GPS fixes averaged |
| `_status` | `new` or `uploaded` |
| `_osm_id` | OSM id after upload (`n123…` node, `w123…` way) |

The GPX file contains points as waypoints and the **raw** GPS tracks of walked ways.

## Project structure

```
index.html            app shell
src/main.js           map, recording, list, upload, export & settings screens
src/editor.js         tag editor & preset picker
src/presets.js        presets & fields (Map Features subset) – extend here
src/gps.js            GPS (background-geolocation plugin / browser / simulation)
src/osm.js            OAuth 2.0 PKCE, osmChange upload, existing data download
src/export.js         GeoJSON / GPX / OSM / backup, e-mail & share
src/tiles.js          cached tile layer, offline .pmtiles layer
src/db.js             IndexedDB storage
src/config.js         client IDs, servers, base maps, defaults
android/              Capacitor Android project (manifest: permissions, OAuth redirect)
```

## Known limitations / ideas

* Only **new** objects are created; editing or deleting existing OSM objects is not supported (use iD/JOSM/Vespucci).
* New ways are not joined to existing ways or to each other.
* Photos are not supported yet (could be stored locally and exported; OSM itself does not store photos – Panoramax would be an option).
* UI is English only; translations (e.g. German, Dagbani) could be added.
* GPS accuracy of phones is typically 3–10 m; averaging helps for points. For precise surveys use an external GNSS receiver (Android *mock location*).
