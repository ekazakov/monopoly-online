// Game screen 2 prototype: renders the screen from canned state and steps through a scripted demo.
// There is no game logic: every roll, landing and outcome comes from data.js or the prototype panel.
import { SQUARES, GROUPS, GROUP_ORDER, PLAYERS, OWNERSHIP, LOG, CARDS, SCRIPT } from './data.js';
import { avatarSVG, dieSVG, ICON, SQUARE_ICON } from './icons.js';

const $ = (s, el = document) => el.querySelector(s);
const fmt = (n) => (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// player colours lifted for text on the dark log bar (4.5:1 or better)
const TEXT = { ines: '#8cb8ff', marlow: '#ff958b', tove: '#72d69e', ravi: '#f5c95c' };
const DARK_BANDS = new Set(['brown', 'navy', 'station']);
const sysReduced = matchMedia('(prefers-reduced-motion: reduce)');

const S = {};
function reset() {
  Object.assign(S, {
    players: PLAYERS.map((p) => ({ ...p })),
    own: structuredClone(OWNERSHIP),
    log: LOG.map((e, i) => ({ ...e, id: -i })),
    logOpen: false, logFilter: 'all',
    round: 7,
    situation: 'local', active: 'marlow', lastLocal: 'marlow',
    phase: 'resolved', dice: [4, 3], ctx: {},
    turnIdx: -1, rollIdx: 0, scripted: true,
    reduceMotion: sysReduced.matches, sound: true, music: 40, view: 'angle',
    isOwner: true, deviceConn: 'online', sessionNotice: null
  });
}
reset();
let logSeq = 1, dlgSeq = 1;
const P = (id) => S.players.find((p) => p.id === id);
const reduced = () => S.reduceMotion;
const handBase = () => (S.situation === 'local' ? S.active : S.lastLocal);
// the seat switcher of the expanded hand (hot-seat): a local seat other than the one on turn
const handOwner = () => (S.handSeat && P(S.handSeat)?.device === 'local' ? S.handSeat : handBase());
const ownedBy = (id) => Object.entries(S.own).filter(([, o]) => o.owner === id).map(([i, o]) => ({ sq: SQUARES[+i], ...o }));

// ---------- elements ----------
const root = $('#root'), logbar = $('#logbar'), logEl = $('#log'), logToggle = $('#logToggle'), logFilters = $('#logFilters');
const rail = $('#rail'), boardCol = $('#boardCol'), stage = $('#boardStage'), turn = $('#turn'), turnInner = $('#turnInner');
const hand = $('#hand'), handTab = $('#handTab'), handPanel = $('#handPanel'), handSide = $('#handSide'), handWrap = $('#handWrap'), handoff = $('#handoff'), announceEl = $('#announce');
logToggle.innerHTML = ICON.chevron;

let board = null;
function announce(msg) { announceEl.textContent = ''; requestAnimationFrame(() => { announceEl.textContent = msg; }); }

// ---------- log ----------
function logLine(e, fresh) {
  const p = P(e.p);
  const parts = e.t.split('{n}').map(esc);
  const html = parts.join(`<b style="color:${TEXT[e.p]}">${esc(p.name)}</b>`);
  return `<div class="log-line${fresh ? ' fresh' : ''}"><span class="dot" style="background:${p.color}" aria-hidden="true"></span><span>${html}</span></div>`;
}
const passes = (e) => S.logFilter === 'all' || (S.logFilter === 'money' ? e.money : e.p === S.logFilter);
function renderLog() {
  logbar.classList.toggle('open', S.logOpen);
  logToggle.setAttribute('aria-expanded', String(S.logOpen));
  logToggle.setAttribute('aria-label', S.logOpen ? 'Collapse game log' : 'Expand game log');
  logFilters.hidden = !S.logOpen;
  // the collapsed log is one line, so it stays out of the tab order (log toggle → Menu → turn → hand)
  logEl.tabIndex = S.logOpen ? 0 : -1;
  const opts = [['all', 'All'], ['money', 'Money'], ...S.players.map((p) => [p.id, p.name])];
  logFilters.innerHTML = opts.map(([v, l]) => {
    const p = P(v);
    return `<button type="button" data-filter="${v}" aria-pressed="${S.logFilter === v}">${p ? `<span class="swatch" style="background:${p.color}"></span>` : ''}${l}</button>`;
  }).join('');
  const items = S.log.filter(passes);
  logEl.innerHTML = items.length ? items.map((e) => logLine(e)).join('') : '<div class="log-empty">No entries for this filter.</div>';
}
function addLog(p, t, money = false) {
  const e = { id: logSeq++, p, t, money };
  S.log.unshift(e);
  if (!passes(e)) return;
  $('.log-empty', logEl)?.remove();
  logEl.insertAdjacentHTML('afterbegin', logLine(e, !reduced()));
  logEl.scrollTop = logEl.scrollHeight;
}
logToggle.addEventListener('click', () => { S.logOpen = !S.logOpen; renderLog(); });
logFilters.addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]');
  if (b) { S.logFilter = b.dataset.filter; renderLog(); logFilters.querySelector(`[data-filter="${S.logFilter}"]`).focus(); }
});

// ---------- player rail ----------
function seatHTML(p) {
  const active = p.id === S.active && !p.bankrupt;
  const states = [];
  if (p.inJail) states.push('in jail');
  if (p.cards) states.push('holds a Get Out of Jail Free card');
  if (p.bankrupt) states.push('bankrupt');
  if (p.device === 'remote') states.push(p.conn);
  const label = `${p.name}, ${p.avatarName}${active ? ', on turn' : ''}${states.length ? ', ' + states.join(', ') : ''}`;
  const status = [];
  if (p.bankrupt) status.push('Bankrupt');
  else {
    if (p.device === 'remote') status.push(`<span class="conn-dot conn-${p.conn}" aria-hidden="true"></span>${{ online: 'Online', reconnecting: 'Reconnecting…', away: 'Away' }[p.conn]}`);
    if (p.inJail) status.push('In jail');
    if (p.cards) status.push(`${p.cards} jail card`);
  }
  return `<div class="seat${active ? ' is-active' : ''}${p.bankrupt ? ' is-bankrupt' : ''}" style="--pc:${p.color}">
    <div class="avatar" role="img" aria-label="${esc(label)}">${avatarSVG(p.avatar)}
      ${p.inJail ? `<span class="badge badge-jail" aria-hidden="true">${ICON.jail}</span>` : ''}
      ${p.cards ? `<span class="badge badge-card" aria-hidden="true">${ICON.card}</span>` : ''}
    </div>
    <div class="seat-text">
      <span class="seat-name"><span>${esc(p.name)}</span>${active ? '<span class="turn-tag">Turn</span>' : ''}</span>
      <span class="seat-cash">${p.bankrupt ? '—' : fmt(p.cash)}</span>
      ${status.length ? `<span class="seat-status">${status.join(' · ')}</span>` : ''}
    </div>
  </div>`;
}
function renderRail() {
  const local = S.players.filter((p) => p.device === 'local'), remote = S.players.filter((p) => p.device === 'remote');
  rail.innerHTML = `
    <div class="seat-group" role="group" aria-label="This device"><div class="seat-group-label">${ICON.device}This device</div><div class="seat-list">${local.map(seatHTML).join('')}</div></div>
    <div class="seat-group" role="group" aria-label="Other devices"><div class="seat-group-label">${ICON.globe}Other devices</div><div class="seat-list">${remote.map(seatHTML).join('')}</div></div>`;
}

// ---------- title deed ----------
function deedHTML(i, { compact = false, current = -1 } = {}) {
  const sq = SQUARES[i];
  const g = sq.group ? GROUPS[sq.group] : null;
  const headStyle = g ? `background:${g.color};color:${DARK_BANDS.has(sq.group) ? '#fff' : '#17211b'}` : 'background:#e9e2cf';
  const row = (l, v, cls = '') => `<div class="r ${cls}"><span>${l}</span><span>${v}</span></div>`;
  let body = '';
  if (sq.kind === 'prop') {
    const r = sq.rents;
    body = row('Rent', fmt(r[0]), 'b' + (current === 0 ? ' cur' : '')) +
      [1, 2, 3, 4].map((h) => row(`With ${h} house${h > 1 ? 's' : ''}`, fmt(r[h]), current === h ? 'cur' : '')).join('') +
      row('With hotel', fmt(r[5]), 'b' + (current === 5 ? ' cur' : '')) +
      (compact ? '' : `<div class="sep"></div>${row('Mortgage value', fmt(sq.mortgage))}${row('House cost', fmt(sq.houseCost))}`);
  } else if (sq.kind === 'rail') {
    body = row('Rent', '$25', 'b') + row('2 stations owned', '$50', current === 2 ? 'cur' : '') + row('3 stations owned', '$100') + row('4 stations owned', '$200') +
      (compact ? '' : `<div class="sep"></div>${row('Mortgage value', fmt(sq.mortgage))}`);
  } else if (sq.kind === 'util') {
    body = row('One utility owned', '4 × dice') + row('Both utilities owned', '10 × dice') + (compact ? '' : `<div class="sep"></div>${row('Mortgage value', fmt(sq.mortgage))}`);
  } else {
    const about = {
      go: 'Collect $200 salary as you pass.', jail: 'In jail, or just visiting.', parking: 'Nothing happens here.', gotojail: 'Go directly to jail. Do not pass Start.',
      chance: 'Draw the top Chance card.', chest: 'Draw the top Community Chest card.', tax: `Pay ${fmt(sq.amount || 0)}.`
    }[sq.kind];
    body = `${SQUARE_ICON[sq.kind] ? `<div class="deed-icon">${SQUARE_ICON[sq.kind]}</div>` : ''}<div class="r" style="justify-content:center;text-align:center">${about}</div>`;
  }
  const kind = sq.price ? 'Title deed' : 'Board square';
  return `<div class="deed${compact ? ' compact' : ''}"><div class="deed-head" style="${headStyle}"><div class="k">${kind}</div><div class="n">${esc(sq.name)}</div></div><div class="deed-body">${body}</div></div>`;
}

