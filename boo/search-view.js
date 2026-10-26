// Find in Files (Ctrl+Shift+F), modelled on Sublime Text's Find in Files panel,
// with three scopes:
// - This Tab: the current tab, including unsaved text;
// - Folder: the sidebar folders (<open folders>) or the current file's folder;
// - Everywhere: every drive on the computer.
// The Where field takes Sublime's syntax: folders and files, <open folders>,
// <open files>, <current file>, include filters (*.sql) and exclude filters
// (-*.log, -node_modules/). The case, regular expression and whole word options are
// shared with the in-tab Find panel, as in Sublime. Results list each matching line
// grouped by file, like Sublime's Find Results; click one to open it there.
const SearchView = (() => {
  const { el } = Dialogs;
  const scopeControl = document.getElementById('search-scope');
  const queryInput = document.getElementById('search-query');
  const whereRow = document.getElementById('where-row');
  const whereInput = document.getElementById('search-where');
  const replaceRow = document.getElementById('replace-row');
  const replaceInput = document.getElementById('search-replace');
  const replaceToggle = document.getElementById('toggle-replace');
  const findButton = document.getElementById('search-go');
  const status = document.getElementById('search-status');
  const resultsList = document.getElementById('search-results');
  const toggles = document.getElementById('search-toggles');

  const MAX_MATCHES = 10000;
  // Larger files are skipped (and counted) so one huge file can't stall a search.
  const MAX_FILE_BYTES = { folder: 512 * 1024 * 1024, everywhere: 32 * 1024 * 1024 };
  // Skipped by default when searching everywhere: system folders that are slow and rarely wanted.
  const EVERYWHERE_EXCLUDES = ['-$Recycle.Bin/', '-System Volume Information/', '-Windows/', '-node_modules/'];
  const OPTIONS = [
    { key: 'caseSensitive', label: 'Aa', title: 'Case sensitive' },
    { key: 'regex', label: '.*', title: 'Regular expression' },
    { key: 'wholeWord', label: 'Word', title: 'Whole word' },
  ];

  let scope = 'folder';
  let where = { folder: '', everywhere: '' };
  let replaceOpen = false;
  let job = null;
  let pending = [];
  let flushQueued = false;
  let summary = null;

  const findOptions = () => {
    const { caseSensitive, regex, wholeWord, preserveCase } = BooEditor.find.findState;
    return { caseSensitive, regex, wholeWord, preserveCase };
  };

  function defaultWhere(target) {
    if (target === 'folder') {
      if (Sidebar.folders().length) return '<open folders>';
      return current()?.file ? dirName(current().file) : '';
    }
    return '';
  }

  async function everywhereWhere() {
    const drives = await window.boo.drives();
    return [...drives, ...EVERYWHERE_EXCLUDES].join(', ');
  }

  function renderToggles() {
    const state = BooEditor.find.findState;
    toggles.replaceChildren(...OPTIONS.map((option) => {
      const button = el('button', 'find-toggle', option.label);
      button.title = option.title;
      button.setAttribute('aria-pressed', String(state[option.key]));
      button.addEventListener('click', () => {
        state[option.key] = !state[option.key];
        renderToggles();
        scheduleAutosave();
      });
      return button;
    }));
  }

  async function setScope(next) {
    scope = next;
    for (const button of scopeControl.querySelectorAll('.segment')) {
      button.setAttribute('aria-checked', String(button.dataset.scope === scope));
    }
    whereRow.hidden = scope === 'tab';
    replaceToggle.hidden = scope === 'everywhere';
    replaceRow.hidden = !replaceOpen || scope === 'everywhere';
    if (scope !== 'tab') {
      if (!where[scope]) where[scope] = scope === 'everywhere' ? await everywhereWhere() : defaultWhere(scope);
      whereInput.value = where[scope];
    }
    scheduleAutosave();
  }

  // `scope` picks This Tab, Folder or Everywhere (Ctrl+F in a rich note opens This Tab).
  function open({ scope: startScope } = {}) {
    showSidebarView('search');
    if (startScope) setScope(startScope);
    const buffer = current();
    let text = '';
    if (buffer?.loaded && buffer.kind === 'text') {
      const main = view.state.selection.main;
      text = view.state.sliceDoc(main.from, main.to);
    } else if (buffer?.loaded && isRich(buffer)) {
      const { state } = RichNotes.editorOf(buffer);
      text = state.doc.textBetween(state.selection.from, state.selection.to, '\n');
    }
    if (text && !text.includes('\n')) queryInput.value = text;
    queryInput.focus();
    queryInput.select();
  }

  // ---------- Results ----------

  function fileSection(file, label, count) {
    const section = el('div', 'result-file');
    const header = el('div', 'result-header');
    header.title = file ?? label;
    const icon = el('span', 'row-icon file');
    icon.innerHTML = Icons.doc;
    const name = el('span', 'result-name', file ? baseName(file) : label);
    const dir = el('span', 'result-dir', file ? dirName(file) : 'Unsaved');
    const badge = el('span', 'result-count', count.toLocaleString());
    header.append(icon, name, dir, badge);
    header.addEventListener('click', () => section.classList.toggle('collapsed'));
    section.append(header);
    return section;
  }

  function lineRow(entry, onOpen) {
    const row = el('div', 'result-line');
    row.tabIndex = -1;
    const number = el('span', 'result-number', entry.line.toLocaleString());
    const text = el('span', 'result-text');
    const lead = entry.previewOffset > 0 ? '…' : '';
    const shift = lead.length;
    text.append(highlightText(lead + entry.preview, { ranges: entry.ranges.map(([start, end]) => [start + shift, end + shift]) }));
    row.append(number, text);
    row.addEventListener('click', () => {
      for (const other of resultsList.querySelectorAll('.result-line.selected')) other.classList.remove('selected');
      row.classList.add('selected');
      onOpen(false);
    });
    row.addEventListener('dblclick', () => onOpen(true));
    return row;
  }

  function addFileResult({ file, buffer, lines, count }) {
    const section = fileSection(file, buffer ? title(buffer) : '', count);
    for (const entry of lines) {
      section.append(lineRow(entry, (keep) => {
        if (buffer && !file) {
          const index = buffers.indexOf(buffer);
          if (index === -1) return;
          select(index);
          revealMatch(isRich(buffer) ? { line: entry.line, column: entry.column, length: entry.length } : { from: entry.from, to: entry.from + entry.length });
        } else {
          openPath(file, { preview: !keep && settings.previewOnClick, at: { line: entry.line, column: entry.column, length: entry.length } });
        }
      }));
    }
    resultsList.append(section);
  }

  function flushResults() {
    flushQueued = false;
    for (const item of pending) addFileResult(item);
    pending = [];
  }

  // Results are drawn once per frame while a search runs, and all at once when it ends
  // (frames pause while the window is hidden).
  function queueResult(result) {
    pending.push(result);
    if (flushQueued) return;
    flushQueued = true;
    requestAnimationFrame(() => {
      if (flushQueued) flushResults();
    });
  }

  function setStatus(text, { searching = false, error = false } = {}) {
    status.replaceChildren();
    status.classList.toggle('error', error);
    if (!text) return;
    status.append(el('span', 'search-status-text', text));
    if (searching) {
      const stop = el('button', 'text-button', 'Stop');
      stop.addEventListener('click', stopSearch);
      status.append(stop);
    }
  }

  function describe(stats, stopped) {
    const parts = [`${stats.matches.toLocaleString()} match${stats.matches === 1 ? '' : 'es'} in ${stats.files.toLocaleString()} file${stats.files === 1 ? '' : 's'}`];
    if (stats.searched !== undefined) parts.push(`${stats.searched.toLocaleString()} searched`);
    if (stats.skippedLarge) parts.push(`${stats.skippedLarge.toLocaleString()} too large skipped`);
    if (stats.truncated) parts.push(`stopped at ${MAX_MATCHES.toLocaleString()} matches`);
    if (stopped) parts.push('stopped');
    return parts.join(' · ');
  }

  function stopSearch() {
    if (job) Jobs.stop(job);
  }

  // ---------- Searching ----------

  // A rich note is searched as its text, one line per paragraph, heading, item or cell.
  function searchBuffer(buffer, re) {
    if (!buffer.loaded || !(buffer.kind === 'text' || isRich(buffer))) return null;
    const text = isRich(buffer) ? RichNotes.textOf(buffer)
      : buffer === current() ? view.state.doc.toString() : buffer.state.doc.toString();
    const result = BooEditor.searchCore.searchText(text, new RegExp(re.source, re.flags), MAX_MATCHES);
    return result.count ? { file: buffer.file, buffer, ...result } : null;
  }

  async function run() {
    stopSearch();
    captureEditor();
    resultsList.replaceChildren();
    pending = [];
    const query = queryInput.value;
    let re;
    try {
      re = BooEditor.searchCore.compileQuery({ query, ...findOptions() });
    } catch (error) {
      setStatus(error.message, { error: true });
      return;
    }
    BooEditor.find.findState.query = query;
    scheduleAutosave();

    if (scope === 'tab') {
      // Even a saved rich note is searched in the editor, so results match what's shown.
      const result = searchBuffer(current(), re);
      if (result) addFileResult(result);
      summary = { matches: result?.count ?? 0, files: result ? 1 : 0 };
      setStatus(current().loaded ? describe(summary) : 'Wait for the file to finish loading.');
      return;
    }

    where[scope] = whereInput.value;
    const context = {
      openFolders: Sidebar.folders(),
      openFiles: buffers.filter((buffer) => buffer.file).map((buffer) => buffer.file),
      currentFile: current()?.file ?? null,
    };
    const parsed = BooEditor.searchCore.parseWhere(whereInput.value, context);
    // Open files are searched in the editor, so unsaved changes count, as in Sublime.
    const openFiles = new Set(parsed.files);
    let matches = 0;
    let files = 0;
    for (const buffer of buffers) {
      if (!buffer.file || !openFiles.has(buffer.file) || !buffer.loaded) continue;
      openFiles.delete(buffer.file);
      const result = searchBuffer(buffer, re);
      if (!result) continue;
      matches += result.count;
      files++;
      queueResult(result);
    }
    if (!parsed.paths.length && !openFiles.size) {
      flushResults();
      summary = { matches, files };
      setStatus(matches ? describe(summary) : 'Add a folder to Where, or use <open folders> after adding folders to the sidebar.');
      return;
    }
    setStatus('Searching…', { searching: true });
    const startedAt = performance.now();
    job = Jobs.start('search', {
      query,
      options: findOptions(),
      where: { ...parsed, files: [...openFiles] },
      maxFileBytes: MAX_FILE_BYTES[scope],
      maxMatches: MAX_MATCHES,
    }, (message) => {
      if (message.type === 'file') {
        queueResult(message);
      } else if (message.type === 'progress') {
        setStatus(`Searching… ${message.searched.toLocaleString()} files · ${message.matches + matches} matches`, { searching: true });
      } else if (message.type === 'error') {
        job = null;
        setStatus(message.message, { error: true });
      } else if (message.type === 'done' || message.type === 'stopped') {
        job = null;
        flushResults();
        const stats = message.type === 'done' ? message : { matches: 0, files: 0 };
        summary = { ...stats, matches: stats.matches + matches, files: stats.files + files };
        const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
        setStatus(`${describe(summary, message.type === 'stopped')} · ${seconds} s`);
      }
    });
  }

  // Replace in Files, as Sublime does it: matching files are opened with the
  // replacements made but not saved, so they can be reviewed before saving.
  async function replaceInFiles() {
    const sections = [...resultsList.querySelectorAll('.result-file')];
    if (!summary?.matches || !sections.length) {
      setStatus('Find first, then replace the matches.', { error: true });
      return;
    }
    const options = { query: queryInput.value, replace: replaceInput.value, ...findOptions() };
    const fileCount = scope === 'tab' ? 1 : summary.files;
    const confirmed = await Dialogs.alert({
      title: `Replace ${summary.matches.toLocaleString()} match${summary.matches === 1 ? '' : 'es'}?`,
      message: scope === 'tab'
        ? `“${queryInput.value}” will be replaced with “${replaceInput.value}” in this tab.`
        : `${fileCount.toLocaleString()} file${fileCount === 1 ? '' : 's'} will open with the changes made but not saved, so you can review them first.`,
      buttons: [
        { label: 'Cancel', value: false, role: 'cancel' },
        { label: 'Replace', value: true, role: 'default' },
      ],
    });
    if (!confirmed) return;

    const targets = scope === 'tab'
      ? [current()]
      : sections.map((section) => section.querySelector('.result-header').title);
    let replaced = 0;
    for (const target of targets) {
      const buffer = typeof target === 'string'
        ? buffers.find((item) => item.file === target || (!item.file && title(item) === target)) ?? await openPath(target)
        : target;
      if (!buffer) continue;
      await ensureLoaded(buffer);
      if (!buffer.loaded || buffer.kind !== 'text') continue;
      if (buffer === current()) captureEditor();
      const { spec, count } = BooEditor.find.replaceAllSpec(buffer.state, options);
      if (!spec) continue;
      if (buffer === current()) view.dispatch(spec);
      else {
        buffer.state = buffer.state.update(spec).state;
        buffer.dirty = true;
      }
      replaced += count;
    }
    renderTabs();
    scheduleAutosave();
    setStatus(`Replaced ${replaced.toLocaleString()} match${replaced === 1 ? '' : 'es'}. Review the tabs, then save them.`);
  }

  // Sublime's Where menu: snippets to add to the field.
  async function showWhereMenu(anchor) {
    const choice = await Dialogs.menu({
      anchor,
      title: 'Add to Where',
      items: [
        { label: 'Add Folder…', value: 'folder', icon: 'newFolder' },
        { label: 'Add Include Filter (*.txt)', value: '*.txt' },
        { label: 'Add Exclude Filter (-*.log)', value: '-*.log' },
        { label: 'Add Open Folders', value: '<open folders>' },
        { label: 'Add Open Files', value: '<open files>' },
        { label: 'Add Current File', value: '<current file>' },
        'separator',
        { label: 'Clear', value: 'clear', destructive: true },
      ],
    });
    if (!choice) return;
    let addition = choice;
    if (choice === 'clear') {
      whereInput.value = '';
    } else {
      if (choice === 'folder') {
        const folders = await window.boo.pickFolders();
        if (!folders.length) return;
        addition = folders.join(', ');
      }
      whereInput.value = [whereInput.value.trim(), addition].filter(Boolean).join(', ');
    }
    where[scope] = whereInput.value;
    whereInput.focus();
    scheduleAutosave();
  }

  scopeControl.addEventListener('click', (event) => {
    const button = event.target.closest('.segment');
    if (button) setScope(button.dataset.scope);
  });
  findButton.addEventListener('click', run);
  for (const input of [queryInput, whereInput, replaceInput]) {
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (input === replaceInput && event.ctrlKey && event.altKey) replaceInFiles();
      else run();
    });
  }
  whereInput.addEventListener('input', () => {
    where[scope] = whereInput.value;
    scheduleAutosave();
  });
  replaceToggle.addEventListener('click', () => {
    replaceOpen = !replaceOpen;
    replaceToggle.setAttribute('aria-expanded', String(replaceOpen));
    replaceRow.hidden = !replaceOpen;
    if (replaceOpen) replaceInput.focus();
  });
  document.getElementById('replace-in-files').addEventListener('click', replaceInFiles);
  document.getElementById('where-menu').addEventListener('click', (event) => showWhereMenu(event.currentTarget));

  function init(saved = {}) {
    queryInput.value = saved.query ?? '';
    replaceInput.value = saved.replace ?? '';
    where = { folder: '', everywhere: '', ...saved.where };
    renderToggles();
    // Android has no folders to search, only the open notes.
    setScope(window.boo.platform === 'android' ? 'tab' : (saved.scope ?? 'folder'));
  }

  return {
    init,
    open,
    run,
    renderToggles,
    state: () => ({ scope, query: queryInput.value, replace: replaceInput.value, where }),
  };
})();
