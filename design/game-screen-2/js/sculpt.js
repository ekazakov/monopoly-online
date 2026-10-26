// Avatar sculpting, ported from the Harborfront Avatars page: parts are signed distance functions merged
// with smooth unions, carved with smooth subtractions, then meshed once with surface nets.
import * as THREE from 'three';

const sides = [-1, 1];

const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const sEll = (cx, cy, cz, rx, ry, rz) => ({
  b: [cx - rx, cy - ry, cz - rz, cx + rx, cy + ry, cz + rz],
  f: (x, y, z) => {
    const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
    const k0 = Math.sqrt(px * px + py * py + pz * pz), qx = px / rx, qy = py / ry, qz = pz / rz;
    const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
    return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  }
});
// capsule from a to b whose radius goes r1 -> r2 (Inigo Quilez's round cone)
const sCone = ([ax, ay, az], [bx, by, bz], r1, r2) => {
  const bax = bx - ax, bay = by - ay, baz = bz - az, m = Math.max(r1, r2);
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2, srr = Math.sign(rr) * rr * rr;
  return {
    b: [Math.min(ax, bx) - m, Math.min(ay, by) - m, Math.min(az, bz) - m, Math.max(ax, bx) + m, Math.max(ay, by) + m, Math.max(az, bz) + m],
    f: (x, y, z) => {
      const px = x - ax, py = y - ay, pz = z - az;
      const yy = px * bax + py * bay + pz * baz, zz = yy - l2;
      const qx = px * l2 - bax * yy, qy = py * l2 - bay * yy, qz = pz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2, k = srr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    }
  };
};
const sGroup = (items) => {
  const parts = items.map(({ p, k = 0, sub = false }) => {
    const [x0, y0, z0, x1, y1, z1] = p.b;
    return { f: p.f, k, sub, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2, r: 0.5 * Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2) };
  });
  const adds = items.filter((it) => !it.sub).map((it) => it.p.b);
  const b = [0, 1, 2].map((i) => Math.min(...adds.map((a) => a[i]))).concat([3, 4, 5].map((i) => Math.max(...adds.map((a) => a[i]))));
  return {
    b,
    f: (x, y, z) => {
      let d = Infinity;
      for (const p of parts) {
        const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz, lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - p.r;
        if (p.sub) {
          if (lb >= p.k - d) continue;
          const e = p.f(x, y, z);
          d = p.k ? -smin(-d, e, p.k) : Math.max(d, -e);
        } else {
          if (lb >= d + p.k) continue;
          const e = p.f(x, y, z);
          d = p.k ? smin(d, e, p.k) : Math.min(d, e);
        }
      }
      return d;
    }
  };
};
const sTube = (pts, r0, r1, n = 28) => {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const ps = curve.getPoints(n).map((v) => v.toArray());
  return sGroup(ps.slice(1).map((p, i) => ({ p: sCone(ps[i], p, r0 + (r1 - r0) * (i / n), r0 + (r1 - r0) * ((i + 1) / n)) })));
};
const sSquash = (p, sx, sy, sz) => {
  const k = Math.min(sx, sy, sz);
  return { b: [p.b[0] * sx, p.b[1] * sy, p.b[2] * sz, p.b[3] * sx, p.b[4] * sy, p.b[5] * sz], f: (x, y, z) => p.f(x / sx, y / sy, z / sz) * k };
};
const place = (p, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  const e = m.clone().invert().elements, bb = new THREE.Box3(), v = new THREE.Vector3();
  const [x0, y0, z0, x1, y1, z1] = p.b;
  for (let i = 0; i < 8; i++) bb.expandByPoint(v.set(i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0).applyMatrix4(m));
  return {
    b: [...bb.min.toArray(), ...bb.max.toArray()],
    f: (x, y, z) => p.f(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14])
  };
};
const sCyl = (cx, cy, cz, r, h, rd) => ({
  b: [cx - r, cy - h / 2, cz - r, cx + r, cy + h / 2, cz + r],
  f: (x, y, z) => {
    const dx = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2) - r + rd, dy = Math.abs(y - cy) - h / 2 + rd;
    return Math.min(Math.max(dx, dy), 0) + Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2) - rd;
  }
});
const sTorus = (cx, cy, cz, R, r) => ({
  b: [cx - R - r, cy - r, cz - R - r, cx + R + r, cy + r, cz + R + r],
  f: (x, y, z) => { const q = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2) - R, dy = y - cy; return Math.sqrt(q * q + dy * dy) - r; }
});
const sBox = (cx, cy, cz, hx, hy, hz, rd) => ({
  b: [cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz],
  f: (x, y, z) => {
    const qx = Math.abs(x - cx) - hx + rd, qy = Math.abs(y - cy) - hy + rd, qz = Math.abs(z - cz) - hz + rd;
    return Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2 + Math.max(qz, 0) ** 2) + Math.min(Math.max(qx, qy, qz), 0) - rd;
  }
});
const sRidge = (p, amp, freq, y0 = Infinity, y1 = Infinity) => ({
  b: p.b.map((v, i) => v + (i < 3 ? -amp : amp)),
  f: (x, y, z) => {
    const w = y <= y0 ? 1 : y >= y1 ? 0 : (y1 - y) / (y1 - y0);
    return p.f(x, y, z) + amp * w * Math.sin(freq * (x + 0.6 * z) + 2.5 * Math.sin(9 * y));
  }
});
const add = (p, k = 0) => ({ p, k });
const carve = (p, k = 0) => ({ p, k, sub: true });
const eye = (x, y, z, r, nx, ny, nz) => [
  carve(sEll(x, y, z, r, r, r), r * 0.3),
  add(sEll(x - nx * r * 0.7, y - ny * r * 0.7, z - nz * r * 0.7, r * 0.72, r * 0.72, r * 0.72), r * 0.08)
];