// ---------- turn area (board centre) ----------
const diceHTML = (d, cls = '') => `<div class="dice ${cls}" role="img" aria-label="Dice: ${d[0]} and ${d[1]}">${dieSVG(d[0])}${dieSVG(d[1])}</div>`;
const status = (t, sub) => `<p class="status">${t}</p>${sub ? `<p class="status-sub">${sub}</p>` : ''}`;
const amount = (label, value, sub) => `<div class="amount"><span class="label">${label}</span><span class="value">${fmt(value)}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;

function view() {
  const p = P(S.active), c = S.ctx;
  const sq = c.sq != null ? SQUARES[c.sq] : null;
  const tm = [['Trade', () => openTrade()], ['Manage', () => openManage()]];
  switch (S.phase) {
    case 'start': return { content: diceHTML(S.dice, 'dim') + status(`${p.name}'s turn`), primary: ['Roll', roll], secondary: tm };
    case 'rolling': return { content: diceHTML(S.dice, 'rolling') + status('Rolling…') };
    case 'moving': return { content: diceHTML(S.dice) + status(`Moving ${S.dice[0] + S.dice[1]} squares`) };
    case 'buy': return { content: deedHTML(c.sq, { compact: true }) + status(`${sq.name} is for sale`), primary: [`Buy ${fmt(sq.price)}`, buy], secondary: [['Auction', openAuction]] };
    case 'rent': {
      const o = S.own[c.sq];
      return { content: deedHTML(c.sq, { compact: true, current: sq.kind === 'rail' ? 2 : o ? o.houses || 0 : 0 }) + amount(`Rent to ${P(c.owner).name}`, c.amount), primary: [`Pay ${fmt(c.amount)}`, payRent] };
    }
    case 'card': {
      const card = CARDS[c.card];
      return { content: `<div class="reveal ${c.card}${reduced() ? '' : ' flip-in'}" role="group" aria-label="${card.deck} card"><span class="deck">${card.deck}</span><p>${card.text}</p></div>`, primary: ['OK', cardOk] };
    }
    case 'tax': return { content: amount(sq.name, sq.amount, `Cash ${fmt(p.cash)}`), primary: [`Pay ${fmt(sq.amount)}`, payTax] };
    case 'doubles': return { content: diceHTML(S.dice) + status('Doubles!', 'Roll again. Three doubles in a row sends you to jail.'), primary: ['Roll again', roll] };
    case 'jail': return {
      content: diceHTML(S.dice, 'dim') + status('In jail', 'Attempt 1 of 3. Roll doubles, pay $50 or use a card.'),
      primary: ['Roll for doubles', jailRoll],
      secondary: [['Pay $50', payJail], [`Use card${p.cards ? '' : ' (none)'}`, useCard, !p.cards]]
    };
    case 'resolved': return { content: diceHTML(S.dice), primary: ['Next turn', nextTurn], secondary: tm };
    case 'debt': return {
      content: amount(`Rent to ${P(c.owner).name}`, c.amount, `Cash ${fmt(p.cash)} · <span class="short">short ${fmt(Math.max(0, c.amount - p.cash))}</span>`),
      primary: ['Raise cash', () => openManage({ debt: true })], secondary: [['Declare bankruptcy', openBankruptcy, false, 'hf-danger']]
    };
  }
  return { content: '' };
}

let actionsMap = [], lastTurnKey = '', innerSize = [1, 1], lastRect = null;
function renderTurn() {
  const v = view();
  const remote = S.situation === 'remote';
  const p = P(S.active);
  actionsMap = [];
  // the game waits for an away player (gameplay 3.2): nothing plays for them
  const conn = remote ? p.conn : 'online';
  let actions = '';
  if (conn !== 'online') {
    const away = conn === 'away';
    actions = `<p class="deciding"><span class="spinner" aria-hidden="true"></span>${esc(away ? `Waiting for ${p.name} to return` : `${p.name} is reconnecting…`)}</p>
      <p class="wait-line">${esc(away ? `The game continues when ${p.name} returns.` : 'The game continues when the connection returns.')}</p>
      ${S.isOwner && away ? '<p class="wait-line">You can also save or finish the game in the Menu.</p>' : ''}`;
  } else if (v.primary || v.secondary) {
    if (remote) actions = `<p class="deciding"><span class="spinner" aria-hidden="true"></span>${esc(p.name)} is deciding…</p>`;
    else {
      const btn = ([label, fn, disabled, cls], primary) => {
        actionsMap.push(fn);
        return `<button type="button" class="${primary ? 'hf-primary' : 'hf-outline ' + (cls || '')}" data-act="${actionsMap.length - 1}"${disabled ? ' disabled' : ''}>${label}</button>`;
      };
      actions = `<div class="actions">${v.primary ? btn(v.primary, true) : ''}${(v.secondary || []).map((s) => btn(s, false)).join('')}</div>`;
    }
  }
  const tag = remote ? `<span class="watch-tag">${conn === 'away' ? 'Away' : 'Watching'} · ${esc(p.name)} plays on their device</span>` : '';
  let html = tag + v.content + actions;
  // the saved notice replaces the turn on every device (gameplay 3.1)
  if (S.sessionNotice === 'saved') {
    actionsMap = [() => restart()];
    html = `<h2 class="notice-title">${S.isOwner ? 'Game saved' : 'Game saved by Marlow'}</h2>
      <p class="wait-line">${S.isOwner ? 'You can continue it from your saved games.' : 'Marlow can continue it later. You will find it in My games.'}</p>
      <div class="actions"><button type="button" class="hf-primary" data-act="0">OK</button></div>`;
  }
  const key = S.phase + S.situation + S.active + conn + S.sessionNotice;
  const hadFocus = turnInner.contains(document.activeElement);
  if (html !== turnInner.innerHTML) {
    turnInner.innerHTML = html;
    if (key !== lastTurnKey && !reduced()) { turnInner.classList.remove('swap'); void turnInner.offsetWidth; turnInner.classList.add('swap'); }
  }
  lastTurnKey = key;
  if (hadFocus || S.focusTurn) { $('button:not([disabled])', turnInner)?.focus(); S.focusTurn = false; }
  measureTurn();
}
turnInner.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b) { S.focusTurn = true; actionsMap[+b.dataset.act](); }
});
function measureTurn() { innerSize = [turnInner.offsetWidth, turnInner.offsetHeight]; placeTurn(lastRect); }
new ResizeObserver(measureTurn).observe(turnInner);
// keep the turn area centred on the board's centre field and scaled to fit inside it
function placeTurn(r) {
  if (!r) r = { x: boardCol.clientWidth / 2, y: boardCol.clientHeight / 2, half: Math.min(boardCol.clientWidth, boardCol.clientHeight) * 0.34 };
  lastRect = r;
  const s = Math.max(0.42, Math.min(1, (2 * r.half * 0.94) / Math.max(innerSize[0], innerSize[1], 1)));
  turn.style.left = r.x + 'px';
  turn.style.top = r.y + 'px';
  turnInner.style.transform = `scale(${s.toFixed(3)}) translate(-50%, -50%)`;
}
new ResizeObserver(() => { if (!board) placeTurn(null); }).observe(boardCol);

