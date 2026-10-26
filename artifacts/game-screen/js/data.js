// Canned prototype data. Nothing here is computed from game rules: squares, owners, rents,
// rolls and outcomes are fixed values so every screen state can be shown on demand.

export const GROUPS = {
  brown: { name: 'Brown', color: '#8a5a3c', size: 2 },
  sky: { name: 'Sky', color: '#9bd4ea', size: 3 },
  pink: { name: 'Pink', color: '#d9569b', size: 3 },
  orange: { name: 'Orange', color: '#ee8a2c', size: 3 },
  red: { name: 'Red', color: '#d93a32', size: 3 },
  yellow: { name: 'Yellow', color: '#f2cd2e', size: 3 },
  green: { name: 'Green', color: '#2f9e5b', size: 3 },
  navy: { name: 'Navy', color: '#2459a6', size: 2 },
  station: { name: 'Stations', color: '#17211b', size: 4 },
  utility: { name: 'Utilities', color: '#a9bcc9', size: 2 }
};
export const GROUP_ORDER = ['brown', 'sky', 'pink', 'orange', 'red', 'yellow', 'green', 'navy', 'station', 'utility'];

// sample rent tables, keyed by price: rent, 1–4 houses, hotel, house cost
const RENTS = {
  60: [[2, 10, 30, 90, 160, 250], [4, 20, 60, 180, 320, 450], 50],
  100: [[6, 30, 90, 270, 400, 550], null, 50],
  120: [[8, 40, 100, 300, 450, 600], null, 50],
  140: [[10, 50, 150, 450, 625, 750], null, 100],
  160: [[12, 60, 180, 500, 700, 900], null, 100],
  180: [[14, 70, 200, 550, 750, 950], null, 100],
  200: [[16, 80, 220, 600, 800, 1000], null, 100],
  220: [[18, 90, 250, 700, 875, 1050], null, 150],
  240: [[20, 100, 300, 750, 925, 1100], null, 150],
  260: [[22, 110, 330, 800, 975, 1150], null, 150],
  280: [[24, 120, 360, 850, 1025, 1200], null, 150],
  300: [[26, 130, 390, 900, 1100, 1275], null, 200],
  320: [[28, 150, 450, 1000, 1200, 1400], null, 200],
  350: [[35, 175, 500, 1100, 1300, 1500], null, 200],
  400: [[50, 200, 600, 1400, 1700, 2000], null, 200]
};

const prop = (name, price, group) => ({ kind: 'prop', name, price, group });
const rail = (name) => ({ kind: 'rail', name, price: 200, group: 'station' });
const util = (name) => ({ kind: 'util', name, price: 150, group: 'utility' });
const chance = () => ({ kind: 'chance', name: 'Chance' });
const chest = () => ({ kind: 'chest', name: 'Community Chest' });
const tax = (name, amount) => ({ kind: 'tax', name, amount });
const corner = (kind, name) => ({ kind, name, corner: true });

const bottom = [prop('Driftwood Lane', 60, 'brown'), chest(), prop('Kelp Court', 60, 'brown'), tax('Harbor Tax', 200), rail('North Station'), prop('Lantern Row', 100, 'sky'), chance(), prop('Cobble Street', 100, 'sky'), prop('Saltmarsh Road', 120, 'sky')];
const left = [prop('Orchard Way', 140, 'pink'), util('Power Works'), prop('Mill Street', 140, 'pink'), prop('Foundry Road', 160, 'pink'), rail('East Station'), prop('Copper Lane', 180, 'orange'), chest(), prop('Tinsmith Row', 180, 'orange'), prop('Market Square', 200, 'orange')];
const top = [prop('Beacon Hill', 220, 'red'), chance(), prop('Signal Street', 220, 'red'), prop('Lighthouse Road', 240, 'red'), rail('South Station'), prop('Canal Street', 260, 'yellow'), prop('Bridge Road', 260, 'yellow'), util('Waterworks'), prop('Fountain Plaza', 280, 'yellow')];
const right = [prop('Pinecrest Avenue', 300, 'green'), prop('Aspen Way', 300, 'green'), chest(), prop('Cedar Heights', 320, 'green'), rail('West Station'), chance(), prop('Parkview', 350, 'navy'), tax('Luxury Tax', 100), prop('Grand Esplanade', 400, 'navy')];

// index 0 is GO, then clockwise: bottom row, Jail, left column, Free Parking, top row, Go to Jail, right column
export const SQUARES = [
  corner('go', 'GO'), ...bottom.map((c, k) => ({ ...c, side: 'bottom', k })),
  corner('jail', 'Jail'), ...left.map((c, k) => ({ ...c, side: 'left', k })),
  corner('parking', 'Free Parking'), ...top.map((c, k) => ({ ...c, side: 'top', k })),
  corner('gotojail', 'Go to Jail'), ...right.map((c, k) => ({ ...c, side: 'right', k }))
].map((c, i) => {
  const s = { ...c, i };
  if (c.kind === 'prop') {
    const [rents, alt, house] = RENTS[c.price];
    s.rents = c.name === 'Kelp Court' ? alt : rents;
    s.houseCost = house;
  }
  if (c.price) s.mortgage = c.price / 2;
  return s;
});

