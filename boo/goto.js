// Goto Anything, as in Sublime Text: one search bar at the top of the window.
// - Ctrl+P: open a file from the sidebar folders or the open tabs by typing part of
//   its name (fuzzy); add :42 to go to that line.
// - Ctrl+R (or start with @): jump to a function, class, table or heading in this tab.
// - Ctrl+G (or start with :): go to a line number.
// Symbol and line jumps preview as you move; Escape puts the cursor back.
const Goto = (() => {
  const { el } = Dialogs;
  const MAX_ITEMS = 60;

  const fileIndex = { key: null, files: [], stale: true, job: null, done: false };
  window.boo.onFolderChanged(() => {
    fileIndex.stale = true;
  });

  function ensureIndex(onUpdate) {
    const roots = Sidebar.folders();
    const key = roots.join('|');
    if (fileIndex.key === key && !fileIndex.stale) return;
    if (fileIndex.job) Jobs.stop(fileIndex.job);
    Object.assign(fileIndex, { key, files: [], stale: false, done: false });
    if (!roots.length) {
      fileIndex.done = true;
      return;
    }
    const files = [];
    fileIndex.job = Jobs.start('index', { roots }, (message) => {
      if (message.type === 'files') {
        files.push(...message.files);
        fileIndex.files = files;
        onUpdate();
      } else {
        fileIndex.job = null;
        fileIndex.done = true;
        onUpdate();
      }
    });
  }

  // Path shown for a file: relative to its sidebar folder when it's inside one.
  function displayPath(file) {
    const root = Sidebar.folders().find((dir) => isInside(file, dir));
    return root ? `${baseName(root)}${file.slice(root.length)}` : file;
  }

  function fileItems(query) {
    const [, name = query, line] = /^(.*?)(?::(\d+))?$/.exec(query) ?? [];
    const candidates = new Map();
    for (const buffer of buffers) {
      const label = buffer.file ? displayPath(buffer.file) : title(buffer);
      candidates.set(buffer.file ?? `buffer:${buffer.id}`, { label, file: buffer.file, buffer, open: true });
    }
    for (const file of fileIndex.files) if (!candidates.has(file)) candidates.set(file, { label: displayPath(file), file });
    const scored = [];
    for (const candidate of candidates.values()) {
      const match = fuzzyMatch(name.trim(), candidate.label);
      if (match) scored.push({ ...candidate, ...match, line: line ? Number(line) : undefined });
    }
    scored.sort((a, b) => b.score - a.score || Number(Boolean(b.open)) - Number(Boolean(a.open)) || a.label.length - b.label.length);
    return scored.slice(0, MAX_ITEMS);
  }

  function symbolItems(query) {
    const buffer = current();
    if (!buffer.loaded || buffer.kind !== 'text') return [];
    return BooEditor.listSymbols(view.state)
      .map((symbol) => ({ ...symbol, detail: `line ${symbol.line}`, ...fuzzyMatch(query.trim(), symbol.label) }))
      .filter((item) => item.positions)
      .sort((a, b) => (query.trim() ? b.score - a.score : 0) || a.line - b.line)
      .slice(0, MAX_ITEMS * 4);
  }

  // A filterable list in a sheet. `itemsFor(text)` returns { label, positions, detail };
  // `onMove` previews the highlighted item; resolves to the chosen item or null.
  function picker({ text = '', placeholder, itemsFor, onMove = () => {}, onCancel = () => {}, emptyText = 'No matches' }) {
    return new Promise((resolve) => {
      const content = el('div', 'goto');
      const field = el('div', 'goto-field');
      const input = el('input', 'goto-input');
      input.placeholder = placeholder;
      input.spellcheck = false;
      input.value = text;
      field.append(el('span', 'find-glass'), input);
      const list = el('div', 'goto-list');
      list.setAttribute('role', 'listbox');
      content.append(field, list);

      let items = [];
      let active = 0;
      let chosen = null;
      const sheet = Dialogs.sheet(content, {
        modal: false,
        className: 'goto-sheet',
        onClose: () => {
          if (!chosen) onCancel();
          resolve(chosen);
        },
      });

      const highlight = (index) => {
        active = Math.max(0, Math.min(index, items.length - 1));
        list.querySelectorAll('.goto-item').forEach((node, i) => node.classList.toggle('active', i === active));
        list.children[active]?.scrollIntoView({ block: 'nearest' });
        if (items[active]) onMove(items[active], input.value);
      };
      const choose = (index) => {
        if (!items[index]) return;
        chosen = items[index];
        sheet.close();
      };
      const render = () => {
        items = itemsFor(input.value);
        list.replaceChildren(...(items.length ? items.map((item, index) => {
          const row = el('div', 'goto-item');
          row.setAttribute('role', 'option');
          const label = el('span', 'goto-label');
          const nameStart = item.file ? Math.max(item.label.lastIndexOf('\\'), item.label.lastIndexOf('/')) + 1 : 0;
          if (item.file && nameStart > 0) {
            // File name first and bold, folder after it, like Sublime's list.
            const name = el('span', 'goto-name');
            name.append(highlightText(item.label.slice(nameStart), { positions: (item.positions ?? []).filter((p) => p >= nameStart).map((p) => p - nameStart) }));
            const path = el('span', 'goto-detail');
            path.append(highlightText(item.label.slice(0, nameStart - 1), { positions: (item.positions ?? []).filter((p) => p < nameStart - 1) }));
            label.append(name, path);
          } else {
            const name = el('span', 'goto-name');
            name.append(highlightText(item.label, { positions: item.positions ?? [] }));
            label.append(name);
            if (item.detail) label.append(el('span', 'goto-detail', item.detail));
          }
          row.append(label);
          if (item.open) row.append(el('span', 'goto-badge', 'Open'));
          row.addEventListener('mousemove', () => active !== index && highlight(index));
          row.addEventListener('click', () => choose(index));
          return row;
        }) : [el('div', 'goto-empty', emptyText)]));
        highlight(0);
      };
      input.addEventListener('input', render);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          highlight(active + (event.key === 'ArrowDown' ? 1 : -1));
        } else if (event.key === 'Enter') {
          event.preventDefault();
          if (items.length) choose(active);
          else if (/^:\d+/.test(input.value)) {
            chosen = { line: Number(input.value.slice(1)) };
            sheet.close();
          }
        }
      });
      render();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      picker.refresh = render;
    });
  }

  async function open(prefix = '') {
    captureEditor();
    const buffer = current();
    const editable = inCodeEditor(buffer);
    const origin = editable ? { selection: view.state.selection, scroll: BooEditor.scrollTop(view) } : null;
    const restore = () => {
      if (!origin || buffer !== current()) return;
      view.dispatch({ selection: origin.selection });
      BooEditor.setScrollTop(view, origin.scroll);
    };
    ensureIndex(() => picker.refresh?.());

    const choice = await picker({
      text: prefix,
      placeholder: 'Go to file, @symbol or :line',
      itemsFor: (text) => {
        if (text.startsWith(':')) {
          const line = Number(text.slice(1));
          if (!editable) return [];
          return line ? [{ label: `Go to line ${line.toLocaleString()}`, line, detail: `of ${view.state.doc.lines.toLocaleString()}` }] : [];
        }
        if (text.startsWith('@')) return editable ? symbolItems(text.slice(1)) : [];
        return fileItems(text);
      },
      onMove: (item, text) => {
        if (!editable || buffer !== current()) return;
        if (text.startsWith('@') && item.from !== undefined) BooEditor.selectRange(view, item.from, item.from, { focus: false });
        else if (text.startsWith(':') && item.line) BooEditor.goToLine(view, item.line, { focus: false });
      },
      onCancel: restore,
      emptyText: fileIndex.done ? 'No matches' : 'Indexing files…',
    });
    if (!choice) return;
    if (choice.buffer && !choice.file) select(buffers.indexOf(choice.buffer));
    else if (choice.file) await openPath(choice.file, { at: choice.line ? { line: choice.line, column: 0 } : undefined });
    else if (choice.line) BooEditor.goToLine(view, choice.line);
    else if (choice.from !== undefined) BooEditor.selectRange(view, choice.from);
    view.focus();
  }

  // A plain chooser using the same bar, for the syntax list.
  function pick({ placeholder, items }) {
    return picker({
      placeholder,
      itemsFor: (text) => items
        .map((item) => ({ ...item, ...fuzzyMatch(text.trim(), item.label) }))
        .filter((item) => item.positions)
        .sort((a, b) => (text.trim() ? b.score - a.score : 0))
        .slice(0, 200),
    }).then((item) => item?.value ?? null);
  }

  return { open, pick };
})();