// ---------- hand (4.6, redesigned for BUG-8, BUG-11, BUG-12) ----------
// One grid with a column per group in both states. Collapsed: compact cards overlap downward, so the
// colour band, name and price of every card show. Expanded: the same columns without overlap, a
// side column with the owner, the seat switcher, the actions of the selected card and the debt bar.
// There is no header and there are no group labels: the tab above the hand is the keyboard entry.
let handMode = 'closed'; // closed | hover | pinned
let handSel = null;      // square index of the selected card
let handTimer = 0, debtShown = false;
const handOpen = () => handMode !== 'closed';
function setHandMode(m) {
  if (m === handMode) return;
  handMode = m;
  if (m === 'closed') handSel = null;
  applyHandMode();
  renderHandSide();
}
function applyHandMode() {
  const open = handOpen();
  handWrap.dataset.open = String(open);
  handWrap.dataset.pinned = String(handMode === 'pinned');
  handTab.setAttribute('aria-expanded', String(open));
  // the compact cards are a peek only: they are not in the tab order until the panel is open
  hand.querySelectorAll('.card').forEach((c) => { c.tabIndex = open ? 0 : -1; });
}
const ownerOwes = () => S.phase === 'debt' && S.situation === 'local' && handOwner() === S.active;
function allowedWindow(owner) {
  return S.situation === 'local' && S.active === owner.id && ['start', 'doubles', 'resolved', 'debt'].includes(S.phase);
}
function cardActions(owner, o) {
  const g = GROUPS[o.sq.group], mates = ownedBy(owner.id).filter((x) => x.sq.group === o.sq.group);
  const street = o.sq.group !== 'station' && o.sq.group !== 'utility';
  const h = o.houses || 0, debt = ownerOwes();
  const win = allowedWindow(owner);
  const out = [];
  if (street) {
    let why = '';
    if (!win) why = 'Not in this phase';
    else if (debt) why = 'Not while you owe money';
    else if (mates.length < g.size) why = `Needs the full ${g.name} set`;
    else if (mates.some((x) => x.mortgaged)) why = 'Unmortgage the set first';
    else if (h >= 5) why = 'Already a hotel';
    else if (owner.cash < o.sq.houseCost) why = 'Not enough cash';
    out.push({ a: 'build', label: h === 4 ? `Hotel ${fmt(o.sq.houseCost)}` : `Build ${fmt(o.sq.houseCost)}`, why });
    out.push({ a: 'sell', label: `Sell +${fmt(o.sq.houseCost / 2)}`, why: !win ? 'Not in this phase' : h === 0 ? 'No buildings' : '' });
  }
  const half = o.sq.price / 2;
  let why = '';
  if (!win) why = 'Not in this phase';
  else if (!o.mortgaged && mates.some((x) => (x.houses || 0) > 0)) why = 'Sell the buildings first';
  else if (o.mortgaged && owner.cash < Math.round(half * 1.1)) why = 'Not enough cash';
  out.push({ a: 'mort', label: o.mortgaged ? `Unmortgage ${fmt(Math.round(half * 1.1))}` : `Mortgage +${fmt(half)}`, why });
  return out;
}
function renderHandSide() {
  const owner = P(handOwner());
  const props = ownedBy(owner.id);
  const value = props.reduce((s, o) => s + o.sq.price, 0);
  const locals = S.players.filter((p) => p.device === 'local' && !p.bankrupt);
  const sel = handSel != null ? props.find((o) => o.sq.i === handSel) : null;
  const remote = S.situation === 'local' ? '' : ' (this device)';
  handSide.innerHTML = `
    <div class="side-owner">
      <span class="avatar sm" style="--pc:${owner.color}">${avatarSVG(owner.avatar, 20)}</span>
      <div><p class="side-name">${esc(owner.name)}${remote}</p><p class="side-sub">${props.length} ${props.length === 1 ? 'property' : 'properties'} · ${fmt(value)}</p></div>
    </div>
    ${locals.length > 1 ? `<div class="seats" role="group" aria-label="Show the properties of">${locals.map((p) => `<button type="button" class="seat-pick" data-seat="${p.id}" aria-pressed="${p.id === owner.id}" style="--pc:${p.color}" aria-label="${esc(p.name)}">${esc(p.name)}</button>`).join('')}</div>` : ''}
    <div class="sel" aria-live="polite">${sel ? `
      <p class="sel-name">${esc(sel.sq.name)}</p>
      <p class="sel-sub">${fmt(sel.sq.price)}${sel.mortgaged ? ' · mortgaged' : (sel.houses ? ` · ${sel.houses === 5 ? 'hotel' : sel.houses + ' house' + (sel.houses > 1 ? 's' : '')}` : '')}</p>
      <div class="sel-actions">${cardActions(owner, sel).map((x) => `<button type="button" class="hf-outline" data-act="${x.a}" ${x.why ? 'disabled' : ''} ${x.why ? `aria-describedby="why-${x.a}"` : ''}>${x.label}</button>${x.why ? `<span class="why" id="why-${x.a}">${x.why}</span>` : ''}`).join('')}
        <button type="button" class="hf-outline" data-act="deed">Title deed</button></div>` : '<p class="sel-empty">Select a card to build, mortgage or see its title deed.</p>'}</div>`;
}
function renderHand() {
  const owner = P(handOwner());
  const props = ownedBy(owner.id);
  const owes = ownerOwes();
  const stacks = [];
  for (const gid of GROUP_ORDER) {
    const cards = props.filter((o) => o.sq.group === gid).sort((a, b) => a.sq.i - b.sq.i);
    if (!cards.length) continue;
    const g = GROUPS[gid];
    stacks.push({ label: g.name, complete: cards.length === g.size, color: g.color, cards: cards.map((o) => ({ ...o, name: o.sq.name, price: fmt(o.sq.price) })) });
  }
  if (owner.cards) stacks.push({ label: 'Cards', jail: true, cards: Array.from({ length: owner.cards }, () => ({ name: 'Get out of jail free', price: 'Keep' })) });
  const total = props.reduce((s, o) => s + o.sq.price, 0);
  handWrap.style.setProperty('--first-n', String(stacks[0]?.cards.length ?? 1));
  handTab.innerHTML = `<span class="avatar sm" style="--pc:${owner.color}">${avatarSVG(owner.avatar, 20)}</span><span class="tab-count">${props.length}</span><span class="tab-chev" aria-hidden="true">${ICON.chevron}</span>`;
  handTab.setAttribute('aria-label', `${owner.name}'s properties, ${props.length}, ${fmt(total)}. ${handOpen() ? 'Collapse' : 'Expand'}`);
  hand.innerHTML = stacks.length ? stacks.map((s) => {
    const n = s.cards.length;
    return `<div class="col" style="--n:${n}" role="group" aria-label="${s.label}${n > 1 ? ', ' + n + ' cards' : ''}${s.complete ? ', set complete' : ''}">
      ${s.cards.map((k, i) => {
        const h = k.houses || 0;
        const pips = h === 5 ? ICON.hotel : ICON.house.repeat(h);
        const desc = `${k.name}, ${k.price}${h === 5 ? ', hotel' : h ? `, ${h} house${h > 1 ? 's' : ''}` : ''}${k.mortgaged ? ', mortgaged' : ''}${s.complete ? ', set complete' : ''}`;
        return `<button type="button" class="card${k.mortgaged ? ' mortgaged' : ''}${s.jail ? ' jailcard' : ''}${k.sq && k.sq.i === handSel ? ' selected' : ''}" style="--i:${i}" ${k.sq ? `data-sq="${k.sq.i}"` : 'data-jailcard="1"'} aria-label="${esc(desc)}" aria-pressed="${!!(k.sq && k.sq.i === handSel)}">
          <span class="band" style="${s.jail ? '' : `background:${s.color}`}">${s.complete ? `<span class="set" title="Set complete">${ICON.tick}</span>` : ''}</span>
          <span class="row"><span class="nm">${esc(k.name)}</span><span class="pr">${k.price}</span></span>
          <span class="pips">${k.mortgaged ? '<span class="mtag">Mortgaged</span>' : pips}</span>
        </button>`;
      }).join('')}
    </div>`;
  }).join('') : '<p class="muted none">No properties yet.</p>';
  // a debt opens the panel by itself, once
  if (owes && !debtShown) { debtShown = true; handMode = 'pinned'; }
  if (!owes) debtShown = false;
  applyHandMode();
  renderHandSide();
}
// open on hover (about 150ms), close about 300ms after the pointer leaves; a click pins it; Esc closes
handWrap.addEventListener('pointerenter', (e) => {
  if (e.pointerType === 'touch') return;
  clearTimeout(handTimer);
  if (handMode === 'closed') handTimer = setTimeout(() => setHandMode('hover'), 150);
});
handWrap.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'touch') return;
  clearTimeout(handTimer);
  if (handMode === 'hover') handTimer = setTimeout(() => setHandMode('closed'), 300);
});
handWrap.addEventListener('focusin', () => { if (handMode === 'closed' && !handTab.matches(':focus')) setHandMode('hover'); });
handWrap.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && handOpen()) { e.stopPropagation(); setHandMode('closed'); handTab.focus(); }
});
handTab.addEventListener('click', () => setHandMode(handMode === 'pinned' ? 'closed' : 'pinned'));
hand.addEventListener('click', (e) => {
  const b = e.target.closest('.card');
  if (!b) return;
  if (!handOpen() || handMode === 'hover') { handMode = 'pinned'; applyHandMode(); }
  if (b.dataset.sq) handSel = +b.dataset.sq === handSel ? null : +b.dataset.sq;
  else { handSel = null; dialog({ title: 'Get out of jail free', narrow: true, body: '<p class="muted">Keep this card until needed, or trade it. Use it from the jail options at the start of a turn in jail.</p>', actions: [{ label: 'Close', primary: true }] }); }
  hand.querySelectorAll('.card').forEach((c) => { const on = !!c.dataset.sq && +c.dataset.sq === handSel; c.classList.toggle('selected', on); c.setAttribute('aria-pressed', String(on)); });
  renderHandSide();
});
handSide.addEventListener('click', (e) => {
  const seat = e.target.closest('[data-seat]');
  if (seat) { S.handSeat = seat.dataset.seat; handSel = null; render(); return; }
  const b = e.target.closest('[data-act]');
  if (!b || handSel == null) return;
  const owner = P(handOwner()), o = S.own[handSel], sq = SQUARES[handSel];
  if (b.dataset.act === 'deed') { openSquare(handSel); return; }
  if (b.dataset.act === 'build') { o.houses = (o.houses || 0) + 1; owner.cash -= sq.houseCost; addLog(owner.id, `{n} built on ${sq.name}.`, true); }
  if (b.dataset.act === 'sell') { o.houses -= 1; owner.cash += sq.houseCost / 2; addLog(owner.id, `{n} sold a building on ${sq.name}.`, true); }
  if (b.dataset.act === 'mort') {
    if (o.mortgaged) { o.mortgaged = false; owner.cash -= Math.round(sq.price / 2 * 1.1); addLog(owner.id, `{n} unmortgaged ${sq.name}.`, true); }
    else { o.mortgaged = true; owner.cash += sq.price / 2; addLog(owner.id, `{n} mortgaged ${sq.name}.`, true); }
  }
  board?.setOwnership(S.own);
  render();
});

// ---------- handoff ----------
let disposeStage = null;
async function renderHandoff() {
  const show = S.situation === 'handoff';
  const wasShown = !handoff.hidden;
  handoff.hidden = !show;
  root.inert = show;
  if (!show) { disposeStage?.(); disposeStage = null; return; }
  const p = P(S.active);
  $('#handoffTitle').textContent = `Pass to ${p.name}`;
  $('#handoffSub').textContent = `It's ${p.name}'s turn on this device. Hand it over: ${p.name}'s properties and actions stay hidden until they confirm.`;
  const go = $('#handoffGo');
  go.textContent = `I'm ${p.name}, start my turn`;
  if (!wasShown || handoff.dataset.player !== p.id) {
    handoff.dataset.player = p.id;
    go.focus();
    disposeStage?.(); disposeStage = null;
    try {
      const m = await import('./board3d.js');
      if (S.situation === 'handoff' && S.active === p.id) disposeStage = m.createAvatarStage($('#handoffStage'), p, reduced);
    } catch (err) { $('#handoffStage').innerHTML = `<div class="avatar" style="--pc:${p.color};width:160px;height:160px;margin:60px auto">${avatarSVG(p.avatar, 110)}</div>`; }
  }
}
$('#handoffGo').addEventListener('click', () => { S.situation = 'local'; S.lastLocal = S.active; S.focusTurn = true; render(); });