// surface nets over a grid with `res` cells across the longest side
function mesh(part, res) {
  const [ex, ey, ez] = [0, 1, 2].map((i) => part.b[i + 3] - part.b[i]);
  const h = Math.max(ex, ey, ez) / res;
  const f = part.f, pad = 3 * h;
  const x0 = part.b[0] - pad, y0 = part.b[1] - pad, z0 = part.b[2] - pad;
  const nx = Math.ceil((part.b[3] + pad - x0) / h) + 1, ny = Math.ceil((part.b[4] + pad - y0) / h) + 1, nz = Math.ceil((part.b[5] + pad - z0) / h) + 1;
  const nxy = nx * ny, V = new Float32Array(nxy * nz);
  const B = 4, far = 1.5 * ((B - 1) / 2) * h * Math.sqrt(3) + 2 * h;
  for (let k0 = 0; k0 < nz; k0 += B) for (let j0 = 0; j0 < ny; j0 += B) for (let i0 = 0; i0 < nx; i0 += B) {
    const i1 = Math.min(i0 + B, nx), j1 = Math.min(j0 + B, ny), k1 = Math.min(k0 + B, nz);
    const dc = f(x0 + ((i0 + i1 - 1) * h) / 2, y0 + ((j0 + j1 - 1) * h) / 2, z0 + ((k0 + k1 - 1) * h) / 2);
    const skip = Math.abs(dc) > far;
    for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      V[i + nx * j + nxy * k] = skip ? dc : f(x0 + i * h, y0 + j * h, z0 + k * h);
    }
  }
  const cell = new Map(), pos = [], cv = new Float32Array(8);
  const CO = [0, 1, nx, nx + 1, nxy, nxy + 1, nxy + nx, nxy + nx + 1];
  const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const id = i + nx * j + nxy * k;
    let mask = 0;
    for (let c = 0; c < 8; c++) { cv[c] = V[id + CO[c]]; if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let q = 0; q < 24; q += 2) {
      const a = EDGES[q], b = EDGES[q + 1];
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += (a & 1) + t * ((b & 1) - (a & 1));
      sy += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1));
      sz += (a >> 2) + t * ((b >> 2) - (a >> 2));
      n++;
    }
    cell.set(id, pos.length / 3);
    pos.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
  }
  const idx = [];
  const quad = (ca, cb, cc, cd, out) => {
    const a = cell.get(ca), b = cell.get(cb), c = cell.get(cc), d = cell.get(cd);
    if (a === undefined || b === undefined || c === undefined || d === undefined) return;
    if (out) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const id = i + nx * j + nxy * k, inside = V[id] < 0;
    if (i < nx - 1 && j > 0 && k > 0 && inside !== V[id + 1] < 0) quad(id - nx - nxy, id - nxy, id, id - nx, inside);
    if (j < ny - 1 && i > 0 && k > 0 && inside !== V[id + nx] < 0) quad(id - 1 - nxy, id - 1, id, id - nxy, inside);
    if (k < nz - 1 && i > 0 && j > 0 && inside !== V[id + nxy] < 0) quad(id - 1 - nx, id - nx, id, id - 1, inside);
  }
  const nrm = new Float32Array(pos.length), e = h * 0.5;
  for (let v = 0; v < pos.length; v += 3) {
    const x = pos[v], y = pos[v + 1], z = pos[v + 2];
    const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    nrm[v] = gx / l; nrm[v + 1] = gy / l; nrm[v + 2] = gz / l;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}

