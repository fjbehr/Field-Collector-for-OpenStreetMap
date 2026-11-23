// SPDX-License-Identifier: GPL-3.0-or-later
// Geometry helpers (no dependencies).

const R = 6371008.8; // mean earth radius in metres
const rad = (d) => (d * Math.PI) / 180;

export function distance(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function lineLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += distance(pts[i - 1], pts[i]);
  return d;
}

// Area of a closed ring in m² (spherical excess approximation, good enough
// for village-sized polygons).
export function ringArea(pts) {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    s += rad(p2.lon - p1.lon) * (2 + Math.sin(rad(p1.lat)) + Math.sin(rad(p2.lat)));
  }
  return Math.abs((s * R * R) / 2);
}

// Weighted mean of several GPS fixes (weight = 1/accuracy²). Returns the
// averaged position and an estimate of the resulting accuracy.
export function averageFixes(fixes) {
  if (!fixes.length) return null;
  let wSum = 0, lat = 0, lon = 0, alt = 0, altW = 0;
  for (const f of fixes) {
    const w = 1 / Math.max(f.accuracy || 10, 1) ** 2;
    wSum += w;
    lat += f.lat * w;
    lon += f.lon * w;
    if (f.altitude != null) { alt += f.altitude * w; altW += w; }
  }
  lat /= wSum;
  lon /= wSum;
  // Combined accuracy: 1/sqrt(sum of weights), but never better than the
  // spread of the fixes themselves (multipath errors are correlated).
  const formal = 1 / Math.sqrt(wSum);
  const spread = Math.sqrt(
    fixes.reduce((s, f) => s + distance({ lat, lon }, f) ** 2, 0) / fixes.length
  );
  return {
    lat,
    lon,
    altitude: altW ? alt / altW : null,
    accuracy: Math.max(formal, spread, 1),
    samples: fixes.length,
  };
}

// Douglas-Peucker simplification with a tolerance in metres. Works on a local
// equirectangular projection, which is accurate for short distances.
export function simplify(pts, tolerance) {
  if (pts.length <= 2 || !tolerance) return pts.slice();
  const lat0 = rad(pts[0].lat);
  const xy = pts.map((p) => [rad(p.lon) * Math.cos(lat0) * R, rad(p.lat) * R]);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(xy[i], xy[a], xy[b]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolerance && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function fmtDistance(m) {
  return m < 1000 ? `${m.toFixed(0)} m` : `${(m / 1000).toFixed(2)} km`;
}
export function fmtArea(m2) {
  return m2 < 10000 ? `${m2.toFixed(0)} m²` : `${(m2 / 10000).toFixed(2)} ha`;
}