// ---------- render ----------
function render() {
  $('#round').textContent = `Round ${S.round}`;
  renderRail();
  renderTurn();
  renderHand();
  renderHandoff();
  renderConnBanner();
  renderProto();
  renderDebug();
  scheduleAuto();
}

// the connection of this device, not of other players (design board "Away and connection")
function renderConnBanner() {
  const el = $('#connBanner');
  const text = { reconnecting: '<b>Reconnecting…</b> Your moves wait until the connection returns.', closed: '<b>Connection closed.</b> Reload the page to return to the game.' }[S.deviceConn];
  el.hidden = !text;
  el.className = `conn-banner conn-banner-${S.deviceConn}`;
  el.innerHTML = text ? `<span class="conn-dot conn-${S.deviceConn === 'closed' ? 'away' : 'reconnecting'}" aria-hidden="true"></span><span>${text}</span>` : '';
}

// ---------- scripted turn flow ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let diceTimer = null;
function tumble(on) {
  clearInterval(diceTimer);
  if (!on || reduced()) return;
  diceTimer = setInterval(() => {
    const d = $('.dice', turnInner);
    if (d) d.innerHTML = dieSVG(1 + Math.floor(Math.random() * 6)) + dieSVG(1 + Math.floor(Math.random() * 6));
  }, 90);
}
function scriptedRoll() {
  const t = SCRIPT[S.turnIdx];
  const p = P(S.active);
  if (S.scripted && t && t.player === S.active) return t.rolls[Math.min(S.rollIdx, t.rolls.length - 1)];
  return { dice: [2, 3], to: (p.pos + 5) % 40, land: 'none' };
}
async function roll() {
  const r = scriptedRoll(), p = P(S.active);
  S.phase = 'rolling'; S.ctx = { ...r, sq: r.to };
  render(); tumble(true);
  await sleep(reduced() ? 0 : 900);
  tumble(false);
  S.dice = r.dice;
  const sq = SQUARES[r.to];
  addLog(p.id, `{n} rolled ${r.dice[0]} and ${r.dice[1]}${r.dice[0] === r.dice[1] ? ' (doubles)' : ''} and landed on ${sq.name}.`);
  S.phase = 'moving'; render();
  const path = [];
  for (let i = p.pos; i !== r.to;) { i = (i + 1) % 40; path.push(i); }
  if (board) await board.moveToken(p.id, path);
  p.pos = r.to;
  if (r.passGo) { p.cash += 200; addLog(p.id, '{n} collected $200 passing Start.', true); }
  if (r.land === 'none') afterLanding(); else { S.phase = r.land; render(); }
}
function afterLanding() {
  if (S.ctx.doubles) { S.rollIdx++; S.phase = 'doubles'; } else S.phase = 'resolved';
  render();
}
function buy() {
  const p = P(S.active), sq = SQUARES[S.ctx.sq];
  S.own[sq.i] = { owner: p.id };
  p.cash -= sq.price;
  addLog(p.id, `{n} bought ${sq.name} for ${fmt(sq.price)}.`, true);
  board?.setOwnership(S.own);
  afterLanding();
}
function payRent() {
  const p = P(S.active), to = P(S.ctx.owner);
  p.cash -= S.ctx.amount; to.cash += S.ctx.amount;
  addLog(p.id, `{n} paid ${fmt(S.ctx.amount)} rent to ${to.name}.`, true);
  afterLanding();
}
function payTax() {
  const p = P(S.active), sq = SQUARES[S.ctx.sq];
  p.cash -= sq.amount;
  addLog(p.id, `{n} paid ${fmt(sq.amount)} ${sq.name}.`, true);
  afterLanding();
}
function cardOk() {
  const p = P(S.active), card = CARDS[S.ctx.card];
  p.cash += card.amount;
  addLog(p.id, `{n} drew ${card.deck}: ${card.amount < 0 ? 'paid' : 'collected'} ${fmt(Math.abs(card.amount))}.`, true);
  afterLanding();
}
async function jailRoll() {
  S.phase = 'rolling'; render(); tumble(true);
  await sleep(reduced() ? 0 : 900);
  tumble(false);
  S.dice = [2, 5];
  addLog(S.active, '{n} rolled 2 and 5 in jail. No doubles.');
  S.phase = 'resolved'; render();
}
function payJail() {
  const p = P(S.active);
  p.cash -= 50; p.inJail = false;
  addLog(p.id, '{n} paid $50 to leave jail.', true);
  S.phase = 'start'; render();
}
function useCard() {
  const p = P(S.active);
  p.cards -= 1; p.inJail = false;
  addLog(p.id, '{n} used a Get Out of Jail Free card.');
  S.phase = 'start'; render();
}
// The turn toast (BUG-15, prototype): a notice that closes by itself after 5 seconds.
let toastTimer = 0;
function showToast(text) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(text)}</span><button type="button" class="toast-close" aria-label="Close notice">×</button>`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
  el.querySelector('.toast-close').addEventListener('click', () => { el.hidden = true; clearTimeout(toastTimer); });
}
function nextTurn() {
  const prev = S.active;
  const order = PLAYERS.map((p) => p.id);
  let guard = 0;
  do { S.turnIdx = (S.turnIdx + 1) % SCRIPT.length; } while (P(SCRIPT[S.turnIdx].player).bankrupt && guard++ < SCRIPT.length);
  const next = SCRIPT[S.turnIdx].player;
  if (order.indexOf(next) <= order.indexOf(prev)) S.round++;
  enterTurn(next, true);
  showToast(`It is ${P(next).name}'s turn.`);
}
function enterTurn(id, scripted) {
  const p = P(id);
  S.active = id; S.rollIdx = 0; S.scripted = scripted; S.ctx = {};
  S.phase = p.inJail ? 'jail' : 'start';
  if (p.device === 'local') {
    S.situation = id === S.lastLocal ? 'local' : 'handoff';
  } else S.situation = 'remote';
  S.focusTurn = true;
  announce(p.device === 'local' ? `${p.name}'s turn.` : `${p.name}'s turn on another device.`);
  render();
}
// a remote player's turn plays itself, one scripted action at a time
let autoTimer = null;
function scheduleAuto() {
  clearTimeout(autoTimer);
  if (S.situation !== 'remote' || !S.scripted || $('dialog[open]') || S.sessionNotice || P(S.active).conn !== 'online') return;
  const act = { jail: payJail, start: roll, buy, rent: payRent, card: cardOk, tax: payTax, doubles: roll, resolved: nextTurn }[S.phase];
  if (act) autoTimer = setTimeout(act, S.phase === 'resolved' ? 1800 : 1500);
}

// ---------- dialogs ----------
function dialog({ title, body = '', actions = [], narrow = false, onClose }) {
  const d = document.createElement('dialog');
  d.className = 'dlg' + (narrow ? ' narrow' : '');
  const hid = 'dlg-' + dlgSeq++;
  d.setAttribute('aria-labelledby', hid);
  d.innerHTML = `<div class="dlg-inner"><header class="dlg-head"><h2 id="${hid}">${title}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${ICON.close}</button></header><div class="dlg-body">${body}</div><footer class="dlg-actions"></footer></div>`;
  const setActions = (list) => {
    const f = $('.dlg-actions', d);
    f.innerHTML = '';
    for (const a of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = a.primary ? 'hf-primary' : a.danger ? 'hf-outline hf-danger' : 'hf-outline';
      b.textContent = a.label;
      b.disabled = !!a.disabled;
      b.addEventListener('click', () => { if (!a.onClick || a.onClick() !== false) d.close(); });
      f.appendChild(b);
    }
  };
  setActions(actions);
  d.querySelector('[data-close]').addEventListener('click', () => d.close());
  d.addEventListener('close', () => { d.remove(); onClose?.(); scheduleAuto(); });
  document.body.appendChild(d);
  clearTimeout(autoTimer);
  d.showModal();
  d.body = $('.dlg-body', d);
  d.setActions = setActions;
  return d;
}

function openSquare(i) {
  const sq = SQUARES[i], o = S.own[i];
  const here = S.players.filter((p) => p.pos === i && !p.bankrupt).map((p) => p.name);
  let owner = '';
  if (sq.price) {
    if (o) {
      const h = o.houses || 0;
      owner = `Owned by <b style="color:${TEXT[o.owner]}">${P(o.owner).name}</b>${h === 5 ? ' · hotel' : h ? ` · ${h} house${h > 1 ? 's' : ''}` : ''}${o.mortgaged ? ' · mortgaged' : ''}`;
    } else owner = `Unowned · ${fmt(sq.price)}`;
  }
  dialog({
    title: sq.name, narrow: true,
    body: `<div style="display:flex;justify-content:center">${deedHTML(i)}</div>${owner ? `<p class="muted" style="text-align:center">${owner}</p>` : ''}${here.length ? `<p class="muted" style="text-align:center">Here now: ${here.join(', ')}</p>` : ''}`,
    actions: [{ label: 'Close', primary: true }]
  });
}