// ---------- the four avatars in play (all face +z) ----------
function cat() {
  const ear = (s) => place(sGroup([
    add(sSquash(sCone([0, 0, 0], [0, 0.19, 0], 0.075, 0.012), 1, 1, 0.55)),
    carve(sSquash(sCone([0, 0.035, 0.045], [0, 0.165, 0.028], 0.045, 0.008), 1, 1, 0.55), 0.015)
  ]), s * 0.115, 0.1, -0.01, 0, s * 0.25, -s * 0.35);
  const head = [add(sEll(0, 0.01, -0.01, 0.2, 0.175, 0.18))];
  for (const s of sides) {
    head.push(add(sEll(s * 0.1, -0.05, 0.04, 0.11, 0.09, 0.11), 0.05));
    head.push(add(sEll(s * 0.032, -0.085, 0.175, 0.038, 0.03, 0.032), 0.02));
    head.push(add(ear(s), 0.03));
  }
  head.push(add(sEll(0, -0.07, 0.15, 0.065, 0.05, 0.06), 0.03));
  head.push(add(sEll(0, -0.12, 0.1, 0.05, 0.035, 0.05), 0.03));
  head.push(add(sEll(0, -0.045, 0.2, 0.028, 0.018, 0.018), 0.01));
  for (const s of sides) {
    head.push(carve(sEll(s * 0.078, 0.02, 0.17, 0.042, 0.032, 0.03), 0.012));
    head.push(add(sEll(s * 0.078, 0.02, 0.145, 0.034, 0.025, 0.022), 0.004));
    head.push(carve(sCone([s * 0.078, 0, 0.168], [s * 0.078, 0.04, 0.168], 0.009, 0.009), 0.004));
    head.push(carve(sCone([0, -0.09, 0.207], [s * 0.04, -0.1, 0.186], 0.008, 0.006), 0.006));
  }
  head.push(carve(sCone([0, -0.062, 0.214], [0, -0.09, 0.207], 0.008, 0.008), 0.006));
  const body = [
    add(sEll(-0.28, 0.8, 0, 0.3, 0.25, 0.19)),
    add(sEll(0, 0.82, 0, 0.36, 0.2, 0.175), 0.12),
    add(sEll(0.3, 0.82, 0, 0.26, 0.23, 0.185), 0.12),
    add(sCone([-0.4, 0.93, 0], [0.36, 0.95, 0], 0.13, 0.13), 0.1),
    add(sCone([-0.38, 0.86, 0], [-0.53, 1.12, 0.04], 0.16, 0.12), 0.08)
  ];
  for (const s of sides) {
    body.push(add(sEll(-0.3, 0.9, s * 0.09, 0.14, 0.16, 0.09), 0.08));
    const fx = s > 0 ? -0.4 : -0.31, fz = s * 0.09;
    body.push(add(sCone([fx + 0.05, 0.76, fz], [fx + 0.02, 0.44, fz], 0.09, 0.065), 0.06));
    body.push(add(sCone([fx + 0.02, 0.44, fz], [fx, 0.1, fz], 0.065, 0.052), 0.03));
    body.push(add(sEll(fx - 0.035, 0.05, fz, 0.085, 0.05, 0.07), 0.03));
    const hx = s > 0 ? 0.3 : 0.37, hz = s * 0.11;
    body.push(add(sEll(hx, 0.66, hz, 0.2, 0.27, 0.095), 0.07));
    body.push(add(sCone([hx + 0.02, 0.5, hz], [hx + 0.12, 0.25, hz], 0.08, 0.058), 0.04));
    body.push(add(sCone([hx + 0.12, 0.25, hz], [hx + 0.05, 0.09, hz], 0.058, 0.05), 0.02));
    body.push(add(sEll(hx + 0.02, 0.05, hz, 0.085, 0.05, 0.07), 0.03));
  }
  body.push(add(sTube([[0.5, 0.88, 0], [0.64, 1.0, 0], [0.7, 1.28, 0], [0.69, 1.56, 0], [0.6, 1.72, 0], [0.48, 1.66, 0]], 0.07, 0.045), 0.06));
  body.push(add(place(sGroup(head), -0.56, 1.2, 0.05, 0.08, -0.5, 0), 0.06));
  return sGroup(body);
}

