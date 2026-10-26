// Outline avatar icons from the Game screen 2 artboard (48 × 48 grid, stroke 2.4), dice and small UI icons.

const avatarPaths = {
  cat: '<path d="M13.6 13L13 3.5L20 8Q24 7 28 8L35 3.5L34.4 13Q36 15 35 18Q32 26 24 26Q16 26 13 18Q12 15 13.6 13Z"/><path d="M17 25.5C13 30 12 36 14 42H34C36 36 35 30 31 25.5"/><path d="M24 33V42"/><path d="M34 41C41 41 44 36 43 31C42.5 28 40 27.5 39 29"/><path d="M22.8 19.5H25.2L24 21Z"/><path d="M9.5 18.5L14.5 19.5M9.5 22L14.5 21.5M38.5 18.5L33.5 19.5M38.5 22L33.5 21.5" stroke-width="1.6"/><circle cx="19.5" cy="15.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="28.5" cy="15.5" r="1.1" fill="currentColor" stroke="none"/>',
  dog: '<path d="M5 15.5L15 12L22 13.5L37 15C40 15.5 41 18 41 21V33H15V25.5L10.5 19.5L6 18.5C4.5 18.2 4 16.5 5 15.5Z"/><path d="M15.5 12L17 4L21.5 13.2"/><path d="M37.5 15.2L41.5 6L44 7.5L41 18"/><path d="M17 33V40H22V33M34 33V40H39V33"/><path d="M8.5 19.5L8 23M11.5 21L11 25" stroke-width="1.8"/><circle cx="11.5" cy="15.8" r="1.1" fill="currentColor" stroke="none"/><circle cx="5.8" cy="16" r="1.4" fill="currentColor" stroke="none"/>',
  penguin: '<path d="M24 4C15 4 12 12 12 22C12 33 15 41 24 41C33 41 36 33 36 22C36 12 33 4 24 4Z"/><path d="M24 19C19.5 19 17.5 24 17.5 30C17.5 35.5 20 39.5 24 39.5C28 39.5 30.5 35.5 30.5 30C30.5 24 28.5 19 24 19Z"/><path d="M12.5 20C8 23 6.5 29 7.5 34C10 32.5 12 29 12.8 26"/><path d="M35.5 20C40 23 41.5 29 40.5 34C38 32.5 36 29 35.2 26"/><path d="M21.5 13.5H26.5L24 17.5Z"/><ellipse cx="18" cy="43.5" rx="4.5" ry="2"/><ellipse cx="30" cy="43.5" rx="4.5" ry="2"/><circle cx="20" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="28" cy="10" r="1.2" fill="currentColor" stroke="none"/>',
  car: '<g transform="translate(0 -5)"><path d="M4 34V29.5Q4 27.5 6 27L18 25L22 20.5H30L33 25L41.5 27Q44 27.5 44 30V34H39.5A6.5 6.5 0 0 0 26.5 34H21.5A6.5 6.5 0 0 0 8.5 34Z"/><path d="M21 24.5L23.5 21.8H28.5L30.5 24.5Z"/><circle cx="15" cy="34" r="4.5"/><circle cx="33" cy="34" r="4.5"/><circle cx="15" cy="34" r="1.2" fill="currentColor" stroke="none"/><circle cx="33" cy="34" r="1.2" fill="currentColor" stroke="none"/></g>'
};

export const avatarSVG = (kind, size = 38) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${avatarPaths[kind]}</svg>`;

const PIPS = { 1: [[36, 36]], 2: [[20, 20], [52, 52]], 3: [[20, 20], [36, 36], [52, 52]], 4: [[20, 20], [52, 20], [20, 52], [52, 52]], 5: [[20, 20], [52, 20], [36, 36], [20, 52], [52, 52]], 6: [[20, 20], [52, 20], [20, 36], [52, 36], [20, 52], [52, 52]] };
// a one is a large red pip, as in Game parts
export const dieSVG = (n) =>
  `<svg class="die" width="72" height="72" viewBox="0 0 72 72" aria-hidden="true"><rect x="2" y="2" width="68" height="68" rx="12" fill="#f7f5ee" stroke="#3d5a4a" stroke-width="2"/>${
    n === 1 ? '<circle cx="36" cy="36" r="13" fill="#c8322b"/>' : `<g fill="#1b1b1b">${PIPS[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6"/>`).join('')}</g>`
  }</svg>`;

const icon = (d, size = 20, extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const ICON = {
  chevron: icon('<path d="M5 9l7 7 7-7"/>'),
  close: icon('<path d="M6 6l12 12M18 6L6 18"/>'),
  jail: icon('<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M9 4v16M15 4v16"/>', 14),
  card: icon('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h6M7 14h3"/>', 14),
  tick: icon('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 14, 'stroke-width="2.6"'),
  device: icon('<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M11 17.5h2"/>', 16),
  globe: icon('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>', 16),
  house: '<svg width="12" height="12" viewBox="0 0 40 40" aria-hidden="true"><rect x="8" y="18" width="24" height="18" fill="#38b36a"/><path d="M3 20L20 4l17 16z" fill="#1f7a46"/></svg>',
  hotel: '<svg width="22" height="12" viewBox="0 0 72 40" aria-hidden="true"><rect x="6" y="14" width="60" height="22" fill="#d4372f"/><rect x="2" y="6" width="68" height="10" fill="#8e231d"/></svg>',
  minus: icon('<path d="M6 12h12"/>', 18),
  plus: icon('<path d="M12 6v12M6 12h12"/>', 18)
};

// square icons for the deed popover, from Game parts
export const SQUARE_ICON = {
  rail: '<svg width="64" height="74" viewBox="0 0 120 140" fill="none" stroke="#17211b" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="6" width="104" height="92" rx="20"/><path d="M8 52h104"/><circle cx="36" cy="76" r="5" fill="#17211b"/><circle cx="84" cy="76" r="5" fill="#17211b"/><path d="M26 130l14-32M94 130L80 98"/></svg>',
  util: '<svg width="64" height="70" viewBox="0 0 120 130" fill="none" stroke="#17211b" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="60" cy="42" r="36"/><path d="M40 98h40M46 116h28"/></svg>',
  chance: '<div class="sq-q" aria-hidden="true">?</div>',
  chest: '<svg width="64" height="64" viewBox="0 0 120 120" fill="none" stroke="#1f4f96" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="10" y="52" width="100" height="60" rx="8"/><path d="M10 74h100M10 52Q10 10 60 10Q110 10 110 52"/></svg>',
  tax: '<svg width="64" height="64" viewBox="0 0 120 120" fill="none" stroke="#17211b" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M60 8L112 60L60 112L8 60Z"/><path d="M8 60h104"/></svg>'
};