function openAuction() {
  const sq = SQUARES[S.ctx.sq], me = P(S.active);
  const bidders = S.players.filter((p) => !p.bankrupt);
  let bid = 10, leader = null, secs = 10, timer = null;
  const passed = new Set();
  const d = dialog({ title: `Auction: ${sq.name}`, onClose: () => clearInterval(timer) });
  const draw = () => {
    const done = secs <= 0;
    const C = 2 * Math.PI * 28;
    d.body.innerHTML = `<div class="auction">
      ${deedHTML(sq.i, { compact: true })}
      <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
        <div class="bid-now">
          <div><div class="muted">${done ? 'Sold for' : 'Current bid'}</div><div class="bid-amount">${fmt(bid)}</div><div class="muted">${leader ? (done ? 'to ' : 'by ') + `<b style="color:${TEXT[leader]}">${P(leader).name}</b>` : 'No bids yet'}</div></div>
          <div class="timer" role="timer" aria-label="${secs} seconds left"><svg width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="28" stroke="#2c4254" stroke-width="5" fill="none"/><circle cx="32" cy="32" r="28" stroke="#e2574c" stroke-width="5" fill="none" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - secs / 10)}" stroke-linecap="round"/></svg><span>${Math.max(0, secs)}s</span></div>
        </div>
        <div class="bidders">${bidders.map((p) => `<div class="bidder${leader === p.id ? ' lead' : ''}"><span class="mini-av" style="--pc:${p.color}">${avatarSVG(p.avatar, 18)}</span>${p.name}${p.device === 'remote' ? ' <span class="muted">· own device</span>' : ''}<span class="st">${leader === p.id ? 'Leading' : passed.has(p.id) ? 'Passed' : 'In'}</span></div>`).join('')}</div>
        ${done ? '' : `<div class="bid-btns" role="group" aria-label="Bid as ${me.name}">${[10, 50, 100].map((n) => `<button type="button" data-bid="${n}">+ ${fmt(n)}</button>`).join('')}</div>`}
      </div></div>
      <p class="muted">Prototype: bids from other players arrive on a fixed script; the timer resets on every bid.</p>`;
    d.setActions(done
      ? [{ label: 'OK', primary: true, onClick: () => { finish(); } }]
      : [{ label: `Pass`, onClick: () => { passed.add(me.id); draw(); return false; } }]);
  };
  const finish = () => {
    clearInterval(timer);
    const w = P(leader || 'ravi');
    S.own[sq.i] = { owner: w.id };
    w.cash -= bid;
    addLog(w.id, `{n} won ${sq.name} at auction for ${fmt(bid)}.`, true);
    board?.setOwnership(S.own);
    afterLanding();
  };
  d.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bid]');
    if (!b) return;
    bid += +b.dataset.bid; leader = me.id; secs = 10; draw();
    // a scripted counter-bid from a remote player
    setTimeout(() => { if (secs > 3 && leader === me.id && d.open) { bid += 10; leader = 'ravi'; secs = 10; draw(); } }, 1600);
  });
  // opening bid from the script
  setTimeout(() => { if (d.open && !leader) { bid = 60; leader = 'ines'; secs = 10; draw(); } }, 900);
  timer = setInterval(() => { secs--; draw(); if (secs <= 0) clearInterval(timer); }, 1000);
  draw();
}

function openTrade(incoming = false) {
  const me = P(handOwner());
  const others = S.players.filter((p) => p.id !== me.id && !p.bankrupt);
  let partner = incoming ? P('ravi') : others[0];
  const give = new Set(), get = new Set();
  let giveCash = 0, getCash = 0, sent = false;
  if (incoming) { give.add(21); get.add(28); getCash = 100; }
  const d = dialog({ title: incoming ? `Trade offer from ${partner.name}` : 'Propose a trade' });
  const chips = (p, set, side) => {
    const list = ownedBy(p.id).sort((a, b) => a.sq.i - b.sq.i);
    if (!list.length) return '<p class="muted">No properties.</p>';
    return `<div class="chips">${list.map((o) => `<button type="button" class="chip" data-side="${side}" data-sq="${o.sq.i}" aria-pressed="${set.has(o.sq.i)}"${incoming ? ' disabled' : ''}><span class="sw" style="background:${GROUPS[o.sq.group].color}"></span><span class="grow">${esc(o.sq.name)}${o.houses ? ` · ${o.houses === 5 ? 'hotel' : o.houses + 'h'}` : ''}${o.mortgaged ? ' · mortgaged' : ''}</span>${fmt(o.sq.price)}</button>`).join('')}</div>`;
  };
  const cash = (side, v) => `<div class="stepper" role="group" aria-label="Cash"><button type="button" data-cash="${side}" data-d="-50" aria-label="Less cash"${incoming ? ' disabled' : ''}>${ICON.minus}</button><output>${fmt(v)}</output><button type="button" data-cash="${side}" data-d="50" aria-label="More cash"${incoming ? ' disabled' : ''}>${ICON.plus}</button></div>`;
  const list = (set) => [...set].map((i) => SQUARES[i].name).join(', ');
  const draw = () => {
    if (sent) {
      const local = partner.device === 'local';
      d.body.innerHTML = `<div class="summary">${esc(me.name)} offers ${list(give) || 'nothing'}${giveCash ? ` + ${fmt(giveCash)}` : ''} for ${list(get) || 'nothing'}${getCash ? ` + ${fmt(getCash)}` : ''}.</div>
        <p class="deciding" style="color:var(--ink)"><span class="spinner" style="border-color:rgba(233,240,234,.25);border-top-color:var(--ink)" aria-hidden="true"></span>${local ? `Pass the device to ${esc(partner.name)} to review the offer.` : `Waiting for ${esc(partner.name)} to answer on their own device…`}</p>`;
      d.setActions([{ label: 'Withdraw offer', danger: true, onClick: () => addLog(me.id, `{n} withdrew a trade offer to ${partner.name}.`) }, { label: 'Close', primary: true }]);
      return;
    }
    d.body.innerHTML = `${incoming ? '' : `<div class="seg" role="group" aria-label="Trade with">${others.map((p) => `<button type="button" data-partner="${p.id}" aria-pressed="${p.id === partner.id}">${p.name}</button>`).join('')}</div>`}
      <div class="cols">
        <section class="panel"><h3><span class="mini-av" style="--pc:${me.color}">${avatarSVG(me.avatar, 18)}</span>${esc(me.name)} gives</h3>${chips(me, give, 'give')}${cash('give', giveCash)}</section>
        <section class="panel"><h3><span class="mini-av" style="--pc:${partner.color}">${avatarSVG(partner.avatar, 18)}</span>${esc(partner.name)} gives</h3>${chips(partner, get, 'get')}${cash('get', getCash)}</section>
      </div>
      <div class="summary">${esc(me.name)} gives ${give.size} propert${give.size === 1 ? 'y' : 'ies'}${giveCash ? ` + ${fmt(giveCash)}` : ''} · gets ${get.size} propert${get.size === 1 ? 'y' : 'ies'}${getCash ? ` + ${fmt(getCash)}` : ''}</div>`;
    d.setActions(incoming
      ? [
          { label: 'Decline', danger: true, onClick: () => addLog(me.id, `{n} declined ${partner.name}'s trade.`) },
          { label: 'Counter', onClick: () => { d.close(); openTrade(false); } },
          { label: 'Accept', primary: true, onClick: () => {
            S.own[21] = { ...S.own[21], owner: 'ravi' }; S.own[28] = { ...S.own[28], owner: me.id };
            me.cash += getCash; partner.cash -= getCash;
            addLog(me.id, `{n} traded Beacon Hill to ${partner.name} for Waterworks + ${fmt(getCash)}.`, true);
            board?.setOwnership(S.own); render();
          } }
        ]
      : [{ label: 'Cancel' }, { label: 'Propose', primary: true, disabled: !give.size && !get.size && !giveCash && !getCash, onClick: () => { sent = true; addLog(me.id, `{n} proposed a trade to ${partner.name}.`); draw(); return false; } }]);
  };
  d.body.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.partner) { partner = P(t.dataset.partner); get.clear(); getCash = 0; }
    else if (t.dataset.sq) { const set = t.dataset.side === 'give' ? give : get, i = +t.dataset.sq; set.has(i) ? set.delete(i) : set.add(i); }
    else if (t.dataset.cash) { const dv = +t.dataset.d; if (t.dataset.cash === 'give') giveCash = Math.max(0, giveCash + dv); else getCash = Math.max(0, getCash + dv); }
    else return;
    const sel = t.dataset.partner ? `[data-partner="${t.dataset.partner}"]` : t.dataset.sq ? `[data-sq="${t.dataset.sq}"][data-side="${t.dataset.side}"]` : `[data-cash="${t.dataset.cash}"][data-d="${t.dataset.d}"]`;
    draw();
    $(sel, d.body)?.focus();
  });
  draw();
}

