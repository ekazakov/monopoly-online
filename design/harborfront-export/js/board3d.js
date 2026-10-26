// The 3D board, built from harborfront-3d.html: same squares, corners and houses, with the avatar
// figures as tokens. It renders into the board column only; the turn area is DOM laid over its centre.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SQUARES } from './data.js';
import { avatarGeometry, avatarFigure, studioEnvironment, metal, AVATAR_HEIGHT } from './sculpt.js';

const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif';
const BODY = '"Barlow", system-ui, sans-serif';
const ink = '#17211b';
// metal finishes from the avatars page that match the player colours
export const METAL = { '#2f6fd0': 0x3f7fe0, '#d9392f': 0xe0463c, '#2fa05c': 0x35b066, '#f0b429': 0xf6c244 };

// host: the full-screen element the canvas fills; frame: the board column the board is fitted to
export async function createBoard(host, { frame, players, ownership, reduced, onSquare }) {
  await Promise.race([
    Promise.all([document.fonts.load(`700 40px ${DISPLAY}`), document.fonts.load(`600 40px ${BODY}`)]),
    new Promise((r) => setTimeout(r, 1500))
  ]).catch(() => {});

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const env = studioEnvironment(renderer);

  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x2a3a2c, 0.85));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(-6, 12, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // ---------- textures ----------
  const mk = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  };
  const std = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 });
  function wrap(g, text, maxW) {
    const words = text.split(' '), lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    lines.push(line);
    return lines;
  }
  function icon(g, kind, cx, cy) {
    g.save();
    g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
    if (kind === 'rail') {
      g.beginPath(); g.roundRect(cx - 55, cy - 65, 110, 110, 24); g.stroke();
      g.beginPath(); g.moveTo(cx - 55, cy - 15); g.lineTo(cx + 55, cy - 15); g.stroke();
      g.beginPath(); g.arc(cx - 26, cy + 14, 6, 0, 7); g.fill();
      g.beginPath(); g.arc(cx + 26, cy + 14, 6, 0, 7); g.fill();
      g.beginPath(); g.moveTo(cx - 36, cy + 80); g.lineTo(cx - 20, cy + 45); g.moveTo(cx + 36, cy + 80); g.lineTo(cx + 20, cy + 45); g.stroke();
    } else if (kind === 'util') {
      g.beginPath(); g.arc(cx, cy - 20, 48, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(cx - 22, cy + 42); g.lineTo(cx + 22, cy + 42); g.moveTo(cx - 16, cy + 62); g.lineTo(cx + 16, cy + 62); g.stroke();
    } else if (kind === 'chance') {
      g.fillStyle = '#c0302a'; g.font = `700 230px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillText('?', cx, cy + 90);
    } else if (kind === 'chest') {
      g.strokeStyle = '#1f4f96';
      g.beginPath(); g.roundRect(cx - 62, cy - 10, 124, 74, 8); g.stroke();
      g.beginPath(); g.moveTo(cx - 62, cy + 18); g.lineTo(cx + 62, cy + 18); g.stroke();
      g.beginPath(); g.moveTo(cx - 62, cy - 10); g.quadraticCurveTo(cx - 62, cy - 62, cx, cy - 62); g.quadraticCurveTo(cx + 62, cy - 62, cx + 62, cy - 10); g.stroke();
    } else if (kind === 'tax') {
      g.beginPath(); g.moveTo(cx, cy - 66); g.lineTo(cx + 62, cy); g.lineTo(cx, cy + 66); g.lineTo(cx - 62, cy); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(cx - 62, cy); g.lineTo(cx + 62, cy); g.stroke();
    }
    g.restore();
  }
  const priceLabel = (c) => (c.kind === 'tax' ? 'Pay $' + c.amount : c.price ? '$' + c.price : '');
  function cellTexture(c) {
    return mk(320, 560, (g, w, h) => {
      g.fillStyle = '#eef4e9'; g.fillRect(0, 0, w, h);
      if (c.kind === 'prop') { g.fillStyle = groupColor(c); g.fillRect(0, 0, w, 120); }
      g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.font = `700 58px ${DISPLAY}`;
      const lines = wrap(g, c.name.toUpperCase(), 280);
      let y = (c.kind === 'prop' ? 120 : 0) + 64;
      for (const l of lines) { g.fillText(l, w / 2, y); y += 56; }
      if (c.kind !== 'prop') icon(g, c.kind, w / 2, 350);
      g.font = `600 46px ${BODY}`;
      const p = priceLabel(c);
      if (p) g.fillText(p, w / 2, h - 28);
    });
  }
  const GROUP_HEX = { brown: '#8a5a3c', sky: '#9bd4ea', pink: '#d9569b', orange: '#ee8a2c', red: '#d93a32', yellow: '#f2cd2e', green: '#2f9e5b', navy: '#2459a6' };
  const groupColor = (c) => GROUP_HEX[c.group];

  // ---------- board ----------
  const board = new THREE.Group();
  scene.add(board);
  const W = (v) => (v - 500) / 100; // flat-board px -> world units

  const slab = new THREE.Mesh(new THREE.BoxGeometry(10.3, 0.5, 10.3), std(0xe9e2cf, 0.7));
  slab.position.y = -0.3; slab.castShadow = true; slab.receiveShadow = true;
  board.add(slab);
  const base = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 10), std(0x1d2b24, 0.8));
  base.position.y = -0.05; base.receiveShadow = true;
  board.add(base);
  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.35 }));
  shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.position.y = -0.56; shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  const cellH = 0.12;
  const cellGeo = new THREE.BoxGeometry(0.77, cellH, 1.37);
  const sq = []; // per square: { g: group in local frame, top: top material, corner }
  const pickables = [];

  const SIDE = {
    bottom: { theta: 0, pos: (k) => [820 - 80 * k, 930] },
    left: { theta: -Math.PI / 2, pos: (k) => [70, 820 - 80 * k] },
    top: { theta: Math.PI, pos: (k) => [180 + 80 * k, 70] },
    right: { theta: Math.PI / 2, pos: (k) => [930, 180 + 80 * k] }
  };
  const CORNER_AT = { go: [930, 930], jail: [70, 930], parking: [70, 70], gotojail: [930, 70] };

  for (const c of SQUARES) {
    const g = new THREE.Group();
    const side = std(0xcdd6c6, 0.8);
    let top;
    if (c.corner) {
      const [bx, by] = CORNER_AT[c.kind];
      g.position.set(W(bx), 0, W(by));
      top = new THREE.MeshStandardMaterial({ map: cornerTexture(c.kind), roughness: 0.7 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.37, cellH, 1.37), [side, side, top, side, side, side]);
      m.position.y = cellH / 2; m.receiveShadow = true; m.castShadow = true;
      m.userData.sq = c.i; pickables.push(m);
      g.add(m);
    } else {
      const s = SIDE[c.side];
      const [bx, by] = s.pos(c.k);
      g.position.set(W(bx), 0, W(by));
      g.rotation.y = s.theta;
      top = new THREE.MeshStandardMaterial({ map: cellTexture(c), roughness: 0.7 });
      const m = new THREE.Mesh(cellGeo, [side, side, top, side, side, side]);
      m.position.y = cellH / 2; m.receiveShadow = true; m.castShadow = true;
      m.userData.sq = c.i; pickables.push(m);
      g.add(m);
      if (c.kind === 'prop') {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.05, 0.3), std(groupColor(c), 0.5));
        bar.position.set(0, cellH + 0.025 - 0.001, -0.535);
        bar.castShadow = true; bar.receiveShadow = true;
        bar.userData.sq = c.i; pickables.push(bar);
        g.add(bar);
      }
    }
    board.add(g);
    sq.push({ g, top, corner: !!c.corner, extras: new THREE.Group(), glow: 0 });
    g.add(sq[c.i].extras);
  }

  function cornerTexture(kind) {
    return mk(560, 560, (g, w) => {
      g.fillStyle = '#eef4e9'; g.fillRect(0, 0, w, w); g.textAlign = 'center';
      if (kind === 'go') {
        g.fillStyle = ink; g.font = `600 36px ${BODY}`;
        g.fillText('COLLECT $200', 280, 80); g.fillText('SALARY AS YOU PASS', 280, 122);
        g.fillStyle = '#c8322b'; g.font = `700 270px ${DISPLAY}`; g.fillText('GO', 280, 380);
        g.strokeStyle = '#c8322b'; g.lineWidth = 22; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(450, 470); g.lineTo(110, 470); g.moveTo(170, 425); g.lineTo(110, 470); g.lineTo(170, 515); g.stroke();
      } else if (kind === 'jail') {
        g.fillStyle = '#f0902f'; g.fillRect(0, 0, 400, 400);
        g.strokeStyle = ink; g.lineWidth = 8; g.strokeRect(0, 0, 400, 400);
        g.fillStyle = '#fbe3c4'; g.fillRect(90, 60, 220, 190); g.strokeRect(90, 60, 220, 190);
        for (let x = 145; x < 310; x += 55) { g.beginPath(); g.moveTo(x, 60); g.lineTo(x, 250); g.stroke(); }
        g.fillStyle = ink; g.font = `700 70px ${DISPLAY}`; g.fillText('IN JAIL', 200, 340);
        g.font = `700 56px ${DISPLAY}`; g.fillText('JUST VISITING', 280, 510);
      } else if (kind === 'parking') {
        g.fillStyle = ink; g.font = `700 92px ${DISPLAY}`; g.fillText('FREE', 280, 130);
        g.fillStyle = '#c8322b'; g.strokeStyle = ink; g.lineWidth = 9; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(110, 360); g.lineTo(110, 300); g.lineTo(170, 280); g.lineTo(215, 215); g.lineTo(350, 215); g.lineTo(410, 280); g.lineTo(455, 295); g.lineTo(455, 360); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#eef4e9';
        g.beginPath(); g.arc(185, 365, 34, 0, 7); g.fill(); g.stroke();
        g.beginPath(); g.arc(385, 365, 34, 0, 7); g.fill(); g.stroke();
        g.fillStyle = ink; g.fillText('PARKING', 280, 510);
      } else {
        g.fillStyle = ink; g.font = `700 92px ${DISPLAY}`; g.fillText('GO TO', 280, 130);
        g.fillStyle = '#2a6fb0'; g.strokeStyle = ink; g.lineWidth = 9; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(280, 170); g.lineTo(400, 215); g.lineTo(400, 320); g.quadraticCurveTo(400, 400, 280, 440); g.quadraticCurveTo(160, 400, 160, 320); g.lineTo(160, 215); g.closePath(); g.fill(); g.stroke();
        g.strokeStyle = '#fff'; g.lineWidth = 24; g.lineCap = 'round';
        g.beginPath(); g.moveTo(222, 315); g.lineTo(268, 362); g.lineTo(345, 262); g.stroke();
        g.fillStyle = ink; g.fillText('JAIL', 280, 530);
      }
    });
  }

  // centre field: plain, so the DOM turn area reads cleanly over it; the card piles stay in two corners
  const centre = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 7.2),
    new THREE.MeshStandardMaterial({
      roughness: 0.85,
      map: mk(1024, 1024, (g, w) => {
        g.fillStyle = '#cfe3cc'; g.fillRect(0, 0, w, w);
        const k = w / 720;
        const zone = (cx, cy, label) => {
          g.save(); g.translate(cx * k, cy * k); g.rotate(Math.PI / 4);
          g.setLineDash([14, 10]); g.lineWidth = 5; g.strokeStyle = '#3d5a4a';
          g.strokeRect(-70 * k, -46 * k, 140 * k, 92 * k);
          g.setLineDash([]); g.fillStyle = '#2f4a3b'; g.font = `700 ${18 * k}px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(label, 0, 0);
          g.restore();
        };
        zone(92, 92, 'COMMUNITY CHEST');
        zone(628, 628, 'CHANCE');
      })
    })
  );
  centre.rotation.x = -Math.PI / 2; centre.position.y = 0.004; centre.receiveShadow = true;
  board.add(centre);

  // ---------- ownership markers, houses, hotels ----------
  const houseMat = std(0x38b36a, 0.5), roofMat = std(0x1f7a46, 0.5), hotelMat = std(0xd4372f, 0.5), hotelRoof = std(0x8e231d, 0.5);
  const houseBody = new THREE.BoxGeometry(0.15, 0.13, 0.15), houseRoof = new THREE.ConeGeometry(0.13, 0.1, 4);
  const markerGeo = new THREE.BoxGeometry(0.77, 0.018, 0.12);
  const colorOf = Object.fromEntries(players.map((p) => [p.id, p.color]));
  const markerMats = {};
  const markerMat = (hex, dim) => {
    const key = hex + dim;
    if (!markerMats[key]) markerMats[key] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.45, transparent: dim, opacity: dim ? 0.45 : 1 });
    return markerMats[key];
  };
  function setOwnership(own) {
    for (const c of SQUARES) {
      if (c.corner || !c.price) continue;
      const s = sq[c.i];
      s.extras.clear();
      const o = own[c.i];
      s.top.color.set(o && o.mortgaged ? 0xa7ada3 : 0xffffff);
      if (!o) continue;
      const mk = new THREE.Mesh(markerGeo, markerMat(colorOf[o.owner], !!o.mortgaged));
      mk.position.set(0, cellH + 0.009, 0.625);
      mk.receiveShadow = true;
      s.extras.add(mk);
      const n = o.houses || 0;
      if (n === 5) {
        const h = new THREE.Group();
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.2), hotelMat);
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.22), hotelRoof);
        r.position.y = 0.13;
        h.userData.kind = 'hotel';
        h.add(b, r); h.position.set(0, cellH + 0.05 + 0.1, -0.535);
        h.children.forEach((m) => { m.castShadow = true; });
        s.extras.add(h);
      } else for (let i = 0; i < n; i++) {
        const h = new THREE.Group();
        const b = new THREE.Mesh(houseBody, houseMat), r = new THREE.Mesh(houseRoof, roofMat);
        r.rotation.y = Math.PI / 4; r.position.y = 0.115;
        h.userData.kind = 'house';
        h.add(b, r); h.position.set((i - (n - 1) / 2) * 0.19, cellH + 0.05 + 0.065, -0.535);
        h.children.forEach((m) => { m.castShadow = true; });
        s.extras.add(h);
      }
    }
  }
  setOwnership(ownership);

  // ---------- tokens ----------
  const tokens = {}; // id -> { holder, pos, figure }
  const local = new THREE.Vector3();
  // where a token stands on square i, as the k-th of n tokens sharing it
  function spot(i, k, n) {
    const s = sq[i];
    const offs = n === 1 ? [[0, 0.15]] : n === 2 ? [[-0.17, 0.15], [0.17, 0.15]] : n === 3 ? [[-0.17, -0.05], [0.17, -0.05], [0, 0.4]] : [[-0.17, -0.1], [0.17, -0.1], [-0.17, 0.38], [0.17, 0.38]];
    const [ox, oz] = offs[k] || [0, 0];
    if (s.corner) {
      const f = SQUARES[i].kind === 'jail' ? 1.4 : 1.6;
      local.set(ox * f, cellH, (oz - 0.15) * f);
    } else local.set(ox, cellH, oz);
    return s.g.localToWorld(local.clone());
  }
  function layout(skip) {
    const at = {};
    for (const p of players) if (!tokens[p.id]?.hidden) (at[tokens[p.id].pos] ||= []).push(p.id);
    for (const [i, ids] of Object.entries(at)) ids.forEach((id, k) => {
      if (id === skip) return;
      const t = tokens[id];
      t.holder.position.copy(spot(+i, k, ids.length));
      t.holder.scale.setScalar(ids.length > 1 ? 0.82 : 1);
    });
  }
  for (const p of players) {
    const holder = new THREE.Group();
    holder.rotation.y = 0.35;
    holder.userData.kind = 'token';
    board.add(holder);
    tokens[p.id] = { holder, pos: p.pos, figure: null };
  }
  layout();
  // cast one figure per tick so the board shows at once and tokens appear as they finish
  (async () => {
    for (const p of players) {
      await new Promise((r) => setTimeout(r, 20));
      const geo = avatarGeometry(p.avatar, 80);
      const fig = avatarFigure(geo, metal(METAL[p.color], env), AVATAR_HEIGHT[p.avatar] * 0.5, 0.72);
      fig.traverse((o) => { o.userData.player = p.id; });
      tokens[p.id].holder.add(fig);
      tokens[p.id].figure = fig;
    }
  })();

  const anims = [];
  function moveToken(id, path) {
    const t = tokens[id];
    if (!path.length) return Promise.resolve();
    if (reduced()) {
      t.pos = path[path.length - 1];
      layout();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let step = 0;
      const hop = () => {
        const from = t.holder.position.clone();
        t.pos = path[step];
        const to = spot(t.pos, 0, 1);
        anims.push({ t0: performance.now(), dur: 170, tick: (k) => {
          t.holder.position.lerpVectors(from, to, k);
          t.holder.position.y = to.y + Math.sin(k * Math.PI) * 0.35;
        }, done: () => {
          glow(t.pos);
          step++;
          if (step < path.length) hop(); else { layout(); resolve(); }
        } });
      };
      t.holder.scale.setScalar(1);
      hop();
    });
  }
  function placeToken(id, i) { tokens[id].pos = i; layout(); }
  function setTokenVisible(id, v) { tokens[id].hidden = !v; tokens[id].holder.visible = v; layout(); }

  // the last move path glows briefly (R-B5)
  function glow(i) { if (!reduced()) sq[i].glow = 1; }

  // ---------- camera ----------
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = 0.95;
  // keep the board readable: a little orbit either way, never upside down
  controls.minAzimuthAngle = -0.7;
  controls.maxAzimuthAngle = 0.7;
  controls.target.set(0, 0, 0);
  const VIEWS = { angle: new THREE.Vector3(0, 0.9, 0.44).normalize(), top: new THREE.Vector3(0, 1, 0.0001) };
  let view = 'angle';
  const corners = [];
  for (const x of [-5.15, 5.15]) for (const y of [-0.55, 0.3]) for (const z of [-5.15, 5.15]) corners.push(new THREE.Vector3(x, y, z));
  // The canvas covers the whole screen so a zoomed board runs under the rail, log and hand, but the camera
  // is framed on the board column: a virtual frame centred on the column, of which the canvas is one window.
  let col = { x: 0, y: 0, w: 1, h: 1 }, vf = { W: 1, H: 1 }, viewW = 1, viewH = 1;
  const frameView = () => camera.setViewOffset(vf.W, vf.H, vf.W / 2 - (col.x + col.w / 2), vf.H / 2 - (col.y + col.h / 2), viewW, viewH);
  // the shortest distance along dir that keeps the whole slab inside the board column
  function fit(dir) {
    let lo = 4, hi = 80;
    const v = new THREE.Vector3(), keepP = camera.position.clone(), keepQ = camera.quaternion.clone();
    const lx = (0.97 * col.w) / vf.W, ly = (0.97 * col.h) / vf.H;
    camera.clearViewOffset();
    for (let it = 0; it < 24; it++) {
      const d = (lo + hi) / 2;
      camera.position.copy(dir).multiplyScalar(d);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const ok = corners.every((c) => { v.copy(c).project(camera); return Math.abs(v.x) < lx && Math.abs(v.y) < ly; });
      if (ok) hi = d; else lo = d;
    }
    frameView();
    camera.position.copy(keepP); camera.quaternion.copy(keepQ); camera.updateMatrixWorld();
    return hi;
  }
  let tween = null;
  function setView(name, animate = true) {
    view = name;
    const dir = VIEWS[name].clone();
    const d = fit(dir);
    controls.minDistance = d * 0.6; controls.maxDistance = d * 1.15;
    const to = dir.multiplyScalar(d);
    if (!animate || reduced()) { camera.position.copy(to); controls.target.set(0, 0, 0); controls.update(); return; }
    tween = { from: camera.position.clone(), to, t0: performance.now(), dur: 700 };
  }
  controls.addEventListener('start', () => { tween = null; });

  function resize() {
    viewW = host.clientWidth; viewH = host.clientHeight;
    if (!viewW || !viewH) return;
    renderer.setSize(viewW, viewH, false);
    const hr = host.getBoundingClientRect(), fr = frame.getBoundingClientRect();
    col = { x: fr.left - hr.left, y: fr.top - hr.top, w: fr.width, h: fr.height };
    const cx = col.x + col.w / 2, cy = col.y + col.h / 2;
    vf = { W: 2 * Math.max(cx, viewW - cx), H: 2 * Math.max(cy, viewH - cy) };
    frameView();
    setView(view, false);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host); ro.observe(frame);
  resize();

  // ---------- picking ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit) onSquare(hit.object.userData.sq);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    renderer.domElement.style.cursor = ray.intersectObjects(pickables, false).length ? 'pointer' : '';
  });

  // ---------- centre projection for the DOM overlay ----------
  // the largest square, centred on the projected board centre, that fits inside the projected centre field
  const quad = [[-3.45, -3.45], [3.45, -3.45], [3.45, 3.45], [-3.45, 3.45]].map(([x, z]) => new THREE.Vector3(x, 0, z));
  function centreRect() {
    const w = host.clientWidth, h = host.clientHeight;
    const P = quad.map((q) => { const v = q.clone().project(camera); return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h]; });
    const c = new THREE.Vector3(0, 0, 0).project(camera);
    const cx = (c.x + 1) / 2 * w, cy = (1 - c.y) / 2 * h;
    const inside = (x, y) => {
      let sign = 0;
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = P[i], [bx, by] = P[(i + 1) % 4];
        const cr = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
        if (cr !== 0) { if (sign && Math.sign(cr) !== sign) return false; sign = Math.sign(cr); }
      }
      return true;
    };
    let lo = 0, hi = Math.max(w, h);
    for (let it = 0; it < 20; it++) {
      const s = (lo + hi) / 2;
      if ([[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([dx, dy]) => inside(cx + dx * s, cy + dy * s))) lo = s; else hi = s;
    }
    // relative to the board column, where the turn area lives
    return { x: cx - col.x, y: cy - col.y, half: lo };
  }

  const listeners = [];
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      camera.position.lerpVectors(tween.from, tween.to, e);
      if (k >= 1) tween = null;
    }
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i], k = Math.min(1, (now - a.t0) / a.dur);
      a.tick(k);
      if (k >= 1) { anims.splice(i, 1); a.done(); }
    }
    for (const s of sq) if (s.glow > 0) {
      s.glow = Math.max(0, s.glow - dt * 0.7);
      s.top.emissive.set(0xe2574c);
      s.top.emissiveIntensity = s.glow * 0.45;
    }
    controls.update();
    renderer.render(scene, camera);
    const r = centreRect();
    for (const f of listeners) f(r);
  });

  return {
    board, scene, setOwnership, moveToken, placeToken, setTokenVisible, setView,
    onFrame: (f) => listeners.push(f),
    env, renderer
  };
}

