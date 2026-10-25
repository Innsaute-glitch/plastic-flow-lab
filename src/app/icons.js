// Hand-written 24x24 line icons (stroke = currentColor). No icon library.
const P = {
  cursor: '<path d="M5 3l14 7-6 2-2 6z"/>',
  'pin-plus': '<path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10z"/><path d="M12 8v6M9 11h6"/>',
  factory: '<path d="M3 21V10l6 3V9l6 3V5h3a1 1 0 0 1 1 1v15z"/><path d="M8 17h2M13 17h2"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  sparkles: '<path d="M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8z"/><path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  trash: '<path d="M4 7h16M10 3h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  repeat: '<path d="M4 12a6 6 0 0 1 6-6h8M15 3l3 3-3 3M20 12a6 6 0 0 1-6 6H6M9 21l-3-3 3-3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevron: '<path d="M15 5l-7 7 7 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  bottle: '<path d="M10 2h4M10.5 2v3.5C10.5 7 8 8 8 10.5V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-9.5c0-2.5-2.500-3.500-2.500-5V2"/><path d="M8 13h8"/>',
  jug: '<path d="M8 6h7l3 3v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M8 6V3h4v3M15 12a3 3 0 0 1 0 5"/>',
  tub: '<path d="M4 8h16l-2 12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z"/><path d="M3 8h18M7 5h10"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  food: '<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v6M9 3v6M7 3v0M17 21V3c-2.500 1.500-3 5-3 8h3"/>',
  bin: '<path d="M5 7h14l-1.500 14h-11z"/><path d="M4 7h16M9 7V4h6v3M10 11v6M14 11v6"/>',
  split: '<path d="M5 7h14l-1.500 14h-11z"/><path d="M4 7h16M9 7V4h6v3M12 10v8"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  flask: '<path d="M9 3h6M10 3v6L4.500 19a1.500 1.500 0 0 0 1.300 2.200h12.400A1.500 1.500 0 0 0 19.500 19L14 9V3"/><path d="M7.500 15h9"/>',
  weight: '<path d="M6 20h12l-1.500-11h-9z"/><circle cx="12" cy="6" r="2.200"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  logo: '<path d="M4 14c0-5 4-9 9-9h7v6c0 5-4 9-9 9H4z"/><path d="M8 16c2-4 5-6 9-7"/>',
};

export function icon(name, size = 18, extra = '') {
  const body = P[name] ?? '';
  return `<svg class="app-icon ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

// waste type -> icon name
export const WASTE_ICON = { pet_bottles: 'bottle', hdpe: 'jug', pp: 'tub', mixed: 'layers', food_contaminated: 'food' };