function openManage({ debt = false } = {}) {
  const me = P(debt ? S.active : handOwner());
  const need = debt ? S.ctx.amount - me.cash : 0;
  let raised = 0;
  const d = dialog({ title: `Manage properties · ${me.name}` });
  const draw = () => {
    const groups = GROUP_ORDER.map((gid) => [gid, ownedBy(me.id).filter((o) => o.sq.group === gid).sort((a, b) => a.sq.i - b.sq.i)]).filter(([, l]) => l.length);
    d.body.innerHTML = `${debt ? `<div class="banner">${raised >= need ? `Enough cash raised. Pay ${fmt(S.ctx.amount)} to ${P(S.ctx.owner).name}.` : `Raise ${fmt(need - raised)} more to pay ${P(S.ctx.owner).name}. Sell buildings first, then mortgage.`}</div>` : ''}
      <p class="muted">Cash ${fmt(me.cash)}. Prototype: buttons change the display only; building and mortgage rules are not enforced.</p>
      ${groups.length ? groups.map(([gid, list]) => `<section class="manage-group"><h3>${GROUPS[gid].name}${list.length === GROUPS[gid].size ? `<span class="set" style="color:#3ccf7a;display:inline-flex">${ICON.tick}</span> Set complete` : ''}</h3>
        ${list.map((o) => {
          const h = o.houses || 0, street = o.sq.kind === 'prop';
          return `<div class="mrow${o.mortgaged ? ' is-mortgaged' : ''}">
            <span class="sw" style="background:${GROUPS[gid].color}"></span>
            <span class="nm">${esc(o.sq.name)}<small>${o.mortgaged ? `Mortgaged · unmortgage ${fmt(Math.round(o.sq.mortgage * 1.1))}` : street ? `House ${fmt(o.sq.houseCost)} · sells ${fmt(o.sq.houseCost / 2)}` : `Mortgage value ${fmt(o.sq.mortgage)}`}</small></span>
            <span class="hs" aria-label="${h === 5 ? 'Hotel' : h + ' houses'}">${h === 5 ? ICON.hotel : ICON.house.repeat(h)}</span>
            <span class="btns">
              ${street ? `<button type="button" data-a="build" data-sq="${o.sq.i}"${o.mortgaged || h >= 5 || debt ? ' disabled' : ''}>${h === 4 ? 'Hotel' : 'Build'}</button><button type="button" data-a="sell" data-sq="${o.sq.i}"${h === 0 ? ' disabled' : ''}>Sell</button>` : ''}
              <button type="button" data-a="mort" data-sq="${o.sq.i}"${h > 0 || (debt && o.mortgaged) ? ' disabled' : ''}>${o.mortgaged ? 'Unmortgage' : 'Mortgage'}</button>
            </span></div>`;
        }).join('')}</section>`).join('') : '<p class="muted">No properties to manage.</p>'}`;
    d.setActions(debt
      ? [{ label: 'Declare bankruptcy', danger: true, onClick: () => { setTimeout(openBankruptcy); } }, { label: `Pay ${fmt(S.ctx.amount)}`, primary: true, disabled: raised < need, onClick: () => payRent() }]
      : [{ label: 'Done', primary: true }]);
  };
  d.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const i = +b.dataset.sq, o = S.own[i], sq = SQUARES[i];
    if (b.dataset.a === 'build') { o.houses = (o.houses || 0) + 1; me.cash -= sq.houseCost; addLog(me.id, `{n} built ${o.houses === 5 ? 'a hotel' : 'a house'} on ${sq.name}.`, true); }
    if (b.dataset.a === 'sell') { o.houses -= 1; me.cash += sq.houseCost / 2; raised += sq.houseCost / 2; addLog(me.id, `{n} sold a building on ${sq.name}.`, true); }
    if (b.dataset.a === 'mort') {
      if (o.mortgaged) { o.mortgaged = false; me.cash -= Math.round(sq.mortgage * 1.1); addLog(me.id, `{n} unmortgaged ${sq.name}.`, true); }
      else { o.mortgaged = true; me.cash += sq.mortgage; raised += sq.mortgage; addLog(me.id, `{n} mortgaged ${sq.name} for ${fmt(sq.mortgage)}.`, true); }
    }
    board?.setOwnership(S.own);
    render();
    draw();
    $(`[data-a="${b.dataset.a}"][data-sq="${i}"]`, d.body)?.focus();
  });
  draw();
}

// Resigning (gameplay Q16): one local player at a time, a bankruptcy to the bank or to the player they owe.
function openLeave() {
  const locals = S.players.filter((p) => p.device === 'local' && !p.bankrupt);
  let pick = locals.length === 1 ? locals[0].id : null;
  const d = dialog({ title: 'Leave game?', narrow: true });
  const draw = () => {
    const chooser = locals.length > 1
      ? `<p class="muted">Choose who resigns. The other players on this device stay in the game.</p>
        <div class="chips" role="group" aria-label="Player who resigns">${locals.map((p) => `<button type="button" class="chip" data-who="${p.id}" aria-pressed="${pick === p.id}"><span class="mini-av" style="--pc:${p.color}">${avatarSVG(p.avatar, 18)}</span><span class="grow">${esc(p.name)}</span></button>`).join('')}</div>`
      : '';
    d.body.innerHTML = `${chooser}
      <div class="summary">${pick ? esc(P(pick).name) : 'The player'} resigns. Their properties go to the player they owe, or to the bank for auction. Then they watch the game.</div>
      <p class="muted">Not possible while an auction runs. This can't be undone.</p>`;
    d.setActions([{ label: 'Stay' }, { label: 'Resign', danger: true, disabled: !pick, onClick: () => announce('Prototype: resigning is not wired up.') }]);
  };
  d.body.addEventListener('click', (e) => {
    const c = e.target.closest('[data-who]');
    if (c) { pick = c.dataset.who; draw(); $(`[data-who="${pick}"]`, d.body)?.focus(); }
  });
  draw();
}

function openBankruptcy() {
  const p = P(S.active), creditor = S.ctx.owner ? P(S.ctx.owner) : P('ines');
  const props = ownedBy(p.id);
  dialog({
    title: 'Declare bankruptcy?', narrow: true,
    body: `<p class="muted">${esc(p.name)} can't raise enough to pay ${fmt(S.ctx.amount || 0)} to ${esc(creditor.name)}.</p>
      <div class="summary">${esc(creditor.name)} receives ${fmt(p.cash)} cash and ${props.length} propert${props.length === 1 ? 'y' : 'ies'}.${p.cards ? ` The jail card goes back to its deck.` : ''} ${esc(p.name)} leaves the game.</div>
      <p class="muted">This can't be undone.</p>`,
    actions: [{ label: 'Keep playing' }, { label: 'Declare bankruptcy', danger: true, onClick: () => {
      creditor.cash += Math.max(0, p.cash);
      for (const o of props) S.own[o.sq.i] = { ...S.own[o.sq.i], owner: creditor.id };
      p.cash = 0; p.bankrupt = true; p.inJail = false;
      addLog(p.id, `{n} went bankrupt. Their assets go to ${creditor.name}.`, true);
      board?.setOwnership(S.own);
      board?.setTokenVisible(p.id, false);
      S.phase = 'resolved';
      render();
    } }]
  });
}

function openGameOver() {
  const rows = S.players.map((p) => {
    const props = ownedBy(p.id);
    const worth = props.reduce((s, o) => s + o.sq.price + (o.houses || 0) * (o.sq.houseCost || 0), 0);
    return { p, cash: p.cash, worth, total: p.bankrupt ? -1 : p.cash + worth };
  }).sort((a, b) => b.total - a.total);
  const w = rows[0].p;
  dialog({
    title: 'Game over',
    body: `<div class="winner"><div class="big-av" style="color:${w.color}">${avatarSVG(w.avatar, 64)}</div><p class="eyebrow">Winner · Round ${S.round}</p><h3>${esc(w.name)}</h3></div>
      <div class="results">${rows.map((r, k) => `<div class="result${k === 0 ? ' win' : ''}"><span class="pos">${k + 1}</span><span class="mini-av" style="--pc:${r.p.color}">${avatarSVG(r.p.avatar, 26)}</span><span><b>${esc(r.p.name)}</b>${r.p.bankrupt ? ' <span class="muted">· bankrupt</span>' : ''}</span><span class="nw">${r.p.bankrupt ? '—' : fmt(r.total)}<small>${r.p.bankrupt ? '' : `${fmt(r.cash)} cash · ${fmt(r.worth)} property`}</small></span></div>`).join('')}</div>`,
    actions: [{ label: 'Leave game', primary: true }]
  });
}

// Owner controls (gameplay 3.1): each one needs a confirmation on the owner's device only.
function closeDialogs() { for (const dlg of document.querySelectorAll('dialog')) dlg.close(); }
function openSaveConfirm() {
  const p = P(S.active);
  dialog({
    title: 'Save and exit?', narrow: true,
    body: `<div class="summary">The game goes back to the start of ${esc(p.name)}'s turn.</div>
      <p class="muted">All players go to the lobby. You can continue the game from your saved games. The dice and cards stay the same.</p>`,
    actions: [{ label: 'Keep playing' }, { label: 'Save and exit', primary: true, onClick: () => { closeDialogs(); S.sessionNotice = 'saved'; S.focusTurn = true; render(); } }]
  });
}
function openFinishConfirm() {
  const p = P(S.active);
  dialog({
    title: 'Finish this game?', narrow: true,
    body: `<div class="summary">There is no winner. The game goes back to the start of ${esc(p.name)}'s turn.</div>
      <p class="muted">All players see the standings, for information only. You cannot undo this.</p>`,
    actions: [{ label: 'Keep playing' }, { label: 'Finish game', danger: true, onClick: () => { closeDialogs(); openFinished(); } }]
  });
}
function openFinished() {
  const rows = S.players.map((p) => {
    const worth = ownedBy(p.id).reduce((s, o) => s + o.sq.price + (o.houses || 0) * (o.sq.houseCost || 0), 0);
    return { p, total: p.bankrupt ? -1 : p.cash + worth };
  }).sort((a, b) => b.total - a.total);
  dialog({
    title: 'Game finished by Marlow',
    body: `<p class="muted">No winner. The game ended in round ${S.round}. Standings for information only.</p>
      <div class="results">${rows.map((r, k) => `<div class="result"><span class="pos">${k + 1}</span><span class="mini-av" style="--pc:${r.p.color}">${avatarSVG(r.p.avatar, 26)}</span><span><b>${esc(r.p.name)}</b> <span class="muted">· ${r.p.bankrupt ? 'bankrupt' : 'in the game'}</span></span><span class="nw">${fmt(Math.max(0, r.total))}</span></div>`).join('')}</div>`,
    actions: [{ label: 'OK', primary: true, onClick: () => restart() }]
  });
}