// The big avatar on the handoff screen: one figure on a plinth, slowly turning.
export function createAvatarStage(host, player, reduced) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const env = studioEnvironment(renderer);
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x1d2b24, 0.35));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.8);
  sun.position.set(-3, 6, 4); sun.castShadow = true;
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.3, 4.2);
  camera.lookAt(0, 0.62, 0);
  const plinth = new THREE.Mesh(
    new THREE.LatheGeometry([[0, 0], [0.85, 0], [0.88, 0.03], [0.88, 0.09], [0.8, 0.12], [0, 0.12]].map(([x, y]) => new THREE.Vector2(x, y)), 64),
    new THREE.MeshStandardMaterial({ color: 0x1b2a35, metalness: 0.4, roughness: 0.45 })
  );
  plinth.receiveShadow = true;
  scene.add(plinth);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.014, 8, 72), new THREE.MeshBasicMaterial({ color: new THREE.Color(player.color) }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.122;
  scene.add(ring);
  const fig = avatarFigure(avatarGeometry(player.avatar, 80), metal(METAL[player.color], env), Math.min(1.25, AVATAR_HEIGHT[player.avatar] * 0.8), 1.4);
  fig.position.y = 0.12;
  fig.rotation.y = 0.5;
  scene.add(fig);
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!reduced()) fig.rotation.y += dt * 0.6;
    renderer.render(scene, camera);
  });
  return () => { ro.disconnect(); renderer.setAnimationLoop(null); renderer.dispose(); env.dispose(); renderer.domElement.remove(); };
}