function dog() {
  const coat = [
    add(sEll(0, 0.52, 0, 0.44, 0.19, 0.17)),
    add(sEll(-0.3, 0.5, 0, 0.2, 0.23, 0.17), 0.1),
    add(sEll(0.34, 0.54, 0, 0.17, 0.19, 0.16), 0.1),
    add(sEll(0, 0.38, 0, 0.42, 0.13, 0.185), 0.08),
    add(sCone([-0.36, 0.6, 0], [-0.5, 0.76, 0], 0.15, 0.12), 0.06),
    add(sCone([0.42, 0.6, 0], [0.5, 0.84, 0], 0.055, 0.025), 0.04)
  ];
  for (const s of sides) {
    coat.push(add(sCone([-0.32, 0.4, s * 0.1], [-0.33, 0.08, s * 0.1], 0.075, 0.06), 0.04));
    coat.push(add(sEll(0.34, 0.42, s * 0.1, 0.13, 0.17, 0.08), 0.05));
    coat.push(add(sCone([0.36, 0.32, s * 0.1], [0.34, 0.08, s * 0.1], 0.065, 0.058), 0.04));
  }
  const body = [add(sRidge(sGroup(coat), 0.0045, 120, 0.46, 0.66))];
  for (const s of sides) for (const px of [-0.36, 0.31]) body.push(add(sEll(px, 0.045, s * 0.1, 0.08, 0.045, 0.065), 0.03));
  const head = [
    add(sEll(-0.5, 0.81, 0, 0.145, 0.13, 0.12)),
    add(sCone([-0.56, 0.77, 0], [-0.72, 0.73, 0], 0.095, 0.08), 0.05),
    add(sEll(-0.81, 0.75, 0, 0.035, 0.03, 0.04), 0.012)
  ];
  for (const s of sides) {
    head.push(add(sEll(-0.6, 0.855, s * 0.05, 0.06, 0.03, 0.04), 0.03));
    head.push(add(place(sSquash(sCone([0, 0, 0], [0, 0.17, 0], 0.068, 0.01), 0.55, 1, 1), -0.46, 0.89, s * 0.075, s * 0.25, 0, -0.12), 0.03));
    head.push(...eye(-0.62, 0.81, s * 0.075, 0.018, -0.3, 0, s * 0.95));
  }
  body.push(add(sGroup(head), 0.05));
  body.push(add(sRidge(sEll(-0.66, 0.65, 0, 0.1, 0.09, 0.085), 0.006, 90), 0.04));
  return sGroup(body);
}

function penguin() {
  const p = [
    add(sEll(0, 0.56, -0.02, 0.29, 0.5, 0.26)),
    add(sEll(0, 0.48, 0.05, 0.26, 0.38, 0.24), 0.1),
    add(sEll(0, 0.5, 0.09, 0.22, 0.36, 0.215), 0.008),
    add(sEll(0, 1.1, 0.02, 0.18, 0.18, 0.18), 0.12),
    add(sCone([0, 0.18, -0.2], [0, 0.05, -0.36], 0.08, 0.03), 0.05),
    add(sCone([0, 1.08, 0.15], [0, 1.04, 0.34], 0.055, 0.012), 0.025),
    carve(sEll(0, 1.065, 0.27, 0.07, 0.006, 0.1), 0.003)
  ];
  for (const s of sides) {
    p.push(...eye(s * 0.08, 1.15, 0.17, 0.028, s * 0.4, 0.1, 0.9));
    p.push(add(place(sEll(0, 0, 0, 0.045, 0.27, 0.12), s * 0.29, 0.62, -0.02, 0, 0, s * 0.2), 0.03));
    p.push(add(sEll(s * 0.11, 0.04, 0.12, 0.09, 0.04, 0.13), 0.07));
  }
  return sGroup(p);
}