function openMenu() {
  const d = dialog({ title: 'Menu', narrow: true, onClose: () => $('#menuBtn').focus() });
  const sw = (id, on, label, sub) => `<div class="setting"><span class="lbl" id="${id}-l">${label}${sub ? `<small>${sub}</small>` : ''}</span><button type="button" class="switch" role="switch" id="${id}" aria-labelledby="${id}-l" aria-checked="${on}"></button></div>`;
  const draw = () => {
    d.body.innerHTML = `<div class="menu-list">
      <div class="setting"><span class="lbl">Rules<small>How turns, rent, jail and building work</small></span><button type="button" class="hf-outline" data-m="rules">Open</button></div>
      ${sw('mSound', S.sound, 'Sound effects')}
      <div class="setting"><label for="mMusic">Music<small>${S.music}%</small></label><input type="range" id="mMusic" min="0" max="100" step="5" value="${S.music}"></div>
      ${sw('mMotion', S.reduceMotion, 'Reduce motion', 'Dice, tokens and highlights without animation')}
      <div class="setting"><span class="lbl">Board camera</span><div class="seg" role="group" aria-label="Board camera">${[['angle', 'Angle'], ['top', 'Top']].map(([v, l]) => `<button type="button" data-view="${v}" aria-pressed="${S.view === v}">${l}</button>`).join('')}</div></div>
      ${S.isOwner ? `<div class="setting"><span class="lbl">Save and exit<small>Keep the game at the start of this turn</small></span><button type="button" class="hf-outline" data-m="save">Save</button></div>
      <div class="setting"><span class="lbl">Finish game<small>End the game with no winner</small></span><button type="button" class="hf-outline hf-danger" data-m="finish">Finish</button></div>` : ''}
      <div class="setting"><span class="lbl">Leave game<small>Resign one of your players</small></span><button type="button" class="hf-outline hf-danger" data-m="leave">Leave</button></div>
    </div>`;
  };
  d.body.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'mSound') S.sound = !S.sound;
    else if (b.id === 'mMotion') { S.reduceMotion = !S.reduceMotion; document.documentElement.classList.toggle('reduce-motion', S.reduceMotion); }
    else if (b.dataset.view) { S.view = b.dataset.view; board?.setView(S.view); }
    else if (b.dataset.m === 'rules') { openRules(); return; }
    else if (b.dataset.m === 'leave') { openLeave(); return; }
    else if (b.dataset.m === 'save') { openSaveConfirm(); return; }
    else if (b.dataset.m === 'finish') { openFinishConfirm(); return; }
    else return;
    const id = b.id ? '#' + b.id : `[data-view="${b.dataset.view}"]`;
    draw(); $(id, d.body)?.focus();
  });
  d.body.addEventListener('input', (e) => { if (e.target.id === 'mMusic') { S.music = +e.target.value; e.target.previousElementSibling.querySelector('small').textContent = S.music + '%'; } });
  draw();
}
function openRules() {
  dialog({ title: 'Rules', narrow: true, body: `<ul class="rules">
    <li>Roll two dice and move clockwise. Passing Start collects $200.</li>
    <li>Land on an unowned property to buy it, or send it to auction.</li>
    <li>Land on an owned property and pay its owner rent.</li>
    <li>Doubles roll again. Three doubles in a row go to jail.</li>
    <li>Leave jail by rolling doubles, paying $50 or using a card.</li>
    <li>Own a full colour set to build houses, then a hotel.</li>
    <li>Can't pay? Sell buildings and mortgage, or declare bankruptcy.</li>
  </ul><p class="muted">Short summary; the full rules are in the rules reference.</p>`, actions: [{ label: 'Close', primary: true }] });
}
$('#menuBtn').addEventListener('click', openMenu);

// ---------- debug panel (spec 4.7): the player on turn edits the state ----------
const debugPanel = $('#debugPanel'), debugBtn = $('#debugBtn');
const DEEDS = SQUARES.map((sq, i) => ({ sq, i })).filter(({ sq }) => sq.price);
const DEED_GROUPS = [['prop', 'Streets'], ['rail', 'Stations'], ['util', 'Utilities']];
let debugDeeds = [DEEDS[0].i], debugToken = 'marlow', debugStatus = '';
function closeDebug() { debugPanel.hidden = true; debugBtn.setAttribute('aria-expanded', 'false'); debugStatus = ''; }
debugBtn.addEventListener('click', () => {
  if (!debugPanel.hidden) { closeDebug(); return; }
  debugPanel.hidden = false; debugBtn.setAttribute('aria-expanded', 'true');
  renderDebug(); $('#debugTitle').focus();
});
document.addEventListener('pointerdown', (e) => { if (!debugPanel.hidden && !$('#debug').contains(e.target)) closeDebug(); });
$('#debug').addEventListener('keydown', (e) => { if (e.key === 'Escape' && !debugPanel.hidden) { e.stopPropagation(); closeDebug(); debugBtn.focus(); } });
function renderDebug() {
  if (debugPanel.hidden) return;
  const off = S.situation !== 'local';
  const live = S.players.filter((p) => !p.bankrupt);
  const o = S.own[debugDeeds[0]] || {};
  const street = debugDeeds.some((i) => SQUARES[i].kind === 'prop');
  const who = P(debugToken) || live[0];
  const opt = (v, label, on) => `<option value="${v}"${on ? ' selected' : ''}>${esc(label)}</option>`;
  debugPanel.innerHTML = `
    <h2 id="debugTitle" tabindex="-1">Debug</h2>
    <p>${off ? 'Wait for your turn.' : 'Edits ignore the rules. Each edit is a line in the game log.'}</p>
    <fieldset ${off ? 'disabled' : ''}><legend>Cash</legend>
      ${live.map((p) => `<form class="debug-row" data-cash="${p.id}"><label for="dc-${p.id}">${esc(p.name)}</label><input id="dc-${p.id}" inputmode="numeric" value="${p.cash}"><button type="submit" aria-label="Set ${esc(p.name)}'s cash">Set</button></form>`).join('')}
    </fieldset>
    <form data-deed><fieldset ${off ? 'disabled' : ''}><legend>Deeds</legend>
      <label class="debug-row two list">Choose <select name="sq" multiple size="10">${DEED_GROUPS.map(([k, label]) => `<optgroup label="${label}">${DEEDS.filter(({ sq }) => sq.kind === k).map(({ sq, i }) => opt(i, `${sq.name} (${S.own[i] ? P(S.own[i].owner).name : 'Bank'})`, debugDeeds.includes(i))).join('')}</optgroup>`).join('')}</select></label>
      <p>${debugDeeds.length ? `${debugDeeds.length} chosen. Apply sets the same owner, buildings and mortgage on all of them. Hold Shift or Ctrl to choose several.` : 'Choose one or more deeds. Hold Shift or Ctrl to choose several.'}</p>
      <label class="debug-row two">Owner <select name="owner">${opt('', 'Bank', !o.owner)}${live.map((p) => opt(p.id, p.name, o.owner === p.id)).join('')}</select></label>
      <label class="debug-row two">Buildings <select name="houses" ${!street || o.mortgaged ? 'disabled' : ''}>${[0, 1, 2, 3, 4, 5].map((h) => opt(h, h === 0 ? 'None' : h === 5 ? 'Hotel' : `${h} house${h > 1 ? 's' : ''}`, (o.houses || 0) === h)).join('')}</select></label>
      <label class="debug-check"><input type="checkbox" name="mortgaged" ${o.mortgaged ? 'checked' : ''}> Mortgaged</label>
      <div class="debug-actions"><button type="submit" ${debugDeeds.length ? '' : 'disabled'}>Apply</button></div>
    </fieldset></form>
    <form data-token><fieldset ${off ? 'disabled' : ''}><legend>Player tokens</legend>
      <label class="debug-row two">Player <select name="who">${live.map((p) => opt(p.id, p.name, p.id === who.id)).join('')}</select></label>
      <label class="debug-row two">Square <select name="sq">${SQUARES.map((sq, i) => opt(i, `${i}. ${sq.name}`, i === who.pos)).join('')}</select></label>
      <p>The token moves with no landing: no rent, card or Start salary.</p>
      <div class="debug-actions"><button type="submit">Move</button></div>
    </fieldset></form>
    <p role="status" aria-live="polite">${esc(debugStatus)}</p>`;
}
debugPanel.addEventListener('change', (e) => {
  const f = e.target.closest('form');
  if (f?.dataset.deed !== undefined && e.target.name === 'sq') { debugDeeds = [...e.target.selectedOptions].map((o) => +o.value); renderDebug(); }
  if (f?.dataset.token !== undefined && e.target.name === 'who') { debugToken = e.target.value; renderDebug(); }
});
debugPanel.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target, me = S.active;
  if (f.dataset.cash) {
    const v = f.querySelector('input').value.trim();
    if (!/^\d+$/.test(v)) { debugStatus = 'Cash must be a whole number, 0 or more.'; renderDebug(); return; }
    const p = P(f.dataset.cash); p.cash = +v;
    addLog(me, `{n} (debug): ${p.name}'s cash set to ${fmt(p.cash)}.`, true);
    debugStatus = `${p.name}'s cash is now ${fmt(p.cash)}.`;
  } else if (f.dataset.deed !== undefined) {
    if (!debugDeeds.length) return;
    const owner = f.owner.value, mortgaged = !!owner && f.mortgaged.checked;
    // One batch for all chosen deeds. Only streets keep buildings.
    for (const i of debugDeeds) {
      const sq = SQUARES[i];
      const houses = owner && !mortgaged && sq.kind === 'prop' ? +f.houses.value : 0;
      if (owner) S.own[i] = { owner, houses, mortgaged }; else delete S.own[i];
      const extra = [houses ? (houses === 5 ? 'a hotel' : `${houses} house${houses > 1 ? 's' : ''}`) : '', mortgaged ? 'mortgaged' : ''].filter(Boolean);
      addLog(me, owner ? `{n} (debug): ${sq.name} given to ${P(owner).name}${extra.length ? ', ' + extra.join(', ') : ''}.` : `{n} (debug): ${sq.name} returned to the bank.`);
    }
    const what = debugDeeds.length === 1 ? SQUARES[debugDeeds[0]].name : `${debugDeeds.length} deeds`;
    debugStatus = owner ? `${what} now ${debugDeeds.length === 1 ? 'belongs' : 'belong'} to ${P(owner).name}.` : `${what} back with the bank.`;
    board?.setOwnership(S.own);
  } else if (f.dataset.token !== undefined) {
    const p = P(f.who.value), to = +f.sq.value;
    p.pos = to; p.inJail = false; debugToken = p.id;
    board?.placeToken(p.id, to);
    addLog(me, `{n} (debug): ${p.name}'s token put on ${SQUARES[to].name}.`);
    debugStatus = `${p.name}'s player token is on ${SQUARES[to].name}.`;
  }
  render();
});

