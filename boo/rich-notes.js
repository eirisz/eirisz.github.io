// Rich text notes (the "Rich text, like Word" choice): one TipTap editor per rich tab,
// a formatting toolbar, and the file format. A rich note is saved as an .html file
// that Word and browsers can open too; Boo recognizes its own notes by a <meta> tag.
// The editor bundle (vendor/rich.js) loads the first time a rich note is shown.
const RichNotes = (() => {
  const { el } = Dialogs;
  const host = document.getElementById('rich-host');
  const toolbar = document.getElementById('rich-toolbar');
  const tableBar = document.getElementById('rich-table-bar');
  const scroller = document.getElementById('rich-scroll');
  const { BOO_NOTE_MARKER, isBooNote } = BooEditor.tagParse;

  const DEFAULT_FONT = 'Segoe UI';
  const DEFAULT_SIZE = 11;
  // Saved into each note so other apps show it much as Boo does.
  const NOTE_CSS = [
    "body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 11pt; line-height: 1.5; color: #1c1c1e; max-width: 860px; margin: 2em auto; padding: 0 1.5em; }",
    'h1, h2, h3 { line-height: 1.25; }',
    'table { border-collapse: collapse; margin: 0.5em 0; }',
    'td, th { border: 1px solid #c7c7cc; padding: 6px 10px; vertical-align: top; }',
    'th { background: #f2f2f7; text-align: left; }',
    'u.double { text-decoration-style: double; }',
    'img { max-width: 100%; }',
    'ul[data-type="taskList"] { list-style: none; padding-left: 0.5em; }',
    'blockquote { border-left: 3px solid #c7c7cc; margin-left: 0; padding-left: 1em; color: #48484a; }',
    '.reminder { background: #fff1d6; color: #9a5b00; border-radius: 999px; padding: 0 7px; font-weight: 600; white-space: nowrap; }',
    '.reminder[data-done] { background: #f2f2f7; color: #8e8e93; text-decoration: line-through; }',
  ].join('\n');

  const editors = new Map();
  let bundle = null;
  let shown = null;
  let refreshQueued = false;

  // ---------- Loading the editor bundle ----------

  function loadBundle() {
    bundle ??= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/rich.js';
      script.onload = () => resolve(window.BooRich);
      script.onerror = () => reject(new Error('The rich text editor could not be loaded.'));
      document.head.append(script);
    });
    return bundle;
  }

  // ---------- File format ----------

  const LEGACY_IMAGE_BASE = 'boo-file://local/';
  const imageUrl = (file) => `${window.boo.imageBase}${file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')}`;

  function urlToPath(src) {
    // Notes written by older versions of Boo may still use boo-file://local/.
    for (const base of [window.boo.imageBase, LEGACY_IMAGE_BASE]) {
      if (src.startsWith(base)) return window.boo.nativePath(decodeURIComponent(src.slice(base.length)));
    }
    if (src.startsWith('file:///')) return window.boo.nativePath(decodeURIComponent(src.slice(8)));
    return null;
  }

  // A Boo rich note, whatever its name or extension (Boo marks its notes inside).
  const isRichFile = (_file, text) => isBooNote(text);

  // The body of a saved note, with its images pointed at files on disk.
  function parseNote(html, file) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const dir = file ? dirName(file) : null;
    for (const image of doc.body.querySelectorAll('img')) {
      const src = image.getAttribute('src') ?? '';
      const onDisk = urlToPath(src) ?? (dir && !/^[a-z]+:/i.test(src) ? window.boo.nativePath(`${dir}/${decodeURI(src)}`) : null);
      if (onDisk) image.setAttribute('src', imageUrl(onDisk));
    }
    return doc.body.innerHTML;
  }

  const escapeHtml = (text) => text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

  // A whole HTML document for the file. Images beside the note get relative paths;
  // pasted images still waiting in Boo's data folder move beside the note first.
  async function serialize(buffer, file) {
    const { editor } = editors.get(buffer);
    const body = new DOMParser().parseFromString(`<body>${editor.getHTML()}</body>`, 'text/html').body;
    const images = [...body.querySelectorAll('img')].map((image) => ({ image, path: urlToPath(image.getAttribute('src') ?? '') })).filter((item) => item.path);
    if (images.length) {
      const { result: moved = [], error } = await window.boo.adoptImagePaths(images.map((item) => item.path), file);
      if (error) throw new Error(error);
      const movedTo = new Map(moved);
      const dir = dirName(file).toLowerCase();
      const retarget = new Map();
      for (const { image, path } of images) {
        const relative = movedTo.get(path);
        if (relative) retarget.set(imageUrl(path), imageUrl(`${dirName(file)}${window.boo.sep}${relative}`));
        const inside = path.toLowerCase().startsWith(`${dir}\\`) || path.toLowerCase().startsWith(`${dir}/`);
        const target = relative ?? (inside ? path.slice(dir.length + 1) : null);
        image.setAttribute('src', target ? target.split(/[\\/]/).map(encodeURIComponent).join('/') : `file:///${path.replace(/\\/g, '/')}`);
      }
      if (retarget.size) retargetImages(editor, retarget);
    }
    const title = firstLine(buffer) || 'Note';
    return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n${BOO_NOTE_MARKER}\n<title>${escapeHtml(title)}</title>\n<style>\n${NOTE_CSS}\n</style>\n</head>\n<body>\n${body.innerHTML}\n</body>\n</html>\n`;
  }

  // After images move, the open note points at their new place (not an edit).
  function retargetImages(editor, map) {
    const { tr } = editor.state;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image' && map.has(node.attrs.src)) tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: map.get(node.attrs.src) });
    });
    if (tr.docChanged) editor.view.dispatch(tr.setMeta('addToHistory', false).setMeta('booRetarget', true));
  }

  // ---------- One editor per rich tab ----------

  async function attach(buffer, html, onChange) {
    const BooRich = await loadBundle();
    // Notes kept by the Electron version of Boo point at pictures with boo-file://local/.
    if (window.boo.imageBase !== LEGACY_IMAGE_BASE) html = html.split(`src="${LEGACY_IMAGE_BASE}`).join(`src="${window.boo.imageBase}`);
    const element = el('div', `rich-page${buffer.guide ? ' guide' : ''}`);
    element.hidden = true;
    scroller.append(element);
    const editor = BooRich.createRichEditor(element, {
      content: html,
      editable: !buffer.guide,
      onUpdate: (_editor, transaction) => {
        if (!transaction.getMeta('booRetarget')) onChange(buffer);
        queueRefresh();
      },
      onSelection: queueRefresh,
      onImage: (file) => pasteImage(buffer, file),
      onTagClick: (tag) => {
        showSidebarView('tags');
        TagsView.show(tag);
      },
      onReminderClick: (attrs, pos, anchor) => editReminder(buffer, attrs, pos, anchor),
    });
    // A note that opens with unsaved changes (restored from the session, or new from
    // a template) matches no saved version, so undoing never makes it look saved.
    editors.set(buffer, { editor, element, savedDoc: buffer.dirty || !buffer.file ? null : editor.state.doc });
  }

  function detach(buffer) {
    const entry = editors.get(buffer);
    if (!entry) return;
    entry.editor.destroy();
    entry.element.remove();
    editors.delete(buffer);
    if (shown === buffer) shown = null;
  }

  function show(buffer) {
    for (const [other, entry] of editors) entry.element.hidden = other !== buffer;
    host.hidden = !buffer;
    shown = buffer ?? null;
    if (!buffer) return;
    scroller.scrollTop = buffer.scrollTop ?? 0;
    // The read-only guide has nothing to format.
    toolbar.hidden = Boolean(buffer.guide);
    if (buffer.guide) tableBar.hidden = true;
    else refreshToolbar();
  }

  function focus(buffer) {
    editors.get(buffer)?.editor.commands.focus();
  }

  const editorOf = (buffer) => editors.get(buffer)?.editor ?? null;
  const textOf = (buffer) => editorOf(buffer)?.getText({ blockSeparator: '\n' }) ?? '';
  const htmlOf = (buffer) => editorOf(buffer)?.getHTML() ?? '';

  // HTML as the editor would write it back, so sync can tell real changes from
  // the editor's own tidying.
  async function normalize(html) {
    const BooRich = await loadBundle();
    const editor = BooRich.createRichEditor(document.createElement('div'), { content: html, editable: false });
    const tidy = editor.getHTML();
    editor.destroy();
    return tidy;
  }

  function firstLine(buffer) {
    const editor = editorOf(buffer);
    if (!editor) return '';
    let line = '';
    editor.state.doc.descendants((node) => {
      if (line) return false;
      if (node.isTextblock && node.textContent.trim()) line = node.textContent.trim();
      return !line;
    });
    return line;
  }

  const isEmpty = (buffer) => editorOf(buffer)?.isEmpty ?? true;

  // An untitled note with nothing typed in it isn't "unsaved".
  function isDirty(buffer) {
    const entry = editors.get(buffer);
    if (!entry) return false;
    if (!entry.savedDoc && !buffer.file) return !entry.editor.isEmpty || buffer.dirty;
    return entry.editor.state.doc !== entry.savedDoc;
  }

  // `doc` is the text that was written (the note may have changed while saving).
  function markSaved(buffer, doc) {
    const entry = editors.get(buffer);
    if (entry) entry.savedDoc = doc ?? entry.editor.state.doc;
  }

  function wordCount(buffer) {
    const words = textOf(buffer).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
    return words ? words.length : 0;
  }

  function insertText(buffer, text) {
    editorOf(buffer)?.chain().focus().insertContent(text).run();
  }

  // Selects `length` characters at a line and column of the note's text, as listed
  // by Find in Files and Tags (one line per paragraph, heading, list item or cell).
  function revealLine(buffer, { line, column = 0, length = 0 }) {
    const editor = editorOf(buffer);
    if (!editor) return;
    let index = 0;
    let target = null;
    editor.state.doc.descendants((node, pos) => {
      if (target !== null) return false;
      if (!node.isTextblock) return true;
      index++;
      if (index === line) target = pos + 1 + Math.min(column, node.content.size);
      return false;
    });
    if (target === null) return;
    const end = Math.min(target + length, editor.state.doc.content.size);
    editor.chain().focus().setTextSelection({ from: target, to: end }).scrollIntoView().run();
  }

  async function pasteImage(buffer, file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { result, error } = await window.boo.saveImage(bytes, file.type, buffer.file ?? null, buffer.key);
    if (error) {
      showMessage(error);
      return;
    }
    editorOf(buffer)?.chain().focus().setImage({ src: imageUrl(result.path), alt: 'Pasted image' }).run();
    showMessage(`Image saved as ${baseName(result.path)}`);
  }

  // ---------- Toolbar ----------

  const COLORS = [
    '#000000', '#3a3a3c', '#8e8e93', '#c7c7cc', '#ffffff', '#a2845e',
    '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#30b0c7',
    '#007aff', '#5856d6', '#af52de', '#ff2d55', '#8b0000', '#00563f',
  ];
  const HIGHLIGHTS = ['#fff3a3', '#ffe0b2', '#ffd6e7', '#e3d7ff', '#cde7ff', '#c8f7e1', '#d9f2c4', '#e5e5ea'];
  const BLOCKS = [
    { value: 'p', label: 'Normal' }, { value: 'h1', label: 'Heading 1' }, { value: 'h2', label: 'Heading 2' },
    { value: 'h3', label: 'Heading 3' }, { value: 'quote', label: 'Quote' }, { value: 'code', label: 'Code' },
  ];

  const current = () => (shown ? editorOf(shown) : null);
  const run = (fn) => () => {
    const editor = current();
    if (!editor) return;
    fn(editor.chain().focus(), editor);
  };

  function iconButton(label, title, action, { className = '', text } = {}) {
    const button = el('button', `rich-button ${className}`.trim());
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title.replace(/ \(.*\)$/, ''));
    if (text) button.textContent = text;
    else button.innerHTML = label;
    // Keep the selection in the note while clicking toolbar buttons.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', (event) => action(event.currentTarget));
    return button;
  }

  function dropdown(title, width, onOpen) {
    const button = el('button', 'rich-dropdown');
    button.type = 'button';
    button.title = title;
    button.style.setProperty('--width', `${width}px`);
    const label = el('span', 'rich-dropdown-label');
    button.append(label, el('span', 'rich-dropdown-chevron', '\u25BE'));
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => onOpen(button));
    button.setLabel = (text, fontFamily) => {
      label.textContent = text;
      label.style.fontFamily = fontFamily ? `'${fontFamily}'` : '';
    };
    return button;
  }

  const group = (...children) => {
    const node = el('div', 'rich-group');
    node.append(...children);
    return node;
  };

  async function chooseBlock(anchor) {
    const state = BooRich.formattingState(current());
    const choice = await Dialogs.menu({ anchor, items: BLOCKS.map((block) => ({ label: block.label, value: block.value, checked: block.value === state.block })) });
    if (!choice) return;
    const chain = current().chain().focus();
    if (choice === 'p') chain.setParagraph().run();
    else if (choice === 'quote') chain.setParagraph().toggleBlockquote().run();
    else if (choice === 'code') chain.toggleCodeBlock().run();
    else chain.setHeading({ level: Number(choice[1]) }).run();
  }

  async function chooseFont(anchor) {
    const state = BooRich.formattingState(current());
    const choice = await Dialogs.menu({
      anchor,
      title: 'Font',
      items: [
        { label: `Default (${DEFAULT_FONT})`, value: '', checked: !state.fontFamily },
        'separator',
        ...BooRich.FONT_FAMILIES.map((font) => ({ label: font, value: font, fontFamily: font, checked: state.fontFamily?.replace(/['"]/g, '') === font })),
      ],
    });
    if (choice === null) return;
    if (choice) current().chain().focus().setFontFamily(`'${choice}'`).run();
    else current().chain().focus().unsetFontFamily().run();
  }

  async function chooseSize(anchor) {
    const state = BooRich.formattingState(current());
    const choice = await Dialogs.menu({
      anchor,
      title: 'Size',
      items: BooRich.FONT_SIZES.map((size) => ({ label: `${size} pt`, value: size, checked: state.fontSize ? state.fontSize === `${size}pt` : size === DEFAULT_SIZE })),
    });
    if (!choice) return;
    if (choice === DEFAULT_SIZE) current().chain().focus().unsetFontSize().run();
    else current().chain().focus().setFontSize(`${choice}pt`).run();
  }

  async function chooseWeight(anchor) {
    const state = BooRich.formattingState(current());
    const choice = await Dialogs.menu({
      anchor,
      title: 'Weight',
      items: BooRich.FONT_WEIGHTS.map((weight) => ({ label: weight.label, value: weight.value, fontWeight: weight.value, checked: (state.fontWeight ?? '400') === weight.value })),
    });
    if (!choice) return;
    if (choice === '400') current().chain().focus().unsetFontWeight().run();
    else current().chain().focus().setFontWeight(choice).run();
  }

  function colorPicker(anchor, { title, colors, current: selected, onPick, clearLabel }) {
    const content = el('div', 'color-picker');
    const grid = el('div', 'color-grid');
    const clear = el('button', 'color-clear', clearLabel);
    clear.addEventListener('click', () => {
      onPick(null);
      popover.close();
    });
    for (const color of colors) {
      const swatch = el('button', 'color-swatch');
      swatch.title = color;
      swatch.style.background = color;
      swatch.setAttribute('aria-label', color);
      if (selected?.toLowerCase() === color) swatch.classList.add('selected');
      swatch.addEventListener('click', () => {
        onPick(color);
        popover.close();
      });
      grid.append(swatch);
    }
    const custom = el('label', 'color-custom', 'Custom… ');
    const input = el('input');
    input.type = 'color';
    input.value = /^#[\da-f]{6}$/i.test(selected ?? '') ? selected : '#007aff';
    input.addEventListener('change', () => {
      onPick(input.value);
      popover.close();
    });
    custom.append(input);
    content.append(el('div', 'list-header', title), clear, grid, custom);
    const popover = Dialogs.popover(anchor, content, { className: 'color-popover' });
  }

  function chooseColor(anchor) {
    const state = BooRich.formattingState(current());
    colorPicker(anchor, {
      title: 'Text Color',
      colors: COLORS,
      current: state.color,
      clearLabel: 'Automatic',
      onPick: (color) => (color ? current().chain().focus().setColor(color).run() : current().chain().focus().unsetColor().run()),
    });
  }

  function chooseHighlight(anchor) {
    const state = BooRich.formattingState(current());
    colorPicker(anchor, {
      title: 'Highlight',
      colors: HIGHLIGHTS,
      current: state.highlight,
      clearLabel: 'No Highlight',
      onPick: (color) => (color ? current().chain().focus().setHighlight({ color }).run() : current().chain().focus().unsetHighlight().run()),
    });
  }

  // Word-style table picker: hover to choose rows × columns, click to insert.
  function chooseTable(anchor) {
    const ROWS = 8;
    const COLUMNS = 10;
    const content = el('div', 'table-picker');
    const label = el('div', 'table-picker-label', 'Insert Table');
    const grid = el('div', 'table-picker-grid');
    const cells = [];
    const mark = (rows, columns) => {
      for (const cell of cells) cell.classList.toggle('on', cell.row <= rows && cell.column <= columns);
      label.textContent = rows ? `${rows} × ${columns} table` : 'Insert Table';
    };
    for (let row = 1; row <= ROWS; row++) {
      for (let column = 1; column <= COLUMNS; column++) {
        const cell = el('button', 'table-picker-cell');
        Object.assign(cell, { row, column });
        cell.setAttribute('aria-label', `${row} by ${column}`);
        cell.addEventListener('mouseenter', () => mark(row, column));
        cell.addEventListener('focus', () => mark(row, column));
        cell.addEventListener('click', () => {
          popover.close();
          current()?.chain().focus().insertTable({ rows: row, cols: column, withHeaderRow: true }).run();
        });
        cells.push(cell);
        grid.append(cell);
      }
    }
    content.append(label, grid, el('div', 'list-footer', 'Tip: tables copied from Excel, Word or a web page paste as tables.'));
    const popover = Dialogs.popover(anchor, content, { className: 'table-popover' });
  }

  // Soft tints that read well in light and dark mode, for table cells such as the
  // Eisenhower matrix's quadrants.
  const CELL_COLORS = [
    'rgba(255, 59, 48, 0.18)', 'rgba(255, 149, 0, 0.2)', 'rgba(255, 204, 0, 0.24)', 'rgba(52, 199, 89, 0.2)',
    'rgba(0, 199, 190, 0.2)', 'rgba(0, 122, 255, 0.18)', 'rgba(88, 86, 214, 0.2)', 'rgba(175, 82, 222, 0.2)',
    'rgba(255, 45, 85, 0.18)', 'rgba(162, 132, 94, 0.22)', 'rgba(142, 142, 147, 0.22)', 'rgba(0, 0, 0, 0.06)',
  ];

  const tint = (hex) => {
    const value = parseInt(hex.slice(1), 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, 0.22)`;
  };

  function chooseCellColor(anchor) {
    const state = BooRich.formattingState(current());
    colorPicker(anchor, {
      title: 'Cell Color',
      colors: CELL_COLORS,
      current: state.cellColor,
      clearLabel: 'No Color',
      onPick: (color) => current().chain().focus().setCellAttribute('backgroundColor', color && color.startsWith('#') ? tint(color) : color).run(),
    });
  }

  // ---------- Reminders ----------

  const pad = (number) => String(number).padStart(2, '0');
  const localStamp = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

  // Quick picks, then a date and time of your own.
  function reminderPicker(anchor, { at, title, onPick, extra = [] }) {
    const content = el('div', 'reminder-picker');
    const quick = el('div', 'reminder-quick');
    const now = new Date();
    const at9 = (days) => {
      const date = new Date(now);
      date.setDate(date.getDate() + days);
      date.setHours(9, 0, 0, 0);
      return date;
    };
    const monday = (() => {
      const date = at9(((8 - now.getDay()) % 7) || 7);
      return date;
    })();
    const evening = new Date(now);
    evening.setHours(18, 0, 0, 0);
    const choices = [
      ['In 1 hour', new Date(now.getTime() + 3600000)],
      ...(evening > now ? [['This evening', evening]] : []),
      ['Tomorrow morning', at9(1)],
      ['Next Monday', monday],
    ];
    for (const [label, date] of choices) {
      const button = el('button', 'reminder-choice');
      button.append(el('span', '', label), el('span', 'reminder-choice-when', BooRich.reminderLabel(localStamp(date)).slice(2)));
      button.addEventListener('click', () => {
        popover.close();
        onPick(localStamp(date));
      });
      quick.append(button);
    }
    const start = at ? new Date(at) : new Date(now.getTime() + 3600000);
    const dateInput = el('input', 'alert-input');
    dateInput.type = 'date';
    dateInput.value = localStamp(start).slice(0, 10);
    const timeInput = el('input', 'alert-input');
    timeInput.type = 'time';
    timeInput.value = localStamp(start).slice(11, 16);
    const fields = el('div', 'reminder-fields');
    fields.append(dateInput, timeInput);
    const set = el('button', 'filled-button', at ? 'Change' : 'Add Reminder');
    set.addEventListener('click', () => {
      if (!dateInput.value || !timeInput.value) return;
      popover.close();
      onPick(`${dateInput.value}T${timeInput.value}`);
    });
    content.append(el('div', 'list-header', title), quick, el('div', 'list-header', 'On a date'), fields, set);
    for (const { label, action, destructive } of extra) {
      const button = el('button', `reminder-extra${destructive ? ' destructive' : ''}`, label);
      button.addEventListener('click', () => {
        popover.close();
        action();
      });
      content.append(button);
    }
    const popover = Dialogs.popover(anchor, content, { className: 'reminder-popover' });
  }

  const newReminderId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  function addReminder(anchor) {
    reminderPicker(anchor, {
      title: 'Remind Me',
      onPick: (at) => current()?.chain().focus().insertContent([{ type: 'reminder', attrs: { at, id: newReminderId(), done: false } }, { type: 'text', text: ' ' }]).run(),
    });
  }

  // Clicking a reminder in the text: change it, mark it done, or remove it.
  function editReminder(buffer, attrs, pos, anchor) {
    const editor = editorOf(buffer);
    if (!editor || !editor.isEditable) return;
    const update = (changes) => editor.chain().focus().command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, { ...attrs, ...changes });
      return true;
    }).run();
    reminderPicker(anchor, {
      at: attrs.at,
      title: attrs.done ? 'Reminder (done)' : 'Reminder',
      onPick: (at) => update({ at, done: false }),
      extra: [
        { label: attrs.done ? 'Mark as Not Done' : 'Mark as Done', action: () => update({ done: !attrs.done }) },
        { label: 'Remove Reminder', destructive: true, action: () => editor.chain().focus().deleteRange({ from: pos, to: pos + 1 }).run() },
      ],
    });
  }

  // Marks a reminder done from Boo's alert, in an open or not-yet-opened note.
  function setReminderDone(buffer, id) {
    const editor = editorOf(buffer);
    if (!editor) return false;
    let found = null;
    editor.state.doc.descendants((node, pos) => {
      if (found === null && node.type.name === 'reminder' && node.attrs.id === id) found = { node, pos };
      return found === null;
    });
    if (!found) return false;
    editor.chain().command(({ tr }) => {
      tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, done: true });
      return true;
    }).run();
    return true;
  }

  function chooseSymbol(anchor) {
    SymbolPicker.open(anchor, (symbol) => current()?.chain().focus().insertContent(symbol).run());
  }

  const controls = {};

  function buildToolbar() {
    controls.block = dropdown('Paragraph style', 96, chooseBlock);
    controls.font = dropdown('Font', 128, chooseFont);
    controls.size = dropdown('Font size', 64, chooseSize);
    controls.weight = dropdown('Font weight', 86, chooseWeight);
    controls.bold = iconButton('', 'Bold (Ctrl+B)', run((chain) => chain.toggleBold().run()), { text: 'B', className: 'bold' });
    controls.italic = iconButton('', 'Italic (Ctrl+I)', run((chain) => chain.toggleItalic().run()), { text: 'I', className: 'italic' });
    controls.underline = iconButton('', 'Underline (Ctrl+U)', run((chain) => chain.toggleUnderline().run()), { text: 'U', className: 'underline' });
    controls.doubleUnderline = iconButton('', 'Double underline (Ctrl+Shift+D)', run((chain) => chain.toggleDoubleUnderline().run()), { text: 'U', className: 'double-underline' });
    controls.strike = iconButton('', 'Strikethrough (Ctrl+Shift+X)', run((chain) => chain.toggleStrike().run()), { text: 'S', className: 'strike' });
    controls.color = iconButton('', 'Text color', chooseColor, { text: 'A', className: 'color' });
    controls.highlight = iconButton(Icons.highlight, 'Highlight', chooseHighlight, { className: 'highlight' });
    controls.bulletList = iconButton(Icons.bullets, 'Bullet list (Ctrl+Shift+8)', run((chain) => chain.toggleBulletList().run()));
    controls.orderedList = iconButton(Icons.numbers, 'Numbered list (Ctrl+Shift+7)', run((chain) => chain.toggleOrderedList().run()));
    controls.taskList = iconButton(Icons.checklist, 'Checklist (Ctrl+Shift+9)', run((chain) => chain.toggleTaskList().run()));
    const outdent = iconButton(Icons.outdent, 'Decrease indent (Shift+Tab)', run((chain, editor) => chain.liftListItem(editor.isActive('taskItem') ? 'taskItem' : 'listItem').run()));
    const indent = iconButton(Icons.indent, 'Increase indent (Tab)', run((chain, editor) => chain.sinkListItem(editor.isActive('taskItem') ? 'taskItem' : 'listItem').run()));
    controls.align = ['left', 'center', 'right', 'justify'].map((value) => {
      const button = iconButton(Icons[`align${value[0].toUpperCase()}${value.slice(1)}`], `Align ${value}`, run((chain) => chain.setTextAlign(value).run()));
      button.dataset.align = value;
      return button;
    });
    const table = iconButton(Icons.table, 'Insert table', chooseTable);
    const symbol = iconButton('', 'Insert symbol (currency, %, arrows, math…)', chooseSymbol, { text: '\u03A9', className: 'symbol' });
    const reminder = iconButton('', 'Add a reminder', addReminder, { text: '⏰', className: 'symbol' });
    const clear = iconButton(Icons.clearFormat, 'Clear formatting', run((chain) => chain.unsetAllMarks().clearNodes().run()));
    toolbar.replaceChildren(
      group(controls.block),
      group(controls.font, controls.size, controls.weight),
      group(controls.bold, controls.italic, controls.underline, controls.doubleUnderline, controls.strike),
      group(controls.color, controls.highlight),
      group(controls.bulletList, controls.orderedList, controls.taskList, outdent, indent),
      group(...controls.align),
      group(table, symbol, reminder, clear),
    );

    const tableAction = (label, title, fn) => iconButton('', title, run(fn), { text: label, className: 'text' });
    tableBar.replaceChildren(
      el('span', 'rich-table-title', 'Table'),
      group(
        tableAction('Row Above', 'Insert a row above', (chain) => chain.addRowBefore().run()),
        tableAction('Row Below', 'Insert a row below', (chain) => chain.addRowAfter().run()),
        tableAction('Column Left', 'Insert a column to the left', (chain) => chain.addColumnBefore().run()),
        tableAction('Column Right', 'Insert a column to the right', (chain) => chain.addColumnAfter().run()),
      ),
      group(
        tableAction('Merge', 'Merge the selected cells', (chain) => chain.mergeCells().run()),
        tableAction('Split', 'Split the cell', (chain) => chain.splitCell().run()),
        tableAction('Header Row', 'Turn the header row on or off', (chain) => chain.toggleHeaderRow().run()),
        iconButton('', 'Background color of the selected cells', chooseCellColor, { text: 'Cell Color', className: 'text' }),
      ),
      group(
        tableAction('Delete Row', 'Delete the row', (chain) => chain.deleteRow().run()),
        tableAction('Delete Column', 'Delete the column', (chain) => chain.deleteColumn().run()),
        tableAction('Delete Table', 'Delete the whole table', (chain) => chain.deleteTable().run()),
      ),
    );
  }

  // Toolbar state follows the selection, updated at most once a frame.
  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      refreshToolbar();
      if (shown) showStatus();
    });
  }

  function refreshToolbar() {
    const editor = current();
    if (!editor || !window.BooRich) return;
    if (!controls.block) buildToolbar();
    const state = BooRich.formattingState(editor);
    controls.block.setLabel(BLOCKS.find((block) => block.value === state.block)?.label ?? 'Normal');
    const font = state.fontFamily?.replace(/['"]/g, '') ?? DEFAULT_FONT;
    controls.font.setLabel(font, font);
    controls.size.setLabel(state.fontSize ? state.fontSize.replace('pt', '') : String(DEFAULT_SIZE));
    controls.weight.setLabel(BooRich.FONT_WEIGHTS.find((weight) => weight.value === (state.fontWeight ?? '400'))?.label ?? 'Regular');
    for (const name of ['bold', 'italic', 'underline', 'doubleUnderline', 'strike', 'bulletList', 'orderedList', 'taskList']) {
      controls[name].setAttribute('aria-pressed', String(state[name]));
    }
    for (const button of controls.align) button.setAttribute('aria-pressed', String(button.dataset.align === state.align));
    controls.color.style.setProperty('--swatch', state.color ?? 'var(--editor-text)');
    controls.highlight.style.setProperty('--swatch', state.highlight ?? 'transparent');
    tableBar.hidden = !state.inTable || Boolean(shown?.guide);
  }

  scroller.addEventListener('scroll', () => {
    if (shown) shown.scrollTop = scroller.scrollTop;
  });

  // Ctrl+B/I/U and the rest are handled inside the editor; these stop the app's
  // own shortcuts (Ctrl+I is Incremental Find in code files) from taking over.
  return {
    loadBundle,
    isRichFile,
    parseNote,
    serialize,
    attach,
    detach,
    show,
    focus,
    editorOf,
    textOf,
    htmlOf,
    normalize,
    firstLine,
    isEmpty,
    isDirty,
    markSaved,
    wordCount,
    insertText,
    revealLine,
    imageUrl,
    setReminderDone,
  };
})();

