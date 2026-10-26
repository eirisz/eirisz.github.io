// Line icons in the style of Apple's SF Symbols, drawn in the current text color.
const Icons = (() => {
  const svg = (body) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const folderOutline = '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v8.3a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>';
  const docOutline = '<path d="M6.5 3.5h7l4 4v11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><path d="M13.5 3.5v4h4"/>';

  return {
    sidebar: svg('<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M9.5 4.5v15"/><path d="M5.5 8h1.8M5.5 11h1.8"/>'),
    compose: svg('<path d="M11 4.5H7a3 3 0 0 0-3 3v9.5a3 3 0 0 0 3 3h9.5a3 3 0 0 0 3-3V13"/><path d="M17.6 3.6a1.9 1.9 0 0 1 2.8 2.8L12.5 14.3 9 15l.7-3.5z"/>'),
    open: svg(folderOutline),
    save: svg('<path d="M8 9.5H6.5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H16"/><path d="M12 3v11.5M8.5 11l3.5 3.5 3.5-3.5"/>'),
    emoji: svg('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.2a4.2 4.2 0 0 0 7 0"/><path d="M9.2 9.6v.6M14.8 9.6v.6" stroke-width="2.4"/>'),
    settings: svg('<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>'),
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 7.2A2.2 2.2 0 0 1 5.2 5h3.9c.6 0 1.1.2 1.5.6l1.3 1.3h6.9A2.2 2.2 0 0 1 21 9.1v8.7a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 17.8z"/></svg>',
    doc: svg(docOutline),
    photo: svg('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>'),
    chevron: svg('<path d="M9.5 6l6 6-6 6"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    close: svg('<path d="M7.5 7.5l9 9M16.5 7.5l-9 9"/>'),
    trash: svg('<path d="M5 7h14M10 7V5h4v2M6.5 7l1 12.5h9l1-12.5"/>'),
    rename: svg('<path d="M15.5 4.5l4 4L9 19H5v-4z"/>'),
    reveal: svg('<path d="M14 4.5h5.5V10M19.5 4.5L11 13"/><path d="M18 14v3.5a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2H10"/>'),
    newFolder: svg(`${folderOutline}<path d="M12 11v5M9.5 13.5h5"/>`),
    newFile: svg(`${docOutline}<path d="M12 11v6M9 14h6"/>`),
    remove: svg('<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>'),
    highlight: svg('<path d="M14.5 4.5l5 5-8 8H6.5v-5z"/><path d="M4 20.5h16" stroke-width="3" stroke="var(--swatch, currentColor)"/>'),
    bullets: svg('<circle cx="5" cy="7" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="5" cy="17" r="1.2" fill="currentColor"/><path d="M9.5 7h10M9.5 12h10M9.5 17h10"/>'),
    numbers: svg('<path d="M4 5.5h1.5v4M4 9.5h3M3.8 14.2a1.5 1.5 0 1 1 2.4 1.6L4 18.5h3"/><path d="M10 7h10M10 12h10M10 17h10"/>'),
    checklist: svg('<rect x="3.5" y="4.5" width="5" height="5" rx="1.2"/><path d="M4.6 15.8l1.5 1.5 2.6-3"/><path d="M11.5 7h9M11.5 16h9"/>'),
    indent: svg('<path d="M4 5h16M10 10h10M10 14h10M4 19h16"/><path d="M4 9.5l3 2.5-3 2.5"/>'),
    outdent: svg('<path d="M4 5h16M10 10h10M10 14h10M4 19h16"/><path d="M7 9.5l-3 2.5 3 2.5"/>'),
    alignLeft: svg('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
    alignCenter: svg('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
    alignRight: svg('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
    alignJustify: svg('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>'),
    table: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15M15 4.5v15"/>'),
    clearFormat: svg('<path d="M6 5h12M12 5l-3 14"/><path d="M15 14l5 5M20 14l-5 5"/>'),
    template: svg('<rect x="7.5" y="3.5" width="12" height="15" rx="2"/><path d="M4.5 7.5v11a2 2 0 0 0 2 2h9"/><path d="M10.5 8h6M10.5 11h6M10.5 14h3.5"/>'),
    search: svg('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>'),
    tag: svg('<path d="M3.5 12.2V5.5a2 2 0 0 1 2-2h6.7l8.3 8.3a2 2 0 0 1 0 2.8l-5.9 5.9a2 2 0 0 1-2.8 0z"/><circle cx="8" cy="8" r="1.4"/>'),
  };
})();