// ---------- prototype panel (outside the design) ----------
const protoPanel = $('#protoPanel'), protoToggle = $('#protoToggle');
protoToggle.addEventListener('click', () => {
  protoPanel.hidden = !protoPanel.hidden;
  protoToggle.setAttribute('aria-expanded', String(!protoPanel.hidden));
  renderProto();
});
const PHASES = [['start', 'Start of turn'], ['rolling', 'Rolling'], ['moving', 'Moving'], ['buy', 'Unowned property'], ['rent', 'Owned property'], ['card', 'Chance / Chest'], ['tax', 'Tax'], ['doubles', 'Doubles'], ['jail', 'In jail'], ['resolved', 'Turn resolved'], ['debt', 'Not enough cash']];
function cannedCtx(ph) {
  const p = P(S.active);
  const rent = S.active !== 'ines' ? { sq: 14, owner: 'ines', amount: 900 } : { sq: 26, owner: 'ravi', amount: 110 };
  return {
    buy: { sq: 19 }, rent, card: { card: 'chance', sq: 36 }, tax: { sq: 4 },
    debt: { ...rent, amount: Math.max(900, p.cash + 130) }
  }[ph] || {};
}
function renderProto() {
  if (protoPanel.hidden) return;
  const pressed = (v) => `aria-pressed="${v}"`;
  protoPanel.innerHTML = `
    <p class="proto-note">Prototype controls, not part of the design. The centre buttons play a scripted demo; these jump to any state.</p>
    <div><h3>Situation</h3><div class="opts">${[['local', 'Local turn'], ['handoff', 'Handoff'], ['remote', 'Remote turn']].map(([v, l]) => `<button type="button" data-sit="${v}" ${pressed(S.situation === v)}>${l}</button>`).join('')}</div></div>
    <div><h3>On turn</h3><div class="opts">${S.players.map((p) => `<button type="button" data-player="${p.id}" ${pressed(S.active === p.id)}>${p.name}${p.device === 'local' ? '' : ' (remote)'}</button>`).join('')}</div></div>
    <div><h3>Phase (board centre)</h3><div class="opts">${PHASES.map(([v, l]) => `<button type="button" data-phase="${v}" ${pressed(S.phase === v)}>${l}</button>`).join('')}</div></div>
    <div><h3>Dialogs</h3><div class="opts">
      <button type="button" data-dlg="auction">Auction</button><button type="button" data-dlg="trade">Trade</button><button type="button" data-dlg="offer">Incoming trade</button>
      <button type="button" data-dlg="manage">Manage</button><button type="button" data-dlg="bankrupt">Bankruptcy</button><button type="button" data-dlg="over">Game over</button>
      <button type="button" data-dlg="deed">Square detail</button></div></div>
    <div><h3>Player states</h3><div class="opts">
      <button type="button" data-st="jail" ${pressed(P('ines').inJail)}>Ines in jail</button>
      <button type="button" data-st="card" ${pressed(P('marlow').cards > 0)}>Marlow jail card</button>
      <button type="button" data-st="conn">Ravi: ${P('ravi').conn}</button>
      <button type="button" data-st="device">This device: ${S.deviceConn}</button>
      <button type="button" data-st="owner" ${pressed(S.isOwner)}>This device is the owner</button>
      <button type="button" data-st="bankrupt" ${pressed(!!P('tove').bankrupt)}>Tove bankrupt</button>
      <button type="button" data-st="all28" ${pressed(Object.keys(S.own).filter((i) => S.own[i].owner === 'marlow').length >= 28)}>Marlow owns all 28</button>
      <button type="button" data-st="mort" ${pressed(!!S.own[3]?.mortgaged)}>Kelp Court mortgaged</button></div></div>
    <div><h3>Turn toast</h3><div class="opts"><button type="button" data-st="toast">Show turn toast</button><button type="button" data-place="top" ${pressed(root.dataset.toast !== 'centre')}>Top</button><button type="button" data-place="centre" ${pressed(root.dataset.toast === 'centre')}>Centre</button></div></div>
    <div><h3>Board</h3><div class="opts">${[['angle', 'Angle view'], ['top', 'Top view']].map(([v, l]) => `<button type="button" data-view="${v}" ${pressed(S.view === v)}>${l}</button>`).join('')}<button type="button" data-st="log">Add log entry</button></div></div>
    <div><div class="opts"><button type="button" data-reset>Restart demo</button></div></div>`;
}
protoPanel.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  clearTimeout(autoTimer); tumble(false);
  const d = b.dataset;
  if (d.sit) {
    const locals = S.players.filter((p) => p.device === 'local').map((p) => p.id);
    if (d.sit === 'remote' && P(S.active).device === 'local') S.active = 'ravi';
    if (d.sit !== 'remote' && P(S.active).device === 'remote') S.active = S.lastLocal;
    if (d.sit === 'handoff' && S.active === S.lastLocal) S.active = locals.find((id) => id !== S.lastLocal);
    if (d.sit === 'local') S.lastLocal = S.active;
    S.situation = d.sit; S.scripted = false; S.handSeat = null;
  } else if (d.player) {
    const p = P(d.player);
    S.active = p.id; S.scripted = false; S.handSeat = null;
    S.situation = p.device === 'remote' ? 'remote' : 'local';
    if (p.device === 'local') S.lastLocal = p.id;
  } else if (d.phase) {
    // pressing Chance / Chest again switches deck
    const prevCard = S.phase === 'card' ? S.ctx.card : null;
    S.phase = d.phase; S.ctx = cannedCtx(d.phase); S.scripted = false;
    if (d.phase === 'card' && prevCard === 'chance') S.ctx = { card: 'chest', sq: 17 };
    render();
    if (d.phase === 'rolling') tumble(true);
    return;
  } else if (d.dlg) {
    if (d.dlg === 'auction') { S.ctx = { sq: 19 }; openAuction(); }
    if (d.dlg === 'trade') openTrade();
    if (d.dlg === 'offer') openTrade(true);
    if (d.dlg === 'manage') openManage();
    if (d.dlg === 'bankrupt') { S.ctx = cannedCtx('debt'); openBankruptcy(); }
    if (d.dlg === 'over') openGameOver();
    if (d.dlg === 'deed') openSquare(26);
    return;
  } else if (d.place) {
    root.dataset.toast = d.place;
    renderProto();
    return;
  } else if (d.st) {
    if (d.st === 'jail') { const p = P('ines'); p.inJail = !p.inJail; if (p.inJail) { p.pos = 10; board?.placeToken('ines', 10); } }
    if (d.st === 'card') P('marlow').cards = P('marlow').cards ? 0 : 1;
    if (d.st === 'conn') { const p = P('ravi'); p.conn = { online: 'reconnecting', reconnecting: 'away', away: 'online' }[p.conn]; }
    if (d.st === 'device') S.deviceConn = { online: 'reconnecting', reconnecting: 'closed', closed: 'online' }[S.deviceConn];
    if (d.st === 'all28') {
      const all = SQUARES.filter((q) => GROUP_ORDER.includes(q.group));
      const has = all.every((q) => S.own[q.i]?.owner === 'marlow');
      for (const q of all) { if (has) { if (!OWNERSHIP[q.i] || OWNERSHIP[q.i].owner !== 'marlow') delete S.own[q.i]; else S.own[q.i] = structuredClone(OWNERSHIP[q.i]); } else if (!S.own[q.i] || S.own[q.i].owner !== 'marlow') S.own[q.i] = { owner: 'marlow' }; }
      board?.setOwnership(S.own);
    }
    if (d.st === 'toast') showToast(`It is ${P(S.active).name}'s turn.`);
    if (d.st === 'owner') S.isOwner = !S.isOwner;
    if (d.st === 'bankrupt') { const p = P('tove'); p.bankrupt = !p.bankrupt; board?.setTokenVisible('tove', !p.bankrupt); }
    if (d.st === 'mort') { S.own[3].mortgaged = !S.own[3].mortgaged; if (S.own[3].mortgaged) S.own[3].houses = 0; board?.setOwnership(S.own); }
    if (d.st === 'log') addLog(S.active, '{n} is thinking about a trade.');
  } else if (d.view) { S.view = d.view; board?.setView(S.view); }
  else if ('reset' in d) { restart(); return; }
  render();
});

function restart() {
  clearTimeout(autoTimer); tumble(false);
  for (const dlg of document.querySelectorAll('dialog')) dlg.close();
  reset();
  document.documentElement.classList.toggle('reduce-motion', S.reduceMotion);
  if (board) {
    board.setOwnership(S.own);
    for (const p of S.players) { board.setTokenVisible(p.id, true); board.placeToken(p.id, p.pos); }
    board.setView(S.view);
  }
  renderLog();
  render();
}

// ---------- boot ----------
renderLog();
render();
import('./board3d.js')
  .then((m) => m.createBoard(stage, { frame: boardCol, players: S.players, ownership: S.own, reduced, onSquare: openSquare }))
  .then((api) => { board = api; board.onFrame(placeTurn); })
  .catch((err) => { console.error(err); $('#boardMsg').hidden = false; });
