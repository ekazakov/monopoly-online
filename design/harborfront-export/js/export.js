// Builds the board once, then writes each part to its own .glb file on request.
import * as THREE from 'three';
import { createBoard } from './board3d.js';
import { PLAYERS, OWNERSHIP } from './data.js';
import { toGLB, figureScene, KINDS } from './exporter.js';

const host = document.getElementById('host');
const status = document.getElementById('status');
const say = (msg) => { status.textContent = msg; };

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The board without tokens, so the file holds only the squares, slab and centre field.
function boardPart(board) {
  const out = board.clone();
  out.children = out.children.filter((c) => c.userData.kind !== 'token');
  return out;
}

// Houses and hotels, flattened to the board's coordinates so they sit on the board file as-is.
function housesPart(board) {
  const out = new THREE.Group();
  out.name = 'houses';
  board.updateMatrixWorld(true);
  board.traverse((o) => {
    if (o.userData.kind !== 'house' && o.userData.kind !== 'hotel') return;
    const c = o.clone();
    o.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    c.name = o.userData.kind;
    out.add(c);
  });
  return out;
}

const { board, setOwnership } = await createBoard(host, {
  frame: host,
  players: PLAYERS,
  ownership: {},
  reduced: () => true,
  onSquare: () => {}
});

// the board is built with no ownership, so houses are placed just for the export and then cleared
const parts = {
  board: () => ({ object: boardPart(board), name: 'harborfront-board.glb' }),
  houses: () => {
    setOwnership(OWNERSHIP);
    const object = housesPart(board);
    setOwnership({});
    return { object, name: 'harborfront-houses.glb' };
  },
  ...Object.fromEntries(KINDS.map((kind) => [kind, () => ({ object: figureScene(kind), name: `harborfront-${kind}.glb` })]))
};

async function run(key) {
  const names = key === 'all' ? ['board', 'houses', ...KINDS] : [key];
  for (const n of names) {
    say(`Exporting ${n}…`);
    const { object, name } = parts[n]();
    const bytes = await toGLB(object);
    download(bytes, name);
    say(`Saved ${name} (${(bytes.byteLength / 1024).toFixed(1)} KB)`);
    await new Promise((r) => setTimeout(r, 400)); // give the browser time between downloads
  }
}

say('Ready.');
document.querySelectorAll('[data-export]').forEach((btn) => {
  btn.addEventListener('click', () => run(btn.dataset.export).catch((e) => say('Export failed: ' + e.message)));
});
