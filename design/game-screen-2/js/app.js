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
    reduceMotion: sysReduced.matches, sound: true, music: 40, view: 'angle'
  });
}
reset();
let logSeq = 1, dlgSeq = 1;
const P = (id) => S.players.find((p) => p.id === id);
const reduced = () => S.reduceMotion;
const handOwner = () => (S.situation === 'local' ? S.active : S.lastLocal);
const ownedBy = (id) => Object.entries(S.own).filter(([, o]) => o.owner === id).map(([i, o]) => ({ sq: SQUARES[+i], ...o }));

// ---------- elements ----------
const root = $('#root'), logbar = $('#logbar'), logEl = $('#log'), logToggle = $('#logToggle'), logFilters = $('#logFilters');
const rail = $('#rail'), boardCol = $('#boardCol'), stage = $('#boardStage'), turn = $('#turn'), turnInner = $('#turnInner');
const hand = $('#hand'), handLabel = $('#handLabel'), handoff = $('#handoff'), announceEl = $('#announce');
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
      go: 'Collect $200 salary as you pass.', jail: 'In jail, or just visiting.', parking: 'Nothing happens here.', gotojail: 'Go directly to jail. Do not pass GO.',
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
  let actions = '';
  if (v.primary || v.secondary) {
    if (remote) actions = `<p class="deciding"><span class="spinner" aria-hidden="true"></span>${esc(p.name)} is deciding…</p>`;
    else {
      const btn = ([label, fn, disabled, cls], primary) => {
        actionsMap.push(fn);
        return `<button type="button" class="${primary ? 'hf-primary' : 'hf-outline ' + (cls || '')}" data-act="${actionsMap.length - 1}"${disabled ? ' disabled' : ''}>${label}</button>`;
      };
      actions = `<div class="actions">${v.primary ? btn(v.primary, true) : ''}${(v.secondary || []).map((s) => btn(s, false)).join('')}</div>`;
    }
  }
  const tag = remote ? `<span class="watch-tag">Watching · ${esc(p.name)} plays on their device</span>` : '';
  const html = tag + v.content + actions;
  const key = S.phase + S.situation + S.active;
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