export const PLAYERS = [
  { id: 'ines', name: 'Ines', color: '#2f6fd0', avatar: 'cat', avatarName: 'cat', device: 'remote', conn: 'online', cash: 1340, pos: 10, inJail: true, cards: 0 },
  { id: 'marlow', name: 'Marlow', color: '#d9392f', avatar: 'dog', avatarName: 'Scottish terrier', device: 'local', cash: 1500, pos: 21, cards: 1 },
  { id: 'tove', name: 'Tove', color: '#2fa05c', avatar: 'penguin', avatarName: 'penguin', device: 'local', cash: 820, pos: 13, cards: 0 },
  { id: 'ravi', name: 'Ravi', color: '#f0b429', avatar: 'car', avatarName: 'racing car', device: 'remote', conn: 'reconnecting', cash: 2010, pos: 26, cards: 0 }
];

// square index -> owner, houses (5 = hotel), mortgaged
export const OWNERSHIP = {
  1: { owner: 'marlow', houses: 1 }, 3: { owner: 'marlow', houses: 1 },
  5: { owner: 'marlow' }, 15: { owner: 'marlow' },
  6: { owner: 'marlow', houses: 2 }, 8: { owner: 'marlow', houses: 2 }, 9: { owner: 'marlow', houses: 2 },
  12: { owner: 'marlow', mortgaged: true },
  21: { owner: 'marlow' },
  11: { owner: 'ines', houses: 3 }, 13: { owner: 'ines', houses: 3 }, 14: { owner: 'ines', houses: 5 }, 16: { owner: 'ines' },
  31: { owner: 'tove' }, 32: { owner: 'tove' }, 37: { owner: 'tove' }, 25: { owner: 'tove' },
  26: { owner: 'ravi', houses: 1 }, 27: { owner: 'ravi' }, 29: { owner: 'ravi' }, 28: { owner: 'ravi' }
};

// newest first; {n} is replaced with the player's name, styled in their colour
export const LOG = [
  { p: 'marlow', t: '{n} bought Beacon Hill for $220.', money: true },
  { p: 'marlow', t: '{n} rolled 4 and 3 and landed on Beacon Hill.' },
  { p: 'tove', t: '{n} paid $120 rent to Ines.', money: true },
  { p: 'ines', t: '{n} was sent to jail.' },
  { p: 'ravi', t: '{n} built a house on Canal Street.', money: true },
  { p: 'ravi', t: '{n} rolled 6 and 2 and landed on Canal Street.' },
  { p: 'tove', t: '{n} bought Pinecrest Avenue for $300.', money: true },
  { p: 'tove', t: '{n} rolled 5 and 4 and landed on Pinecrest Avenue.' },
  { p: 'ines', t: '{n} collected $200 passing GO.', money: true },
  { p: 'ines', t: '{n} rolled 2 and 1 and landed on Chance.' },
  { p: 'marlow', t: '{n} paid $200 Harbor Tax.', money: true }
];

export const CARDS = {
  chance: { deck: 'Chance', text: 'Speeding through the harbour. Pay a fine of $15.', amount: -15 },
  chest: { deck: 'Community Chest', text: 'Your harbour-front café wins a prize. Collect $50.', amount: 50 }
};

// The scripted demo: turns play in this order, each with fixed dice and a fixed outcome.
// land: the phase shown after moving (buy, rent, card, tax, none).
export const SCRIPT = [
  { player: 'tove', rolls: [
    { dice: [3, 3], to: 19, land: 'buy', doubles: true },
    { dice: [2, 5], to: 26, land: 'rent', owner: 'ravi', amount: 110 }
  ] },
  { player: 'ravi', rolls: [{ dice: [6, 4], to: 36, land: 'card', card: 'chance' }] },
  { player: 'ines', jail: true, rolls: [{ dice: [4, 1], to: 15, land: 'rent', owner: 'marlow', amount: 50 }] },
  { player: 'marlow', rolls: [{ dice: [1, 2], to: 24, land: 'buy' }] },
  { player: 'tove', rolls: [
    { dice: [6, 6], to: 38, land: 'tax', doubles: true },
    { dice: [2, 1], to: 1, land: 'rent', owner: 'marlow', amount: 10, passGo: true }
  ] },
  { player: 'ravi', rolls: [{ dice: [2, 4], to: 2, land: 'card', card: 'chest', passGo: true }] },
  { player: 'ines', rolls: [{ dice: [5, 4], to: 24, land: 'rent', owner: 'marlow', amount: 20 }] }
];
