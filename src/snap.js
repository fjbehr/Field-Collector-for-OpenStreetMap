// Snapping: connect new way points to what is already there.
//
//   1. an existing OSM way vertex nearby  → the new way uses that OSM node
//   2. a vertex of another new (not yet uploaded) way → both ways share the node
//   3. the middle of an existing OSM way segment → a new node is created there
//      and inserted into the existing way (the existing way is modified)
//
// Existing OSM data must have been loaded (Menu → Load existing OSM data).

const R = 6371008.8;
const rad = Math.PI / 180;

// local metric projection around a reference point
function projector(ref) {
  const kx = Math.cos(ref.lat * rad) * R * rad;
  const ky = R * rad;
  return (lat, lon) => [(lon - ref.lon) * kx, (lat - ref.lat) * ky];
}

// Returns a snapped point { lat, lon, osmNode? , snapWay?, label } or null.
export function findSnap(pt, { existing, features = [], maxDist, excludeId = null }) {
  if (!maxDist || maxDist <= 0) return null;
  const P = projector(pt);
  const d2max = maxDist * maxDist;
  let best = null;
  const consider = (d2, cand) => {
    if (d2 <= d2max && (!best || d2 < best.d2)) best = { ...cand, d2 };
  };

  const ways = existing?.ways?.filter((w) => Array.isArray(w.n)) || [];
  // 1. existing vertices
  for (const w of ways) {
    w.c.forEach(([lat, lon], i) => {
      const [x, y] = P(lat, lon);
      consider(x * x + y * y, { lat, lon, osmNode: w.n[i], kind: 'vertex', way: w });
    });
  }
  // 2. vertices of other new ways on the phone
  for (const f of features) {
    if (f.type !== 'way' || f.kind === 'edit' || f.status === 'uploaded' || f.id === excludeId) continue;
    for (const p of f.nodes) {
      const [x, y] = P(p.lat, p.lon);
      // reuse the same reference (OSM node or junction) as the other way
      consider(x * x + y * y, { lat: p.lat, lon: p.lon, osmNode: p.osmNode, snapWay: p.snapWay, kind: 'local', feature: f });
    }
  }
  if (best) return finish(best);

  // 3. existing segments
  for (const w of ways) {
    for (let i = 0; i < w.c.length - 1; i++) {
      const [ax, ay] = P(w.c[i][0], w.c[i][1]);
      const [bx, by] = P(w.c[i + 1][0], w.c[i + 1][1]);
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (!len2) continue;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      if (t <= 0.001 || t >= 0.999) continue; // that is a vertex – handled above
      const x = ax + t * dx, y = ay + t * dy;
      const lat = w.c[i][0] + t * (w.c[i + 1][0] - w.c[i][0]);
      const lon = w.c[i][1] + t * (w.c[i + 1][1] - w.c[i][1]);
      consider(x * x + y * y, {
        lat, lon, kind: 'segment', way: w,
        snapWay: { id: w.id, v: w.v, n: w.n, tags: w.tags, index: i, t },
      });
    }
  }
  return best ? finish(best) : null;
}

function finish(b) {
  const out = { lat: b.lat, lon: b.lon, dist: Math.sqrt(b.d2), kind: b.kind };
  if (b.osmNode) out.osmNode = b.osmNode;
  if (b.snapWay) out.snapWay = b.snapWay;
  const tags = b.way?.tags || b.feature?.tags || {};
  out.label = tags.name || tags.highway || tags.building || tags.landuse || tags.waterway || Object.values(tags)[0] || 'way';
  return out;
}

// Metres per screen pixel at the map's current zoom (for drawing on the map).
export function metresPerPixel(map) {
  const c = map.getCenter();
  return (40075016.686 * Math.cos(c.lat * rad)) / 2 ** (map.getZoom() + 8);
}