// Symbols for rich notes: currency, percentages and math, arrows, punctuation, checks
// and shapes, Greek, units. Recently used symbols come first.
const SymbolPicker = (() => {
  const { el } = Dialogs;
  const RECENT_KEY = 'boo.recentSymbols';
  const MAX_RECENT = 16;
  const split = (text) => text.trim().split(/\s+/);
  const CATEGORIES = [
    { name: 'Currency', symbols: split('$ € £ ¥ ₹ ₱ ₩ ₽ ₺ ₪ ₫ ₦ ₴ ₸ ₭ ₮ ₲ ₵ ₡ ₣ ¢ ฿ ﷼ د.إ ر.س ₿') },
    { name: 'Math & Percent', symbols: split('% ‰ ‱ ± × ÷ = ≠ ≈ ≡ < > ≤ ≥ ∞ √ ∛ ∑ ∏ ∫ ∂ ∆ ∇ π ° ′ ″ ² ³ ¹ ½ ⅓ ⅔ ¼ ¾ ⅛ µ ∝ ∈ ∉ ∩ ∪ ⊂ ⊃ ∅ ∀ ∃ ¬ ∧ ∨') },
    { name: 'Arrows', symbols: split('→ ← ↑ ↓ ↔ ↕ ⇒ ⇐ ⇔ ⇑ ⇓ ↗ ↘ ↙ ↖ ⟶ ⟵ ↩ ↪ ⤴ ⤵ ▶ ◀ ▲ ▼ ➜ ➔') },
    { name: 'Punctuation & Legal', symbols: split('© ® ™ ℠ § ¶ † ‡ • · … – — « » ‹ › “ ” ‘ ’ „ ¡ ¿ № ℅ ※ ⁂ ‽') },
    { name: 'Checks & Shapes', symbols: split('✓ ✔ ✗ ✘ ☐ ☑ ☒ ★ ☆ ● ○ ◉ ■ □ ▪ ▫ ◆ ◇ ♦ ♥ ♠ ♣ ✦ ✧ ❖ ▸ ▹') },
    { name: 'Greek', symbols: split('α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω Α Β Γ Δ Θ Λ Π Σ Φ Ψ Ω') },
    { name: 'Units & Signs', symbols: split('℃ ℉ ℓ ㎡ ㎥ ㎏ ㎞ ㎝ ㎜ ⌀ ⌘ ⌥ ⇧ ⌃ ⏎ ⌫ ☎ ✉ ✂ ✎ ⚠ ⚡ ☀ ☁ ☂ ❄ ♪ ♫ ⚑ ⚐') },
  ];

  function recent() {
    try {
      const list = JSON.parse(localStorage.getItem(RECENT_KEY));
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function remember(symbol) {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify([symbol, ...recent().filter((item) => item !== symbol)].slice(0, MAX_RECENT)));
    } catch {
      // Recent symbols are a convenience; the picker works without them.
    }
  }

  function open(anchor, onPick) {
    const used = recent();
    const sections = used.length ? [{ name: 'Recently Used', symbols: used }, ...CATEGORIES] : CATEGORIES;
    const content = el('div', 'symbol-picker');
    for (const section of sections) {
      const grid = el('div', 'symbol-grid');
      for (const symbol of section.symbols) {
        const cell = el('button', 'symbol-cell', symbol);
        cell.title = symbol;
        cell.addEventListener('mousedown', (event) => event.preventDefault());
        cell.addEventListener('click', () => {
          remember(symbol);
          onPick(symbol);
        });
        grid.append(cell);
      }
      content.append(el('div', 'list-header', section.name), grid);
    }
    return Dialogs.popover(anchor, content, { className: 'symbol-popover' });
  }

  return { open, CATEGORIES };
})();