// ---------- hand ----------
function renderHand() {
  const owner = P(handOwner());
  const props = ownedBy(owner.id);
  const value = props.reduce((s, o) => s + o.sq.price, 0);
  const remoteNote = S.situation === 'local' ? '' : ' (this device)';
  handLabel.innerHTML = `${esc(owner.name)}'s properties${remoteNote} · <span class="v">${props.length} · ${fmt(value)}</span>`;
  const stacks = [];
  for (const gid of GROUP_ORDER) {
    const cards = props.filter((o) => o.sq.group === gid).sort((a, b) => a.sq.i - b.sq.i);
    if (!cards.length) continue;
    const g = GROUPS[gid];
    const complete = cards.length === g.size;
    stacks.push({ label: g.name, complete, color: g.color, cards: cards.map((o) => ({ ...o, name: o.sq.name, price: fmt(o.sq.price) })) });
  }
  if (owner.cards) stacks.push({ label: 'Cards', jail: true, cards: Array.from({ length: owner.cards }, () => ({ name: 'Get out of jail free', price: 'Keep' })) });
  hand.innerHTML = stacks.length ? stacks.map((s) => {
    const n = s.cards.length;
    return `<div class="stack" style="--n:${n}" role="group" aria-label="${s.label}${n > 1 ? ', ' + n + ' cards' : ''}${s.complete ? ', set complete' : ''}">
      <div class="stack-label">${s.label}${n > 1 ? ' · ' + n : ''}${s.complete ? `<span class="set" title="Set complete">${ICON.tick}<span class="sr-only">set complete</span></span>` : ''}</div>
      <div class="stack-cards">${s.cards.map((k, i) => {
        const h = k.houses || 0;
        const pips = h === 5 ? ICON.hotel : ICON.house.repeat(h);
        const desc = `${k.name}, ${k.price}${h === 5 ? ', hotel' : h ? `, ${h} house${h > 1 ? 's' : ''}` : ''}${k.mortgaged ? ', mortgaged' : ''}`;
        return `<button type="button" class="card${k.mortgaged ? ' mortgaged' : ''}${s.jail ? ' jailcard' : ''}" style="--i:${i}" ${k.sq ? `data-sq="${k.sq.i}"` : 'data-jailcard="1"'} aria-label="${esc(desc)}. Open details">
          <span class="band" style="${s.jail ? '' : `background:${s.color}`}"></span>
          <span class="row"><span class="nm">${esc(k.name)}</span><span class="pr">${k.price}</span></span>
          <span class="pips">${k.mortgaged ? '<span class="mtag">Mortgaged</span>' : pips}</span>
        </button>`;
      }).join('')}</div>
    </div>`;
  }).join('') : '<p class="muted" style="padding-bottom:60px">No properties yet.</p>';
}
hand.addEventListener('click', (e) => {
  const b = e.target.closest('.card');
  if (!b) return;
  if (b.dataset.sq) openSquare(+b.dataset.sq);
  else dialog({ title: 'Get out of jail free', narrow: true, body: '<p class="muted">Keep this card until needed, or trade it. Use it from the jail options at the start of a turn in jail.</p>', actions: [{ label: 'Close', primary: true }] });
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
  renderProto();
  scheduleAuto();
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
  if (r.passGo) { p.cash += 200; addLog(p.id, '{n} collected $200 passing GO.', true); }
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
function nextTurn() {
  const prev = S.active;
  const order = PLAYERS.map((p) => p.id);
  let guard = 0;
  do { S.turnIdx = (S.turnIdx + 1) % SCRIPT.length; } while (P(SCRIPT[S.turnIdx].player).bankrupt && guard++ < SCRIPT.length);
  const next = SCRIPT[S.turnIdx].player;
  if (order.indexOf(next) <= order.indexOf(prev)) S.round++;
  enterTurn(next, true);
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
  if (S.situation !== 'remote' || !S.scripted || $('dialog[open]')) return;
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

function openBankruptcy() {
  const p = P(S.active), creditor = S.ctx.owner ? P(S.ctx.owner) : P('ines');
  const props = ownedBy(p.id);
  dialog({
    title: 'Declare bankruptcy?', narrow: true,
    body: `<p class="muted">${esc(p.name)} can't raise enough to pay ${fmt(S.ctx.amount || 0)} to ${esc(creditor.name)}.</p>
      <div class="summary">${esc(creditor.name)} receives ${fmt(p.cash)} cash and ${props.length} propert${props.length === 1 ? 'y' : 'ies'}${p.cards ? ` and ${p.cards} jail card` : ''}. ${esc(p.name)} leaves the game.</div>
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
    actions: [{ label: 'Leave game' }, { label: 'Rematch', primary: true, onClick: () => restart() }]
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
      <div class="setting"><span class="lbl">Leave game<small>Your seats on this device are released</small></span><button type="button" class="hf-outline hf-danger" data-m="leave">Leave</button></div>
    </div>`;
  };
  d.body.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'mSound') S.sound = !S.sound;
    else if (b.id === 'mMotion') { S.reduceMotion = !S.reduceMotion; document.documentElement.classList.toggle('reduce-motion', S.reduceMotion); }
    else if (b.dataset.view) { S.view = b.dataset.view; board?.setView(S.view); }
    else if (b.dataset.m === 'rules') { openRules(); return; }
    else if (b.dataset.m === 'leave') {
      dialog({ title: 'Leave game?', narrow: true, body: '<p class="muted">Marlow and Tove leave the game. Their turns are handled as the table agreed (skip, pause or bot; still an open question).</p>', actions: [{ label: 'Stay' }, { label: 'Leave game', danger: true, onClick: () => announce('Prototype: leaving is not wired up.') }] });
      return;
    } else return;
    const id = b.id ? '#' + b.id : `[data-view="${b.dataset.view}"]`;
    draw(); $(id, d.body)?.focus();
  });
  d.body.addEventListener('input', (e) => { if (e.target.id === 'mMusic') { S.music = +e.target.value; e.target.previousElementSibling.querySelector('small').textContent = S.music + '%'; } });
  draw();
}
function openRules() {
  dialog({ title: 'Rules', narrow: true, body: `<ul class="rules">
    <li>Roll two dice and move clockwise. Passing GO collects $200.</li>
    <li>Land on an unowned property to buy it, or send it to auction.</li>
    <li>Land on an owned property and pay its owner rent.</li>
    <li>Doubles roll again. Three doubles in a row go to jail.</li>
    <li>Leave jail by rolling doubles, paying $50 or using a card.</li>
    <li>Own a full colour set to build houses, then a hotel.</li>
    <li>Can't pay? Sell buildings and mortgage, or declare bankruptcy.</li>
  </ul><p class="muted">Draft summary; the full rules are still open in the gameplay doc.</p>`, actions: [{ label: 'Close', primary: true }] });
}
$('#menuBtn').addEventListener('click', openMenu);

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
      <button type="button" data-st="bankrupt" ${pressed(!!P('tove').bankrupt)}>Tove bankrupt</button>
      <button type="button" data-st="mort" ${pressed(!!S.own[3]?.mortgaged)}>Kelp Court mortgaged</button></div></div>
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
    S.situation = d.sit; S.scripted = false;
  } else if (d.player) {
    const p = P(d.player);
    S.active = p.id; S.scripted = false;
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
  } else if (d.st) {
    if (d.st === 'jail') { const p = P('ines'); p.inJail = !p.inJail; if (p.inJail) { p.pos = 10; board?.placeToken('ines', 10); } }
    if (d.st === 'card') P('marlow').cards = P('marlow').cards ? 0 : 1;
    if (d.st === 'conn') { const p = P('ravi'); p.conn = { online: 'reconnecting', reconnecting: 'away', away: 'online' }[p.conn]; }
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