function car() {
  const shell = sSquash(sGroup([
    add(sCone([-0.6, 0.3, 0], [0.1, 0.33, 0], 0.13, 0.18)),
    add(sCone([0.1, 0.33, 0], [0.6, 0.36, 0], 0.18, 0.05), 0.04)
  ]), 1, 1, 0.85);
  const c = [
    add(shell),
    carve(sEll(0.14, 0.5, 0, 0.17, 0.12, 0.115), 0.02),
    add(sEll(0.27, 0.43, 0, 0.05, 0.1, 0.1), 0.02),
    add(sCone([0.3, 0.44, 0], [0.55, 0.38, 0], 0.07, 0.03), 0.04),
    add(sBox(-0.06, 0.5, 0, 0.006, 0.035, 0.09, 0.004), 0.01),
    add(place(sTorus(0, 0, 0, 0.055, 0.011), 0, 0.47, 0, 0, 0, 1.1)),
    add(sTube([[-0.36, 0.34, 0.12], [-0.3, 0.24, 0.17], [0, 0.2, 0.18], [0.45, 0.22, 0.17]], 0.025, 0.022), 0.02)
  ];
  for (let k = 0; k < 5; k++) {
    const x = -0.5 + k * 0.06, r = (0.13 + (0.05 * (x + 0.6)) / 0.7) * 0.85;
    for (const s of sides) c.push(carve(sBox(x, 0.33, s * r, 0.01, 0.05, 0.03, 0.006), 0.004));
  }
  for (const s of sides) c.push(add(place(sCyl(0, 0, 0, 0.075, 0.02, 0.006), 0.05, 0.3, s * 0.145, s * Math.PI / 2, 0, 0), 0.006));
  for (const wx of [-0.42, 0.38]) {
    c.push(add(sCone([wx, 0.173, -0.25], [wx, 0.173, 0.25], 0.02, 0.02), 0.01));
    for (const s of sides) {
      const wheel = [
        add(sTorus(0, 0, 0, 0.115, 0.058)),
        add(sCyl(0, 0, 0, 0.1, 0.05, 0.01), 0.01),
        add(sEll(0, 0.03, 0, 0.04, 0.03, 0.04), 0.01)
      ];
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; wheel.push(carve(sEll(0.068 * Math.cos(a), 0, 0.068 * Math.sin(a), 0.018, 0.04, 0.018), 0.004)); }
      c.push(add(place(sGroup(wheel), wx, 0.173, s * 0.25, s * Math.PI / 2, 0, 0)));
    }
  }
  return sGroup(c);
}

const MAKERS = { cat, dog, penguin, car };
// relative heights from the avatars page, so the set reads as one family
export const AVATAR_HEIGHT = { cat: 1.6, dog: 1.15, penguin: 1.43, car: 0.62 };

const cache = new Map();
export function avatarGeometry(kind, res = 90) {
  const key = kind + '@' + res;
  if (!cache.has(key)) cache.set(key, mesh(MAKERS[kind](), res));
  return cache.get(key);
}
export const hasGeometry = (kind, res) => cache.has(kind + '@' + res);

// a metal figure standing on y = 0, centred on x/z, scaled to fit targetH tall and maxXZ across
export function avatarFigure(geo, material, targetH, maxXZ) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true; m.receiveShadow = true;
  const inner = new THREE.Group();
  inner.add(m);
  const size = new THREE.Box3().setFromObject(inner).getSize(new THREE.Vector3());
  inner.scale.setScalar(Math.min(targetH / size.y, maxXZ / Math.max(size.x, size.z)));
  inner.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(inner), c = b.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -b.min.y, -c.z);
  const outer = new THREE.Group();
  outer.add(inner);
  return outer;
}

// The metal reflects its own studio surround: a bright dome with a dark horizon, softboxes and black flags.
export function studioEnvironment(renderer) {
  const s = new THREE.Scene();
  const dome = new THREE.SphereGeometry(20, 64, 32), pos = dome.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 20;
    const v = y > 0.06 ? 0.4 + 0.9 * y : y > -0.04 ? 0.04 : 0.22 + 0.15 * (-y);
    col.push(v, v, v * 1.02);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  s.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (w, h, k, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0);
    s.add(m);
  };
  panel(9, 6, 4, -8, 7, 9);
  panel(5, 10, 2.2, 11, 3, 4);
  panel(14, 4, 3, 0, 15, -2);
  panel(4, 9, 3.5, -6, 3, -12);
  panel(4, 12, 0.03, 13, 2, -6);
  panel(4, 12, 0.03, -14, 2, -2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(s, 0.015).texture;
  pmrem.dispose();
  return tex;
}

export const metal = (hex, env) => new THREE.MeshStandardMaterial({ color: hex, metalness: 1, roughness: 0.14, envMap: env, envMapIntensity: 0.75 });
