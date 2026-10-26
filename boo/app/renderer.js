const editorHost = document.getElementById('editor-host');
const imageView = document.getElementById('image-view');
const image = document.getElementById('image');
const loadingView = document.getElementById('loading-view');
const layout = document.getElementById('layout');
const tabBar = document.getElementById('tabs');
const statusText = document.getElementById('status-text');
const cursorPosition = document.getElementById('cursor-position');
const languageButton = document.getElementById('language');
const encodingButton = document.getElementById('encoding');
const lineEndingButton = document.getElementById('line-ending');

// Wait this long after the last change before writing the autosave session;
// longer when a very large unsaved note has to be written too.
const AUTOSAVE_DELAY_MS = 1000;
const LARGE_AUTOSAVE_DELAY_MS = 10000;
// Unsaved text up to this many characters goes in the session file itself; more
// goes to a side file, as the session JSON would get slow to write.
const INLINE_TEXT_LIMIT = 4 * 1024 * 1024;
// Ctrl+K then a second key: Ctrl+B toggles the sidebar, Ctrl+D skips an occurrence.
const CHORD_TIMEOUT_MS = 1500;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 640;
const MESSAGE_MS = 4000;
// Same lists as file-codec.js, which the page cannot load directly.
const ENCODINGS = ['UTF-8', 'UTF-8 with BOM', 'UTF-16 LE', 'UTF-16 BE', 'Western (Windows 1252)'];
const LINE_ENDINGS = ['Windows', 'Unix', 'Mac OS 9'];
const DEFAULT_LINE_ENDING = navigator.userAgent.includes('Windows') ? 'Windows' : 'Unix';
const DEFAULT_SETTINGS = { lineNumbers: true, previewOnClick: true, theme: 'system', booWalks: Boo.defaultWalking, editorTheme: 'xcode', fontSize: 14, richNotes: true, remindLead: 15, keepInTray: true };
const DEFAULT_SIDEBAR = { visible: true, width: 300, view: 'folders' };

// One buffer per tab, mirroring a Sublime session buffer. `kind` is 'text',
// 'image' or 'binary' (read-only hex). A tab restored from the session keeps its
// saved `record` and is only read from disk when first shown (`loaded`).
let buffers = [];
let selected = 0;
let nextId = 1;
let autosaveTimer = null;
let autosaving = null;
let chordStartedAt = 0;
let messageTimer = null;
// The tab whose text is in the editor; its live text is view.state, not buffer.state.
let viewBuffer = null;
let wordCountTimer = null;
const WORD_COUNT_DELAY_MS = 300;
let settings = { ...DEFAULT_SETTINGS };
let sidebarLayout = { ...DEFAULT_SIDEBAR };

const view = BooEditor.createEditor(editorHost, {
  onUpdate: handleEditorUpdate,
  onTagClick: (tag) => {
    showSidebarView('tags');
    TagsView.show(tag);
  },
  onPasteImage: (file) => pasteImage(file),
  onImageClick: (file) => openPath(file),
});

function newBuffer(fields = {}) {
  const id = nextId++;
  return {
    key: `${Date.now().toString(36)}${id}`,
    kind: 'text',
    dirty: false,
    selection: [0, 0],
    scrollTop: 0,
    loaded: false,
    languageAuto: true,
    ...fields,
    id,
  };
}

function emptyBuffer(fields = {}) {
  const buffer = newBuffer({ ...fields, loaded: true, language: BooEditor.PLAIN_TEXT });
  buffer.state = BooEditor.createState({ lineNumbers: settings.lineNumbers });
  return buffer;
}

// A new note: rich text (formatted, like Word) unless Settings says plain text.
// A rich note's editor loads when the tab is first shown.
function newNote(fields = {}, { rich = settings.richNotes } = {}) {
  if (!rich) return emptyBuffer(fields);
  return newBuffer({ ...fields, kind: 'rich', record: { kind: 'rich', contents: fields.contents ?? '' } });
}

// Called whenever a rich note's text changes.
function richChanged(buffer) {
  buffer.editedAt = Date.now();
  buffer.dirty = RichNotes.isDirty(buffer);
  buffer.preview = false;
  buffer.notice = undefined;
  if (buffer !== current()) return;
  updateActiveTab();
  showStatus();
  scheduleAutosave();
}

// A plain-text view of a string, for writing a rich note with writeDocument.
const textDocument = (text) => ({ length: text.length, sliceString: (from, to) => text.slice(from, to) });

// A pasted screenshot or image: saved as a file (beside the note, or with Boo's data
// until an unsaved note is saved) and linked on a line of its own, where the editor
// shows it inline.
async function pasteImage(file) {
  const buffer = current();
  if (!buffer?.loaded || view.state.readOnly) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { result, error } = await window.boo.saveImage(bytes, file.type, buffer.file ?? null, buffer.key);
  if (error) {
    showMessage(error);
    return;
  }
  if (buffer !== current()) return;
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const before = from > line.from ? '\n' : '';
  BooEditor.insertText(view, `${before}![Pasted image](${result.link})\n`);
  showMessage(`Image saved as ${baseName(result.path)}`);
}

// When an unsaved note is first saved, the images waiting in Boo's data folder move
// beside the file and the note's links are rewritten to point there.
async function adoptImages(buffer, target) {
  const text = buffer.state.doc.length <= 1_000_000 ? buffer.state.doc.toString() : '';
  if (!text.includes('![')) return;
  const { result: replacements = [], error } = await window.boo.adoptImages(text, target);
  if (error) throw new Error(error);
  if (!replacements.length) return;
  const changes = [];
  for (const [oldLink, newLink] of replacements) {
    for (let index = text.indexOf(oldLink); index !== -1; index = text.indexOf(oldLink, index + oldLink.length)) {
      changes.push({ from: index, to: index + oldLink.length, insert: newLink });
    }
  }
  changes.sort((a, b) => a.from - b.from);
  if (buffer === current()) {
    view.dispatch({ changes });
    captureEditor();
  } else {
    buffer.state = buffer.state.update({ changes }).state;
  }
}

// A new unsaved note in a tab of its own (or in place of an empty untitled tab):
// rich text from `html` (templates), or a blank note of the chosen kind.
// The Boo Guide, read-only, in a tab of its own; clicking the logo again shows it.
function guideBuffer() {
  return newBuffer({ kind: 'rich', guide: true, notice: 'Boo Guide · read-only. Click the Boo logo at the top left to open it again.', record: { kind: 'rich', contents: Guide.HTML } });
}

async function openGuide() {
  const open = buffers.findIndex((buffer) => buffer.guide);
  if (open !== -1) return select(open);
  const buffer = guideBuffer();
  addBuffer(buffer);
  await ensureLoaded(buffer);
}

async function openNewNote({ html, rich = settings.richNotes } = {}) {
  const buffer = html === undefined ? newNote({}, { rich }) : newBuffer({ kind: 'rich', dirty: true, record: { kind: 'rich', contents: html } });
  if (isEmptyUntitled(current())) {
    captureEditor();
    if (current().kind === 'rich') RichNotes.detach(current());
    buffers[selected] = buffer;
    showBuffer();
    renderTabs();
    scheduleAutosave();
  } else {
    addBuffer(buffer);
  }
  await ensureLoaded(buffer);
  if (!document.getElementById('tags-view').hidden) TagsView.refresh();
}

const current = () => buffers[selected];
const isText = (buffer) => !buffer.kind || buffer.kind === 'text';
const isRich = (buffer) => buffer?.kind === 'rich';
// Tabs shown in the code/text editor (plain text and hex).
const inCodeEditor = (buffer) => buffer?.loaded && (isText(buffer) || buffer.kind === 'binary');
const baseName = (file) => file.split(/[\\/]/).pop();
const dirName = (file) => file.replace(/[\\/][^\\/]*$/, '');
const isInside = (target, dir) => target === dir || target.startsWith(`${dir}\\`) || target.startsWith(`${dir}/`);

// Untitled notes are named after their first line, as Sublime does.
// A note that sync kept from another device, when both changed it, says so in its tab.
const CONFLICT_LABEL = ' (from another device)';

function title(buffer) {
  return baseTitle(buffer) + (buffer.conflict ? CONFLICT_LABEL : '');
}

function baseTitle(buffer) {
  if (buffer.file) return baseName(buffer.file);
  if (buffer.guide) return Guide.TITLE;
  if (isRich(buffer)) return (buffer.loaded ? RichNotes.firstLine(buffer) : buffer.title ?? '').slice(0, 40) || 'untitled';
  const state = buffer === viewBuffer ? view.state : buffer.state;
  const firstLine = state ? BooEditor.firstLine(state) : (buffer.title ?? '');
  // A Markdown heading's #s aren't part of the name, and an image link reads as its caption.
  const name = firstLine.replace(/^\s*#+\s+/, '').replace(/^\s*!\[([^\]]*)\]\(.*$/, (_all, alt) => alt || 'Image');
  return name.trim().slice(0, 40) || 'untitled';
}

function showMessage(text) {
  statusText.textContent = text;
  statusText.classList.add('message');
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    statusText.classList.remove('message');
    showStatus();
  }, MESSAGE_MS);
}

// ---------- Showing a tab ----------

function captureEditor() {
  const buffer = current();
  if (!inCodeEditor(buffer) || !buffer.state) return;
  buffer.state = view.state;
  buffer.scrollTop = BooEditor.scrollTop(view);
}

function showBuffer() {
  const buffer = current();
  const rich = buffer.loaded && isRich(buffer);
  imageView.hidden = !(buffer.loaded && buffer.kind === 'image');
  loadingView.hidden = buffer.loaded;
  editorHost.hidden = !inCodeEditor(buffer);
  if (!rich) RichNotes.show(null);
  if (!buffer.loaded) {
    renderLoading(buffer);
    ensureLoaded(buffer);
  } else if (buffer.kind === 'image') {
    image.src = buffer.dataUrl;
    image.alt = title(buffer);
  } else if (rich) {
    image.removeAttribute('src');
    RichNotes.show(buffer);
    if (!Dialogs.isOpen() && !document.activeElement?.closest('#sidebar')) RichNotes.focus(buffer);
  } else {
    image.removeAttribute('src');
    view.setState(buffer.state);
    viewBuffer = buffer;
    BooEditor.setLineNumbers(view, settings.lineNumbers && buffer.kind !== 'binary');
    requestAnimationFrame(() => BooEditor.setScrollTop(view, buffer.scrollTop));
    if (!Dialogs.isOpen() && !document.activeElement?.closest('#sidebar')) view.focus();
  }
  showStatus();
}

function renderLoading(buffer) {
  const { loaded = 0, total = 0 } = buffer.progress ?? {};
  const fraction = total ? loaded / total : 0;
  document.getElementById('loading-title').textContent = `Opening ${title(buffer)}`;
  document.getElementById('loading-bar').style.transform = `scaleX(${fraction})`;
  document.getElementById('loading-detail').textContent = total
    ? `${Math.round(fraction * 100)}% · ${formatBytes(loaded)} of ${formatBytes(total)}`
    : 'Starting…';
}

function formatBytes(bytes) {
  const units = ['bytes', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit && value < 10 ? 1 : 0)} ${units[unit]}`;
}

// Reads a tab's text in the background, like Sublime's view.is_loading(): the tab
// is usable (and closable) while its file streams in, with progress shown.
async function ensureLoaded(buffer) {
  if (buffer.loaded || buffer.loading) return buffer.loading;
  buffer.loading = (async () => {
    const record = buffer.record ?? {};
    let lines;
    let meta = {};
    if (record.contents !== undefined) {
      lines = record.contents.split('\n');
    } else if (record.contentsFile || buffer.file) {
      const source = record.contentsFile ?? buffer.file;
      const result = await Loader.load(source, {
        onStart: (id) => { buffer.loadId = id; },
        onProgress: (loaded, total) => {
          buffer.progress = { loaded, total };
          if (buffer === current()) renderLoading(buffer);
          renderTabs();
        },
      });
      if (result.error || result.cancelled) {
        closeBuffer(buffers.indexOf(buffer), { force: true });
        if (result.error) Dialogs.alert({ title: 'Unable to Open File', message: `“${title(buffer)}” could not be read. ${result.error}` });
        return;
      }
      lines = result.lines;
      // A side file holds unsaved text; the tab keeps the original file's details.
      if (!record.contentsFile) meta = result.meta;
    } else {
      lines = [''];
    }
    Object.assign(buffer, {
      kind: meta.kind ?? record.kind ?? buffer.kind,
      encoding: meta.encoding ?? record.encoding ?? buffer.encoding,
      lineEnding: meta.lineEnding ?? record.lineEnding ?? buffer.lineEnding,
      fileSize: meta.fileSize ?? record.fileSize ?? buffer.fileSize,
      fileMtimeMs: meta.fileMtimeMs ?? record.fileMtimeMs ?? buffer.fileMtimeMs,
      dataUrl: meta.dataUrl,
      notice: meta.notice ?? buffer.notice,
    });
    // A rich note: one restored from the session, or an .html file Boo saved.
    const richNote = record.kind === 'rich'
      || (buffer.kind === 'text' && RichNotes.isRichFile(buffer.file, lines.slice(0, 60).join('\n')));
    if (richNote) {
      buffer.kind = 'rich';
      const html = record.contents !== undefined || record.contentsFile ? lines.join('\n') : RichNotes.parseNote(lines.join('\n'), buffer.file);
      try {
        await RichNotes.attach(buffer, html, richChanged);
      } catch (error) {
        closeBuffer(buffers.indexOf(buffer), { force: true });
        Dialogs.alert({ title: 'Unable to Open Note', message: error.message });
        return;
      }
    } else if (buffer.kind !== 'image') {
      if (buffer.languageAuto || !buffer.language) {
        buffer.language = buffer.kind === 'binary' ? 'Hexadecimal' : BooEditor.detectLanguage(buffer.file, lines[0]);
      }
      await BooEditor.ensureLanguage(buffer.language);
      buffer.state = BooEditor.createState({
        doc: lines,
        language: buffer.language,
        readOnly: buffer.kind === 'binary',
        lineNumbers: settings.lineNumbers,
        selection: buffer.selection,
        imageDir: buffer.file ? dirName(buffer.file) : null,
      });
    }
    buffer.loaded = true;
    buffer.record = undefined;
    buffer.progress = undefined;
    if (record.contentsFile && buffer.state) {
      buffer.sidecarFile = record.contentsFile;
      buffer.sidecarDoc = buffer.state.doc;
    }
    if (buffer === current()) showBuffer();
  })();
  try {
    await buffer.loading;
  } finally {
    buffer.loading = null;
    renderTabs();
  }
}

function showStatus() {
  const buffer = current();
  if (!buffer) return;
  if (!statusText.classList.contains('message')) {
    statusText.textContent = buffer.notice
      ?? (buffer.file ? `${buffer.file}${buffer.fileMtimeMs ? ` · Modified ${Sidebar.fullDate(buffer.fileMtimeMs)}` : ''}` : null)
      ?? 'Unsaved note · kept automatically, even after you quit or the app crashes';
  }
  const textual = buffer.loaded && buffer.kind !== 'image' && !isRich(buffer);
  languageButton.hidden = !textual || buffer.kind === 'binary';
  languageButton.textContent = buffer.language ?? BooEditor.PLAIN_TEXT;
  encodingButton.hidden = !textual;
  encodingButton.disabled = !isText(buffer);
  encodingButton.textContent = buffer.kind === 'binary' ? 'Hexadecimal' : buffer.encoding ?? 'UTF-8';
  lineEndingButton.hidden = !textual || !isText(buffer);
  lineEndingButton.textContent = buffer.lineEnding ?? DEFAULT_LINE_ENDING;
  document.title = `${title(buffer)} — Boo`;
  updateCursor();
}

function updateCursor() {
  const buffer = current();
  if (buffer?.loaded && isRich(buffer)) {
    // Counting means reading the whole note, so it waits for a pause in typing.
    clearTimeout(wordCountTimer);
    wordCountTimer = setTimeout(() => {
      if (current() !== buffer || !buffer.loaded) return;
      const words = RichNotes.wordCount(buffer);
      cursorPosition.textContent = `${words.toLocaleString()} word${words === 1 ? '' : 's'}`;
    }, WORD_COUNT_DELAY_MS);
    return;
  }
  if (!buffer?.loaded || buffer.kind === 'image' || !isText(buffer)) {
    cursorPosition.textContent = '';
    return;
  }
  const { line, column, selections, selected: chars } = BooEditor.cursorInfo(view.state);
  cursorPosition.textContent = selections > 1
    ? `${selections.toLocaleString()} selections`
    : `Line ${line.toLocaleString()}, Column ${column}${chars ? ` · ${chars.toLocaleString()} selected` : ''}`;
}

function handleEditorUpdate(update) {
  const buffer = current();
  if (!buffer?.loaded || update.state !== view.state) return;
  if (update.docChanged) {
    // When you last changed it (sync uses this to tell which device's edit is newer).
    if (!Sync.applying) buffer.editedAt = Date.now();
    buffer.dirty = true;
    buffer.preview = false;
    buffer.notice = undefined;
    // An untitled note is re-checked for a first-line syntax (#!, <?php, SELECT ...).
    if (!buffer.file && buffer.languageAuto && update.changes.touchesRange(0, update.state.doc.line(1).to)) {
      const language = BooEditor.detectLanguage(null, BooEditor.firstLine(update.state));
      if (language !== buffer.language) {
        buffer.language = language;
        BooEditor.setLanguage(view, language).then(showStatus);
      }
    }
    updateActiveTab();
    showStatus();
    scheduleAutosave();
  } else if (update.selectionSet) {
    updateCursor();
    scheduleAutosave();
  }
}

// While typing, only the current tab's name and unsaved dot can change; rebuilding
// every tab on each keystroke would cost a layout pass.
function updateActiveTab() {
  const tab = tabBar.children[selected];
  const buffer = current();
  if (!tab || !buffer) return renderTabs();
  const name = title(buffer);
  const label = tab.querySelector('.title');
  if (label.textContent !== name) {
    label.textContent = name;
    if (!buffer.file) tab.title = name;
  }
  tab.classList.toggle('dirty', buffer.dirty);
  tab.classList.toggle('preview', Boolean(buffer.preview));
}

function renderTabs() {
  tabBar.replaceChildren(...buffers.map((buffer, index) => {
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.classList.toggle('active', index === selected);
    tab.classList.toggle('dirty', buffer.dirty);
    tab.classList.toggle('preview', Boolean(buffer.preview));
    tab.classList.toggle('loading', Boolean(buffer.loading));
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(index === selected));
    tab.title = buffer.file ?? title(buffer);

    const label = document.createElement('span');
    label.className = 'title';
    label.textContent = title(buffer);

    const close = document.createElement('button');
    close.className = 'close';
    close.title = 'Close tab (Ctrl+W)';
    close.setAttribute('aria-label', `Close ${title(buffer)}`);
    close.innerHTML = Icons.close;
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      closeBuffer(index);
    });

    tab.append(label, close);
    tab.addEventListener('click', () => select(index));
    // Double-clicking a preview tab keeps it, as in Sublime.
    tab.addEventListener('dblclick', () => {
      buffer.preview = false;
      renderTabs();
      scheduleAutosave();
    });
    return tab;
  }));
  tabBar.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function select(index) {
  if (index === selected && current()?.loaded) return;
  captureEditor();
  selected = index;
  showBuffer();
  renderTabs();
  if (current().file) Sidebar.reveal(current().file);
  scheduleAutosave();
}

function addBuffer(buffer) {
  captureEditor();
  buffers.push(buffer);
  selected = buffers.length - 1;
  showBuffer();
  renderTabs();
  scheduleAutosave();
}

function isEmptyUntitled(buffer) {
  if (!buffer?.loaded || buffer.file || buffer.dirty) return false;
  return isRich(buffer) ? RichNotes.isEmpty(buffer) : buffer.state?.doc.length === 0;
}

async function closeBuffer(index, { force = false, fromSync = false } = {}) {
  captureEditor();
  const buffer = buffers[index];
  if (!buffer) return;
  const hasText = isRich(buffer) ? buffer.loaded && !RichNotes.isEmpty(buffer) : buffer.state?.doc.length;
  if (!force && buffer.dirty && hasText) {
    const discard = await Dialogs.alert({
      title: `Close “${title(buffer)}” without saving?`,
      message: 'Your changes to this note will be lost.',
      buttons: [
        { label: 'Cancel', value: false, role: 'cancel' },
        { label: 'Discard', value: true, role: 'destructive' },
      ],
    });
    if (!discard) return;
  }
  if (buffer.loadId) Loader.cancel(buffer.loadId);
  // Tabs may have moved while the alert was open.
  const position = buffers.indexOf(buffer);
  if (position === -1) return;
  buffers.splice(position, 1);
  if (!fromSync) Sync.noteClosed(buffer);
  if (isRich(buffer)) RichNotes.detach(buffer);
  if (buffers.length === 0) buffers.push(newNote());
  if (position < selected) selected--;
  selected = Math.min(selected, buffers.length - 1);
  showBuffer();
  renderTabs();
  scheduleAutosave();
}

// ---------- Opening files ----------

// Opens a file from the sidebar, a search result, a dialog or a drop. A preview
// replaces the previous preview tab instead of adding another, like Sublime's
// preview_on_click. `at` selects { line, column, length } or { from, to } once loaded.
async function openPath(file, { preview = false, at } = {}) {
  let index = buffers.findIndex((buffer) => buffer.file === file);
  if (index !== -1) {
    if (!preview) buffers[index].preview = false;
    select(index);
  } else {
    const buffer = newBuffer({ file, preview });
    const previewIndex = buffers.findIndex((item) => item.preview);
    const replaceIndex = preview && previewIndex !== -1 ? previewIndex : isEmptyUntitled(current()) ? selected : -1;
    captureEditor();
    if (replaceIndex === -1) {
      buffers.push(buffer);
      selected = buffers.length - 1;
    } else {
      if (buffers[replaceIndex].loadId) Loader.cancel(buffers[replaceIndex].loadId);
      buffers[replaceIndex] = buffer;
      selected = replaceIndex;
    }
    showBuffer();
    renderTabs();
    scheduleAutosave();
    index = selected;
  }
  const buffer = buffers[index];
  await ensureLoaded(buffer);
  if (at && buffer === current() && buffer.loaded && buffer.kind !== 'image') revealMatch(at);
  return buffer;
}

function revealMatch(at) {
  if (isRich(current())) {
    if (at.line) RichNotes.revealLine(current(), at);
    return;
  }
  if (at.from !== undefined) BooEditor.selectRange(view, at.from, at.to ?? at.from);
  else {
    const line = view.state.doc.line(Math.min(at.line, view.state.doc.lines));
    const from = line.from + Math.min(at.column ?? 0, line.length);
    BooEditor.selectRange(view, from, Math.min(from + (at.length ?? 0), view.state.doc.length));
  }
}

async function openFiles() {
  for (const file of await window.boo.chooseFiles()) await openPath(file);
}

// ---------- Saving ----------

async function save({ saveAs = false } = {}) {
  captureEditor();
  const buffer = current();
  if (!buffer.loaded || !(isText(buffer) || isRich(buffer))) {
    showMessage(buffer.loaded ? 'Images and hexadecimal views are read-only.' : 'Wait for the file to finish loading.');
    return;
  }
  if (buffer.guide) {
    showMessage('The Boo Guide is read-only. Copy anything you need into a note.');
    return;
  }
  if (isRich(buffer)) return saveRichNote(buffer, { saveAs });
  let target = buffer.file;
  if (!target || saveAs) {
    // Like Sublime: the name is the first line, with no extension unless the note is
    // Markdown (or holds pasted images, which are Markdown links). Type any name and
    // extension you like; the dialog saves "All Files".
    const markdown = buffer.language === 'Markdown' || buffer.state.sliceDoc(0, 100_000).includes('![');
    target = await window.boo.chooseSavePath(
      buffer.file ? baseName(buffer.file) : `${title(buffer).replace(/[\\/:*?"<>|]/g, '-')}${markdown ? '.md' : ''}`,
      buffer.file ? dirName(buffer.file) : buffer.defaultDir,
    );
    if (!target) return;
  }
  statusText.textContent = `Saving ${baseName(target)}…`;
  let doc;
  let result;
  try {
    await adoptImages(buffer, target);
    doc = buffer.state.doc;
    result = await writeDocument(doc, target, buffer.encoding ?? 'UTF-8', buffer.lineEnding ?? DEFAULT_LINE_ENDING);
  } catch (error) {
    await Dialogs.alert({ title: 'Unable to Save', message: error.message });
    showStatus();
    return;
  }
  if (buffer === current()) captureEditor();
  const renamed = buffer.file !== result.file;
  Object.assign(buffer, result, { dirty: buffer.state.doc !== doc, preview: false, defaultDir: undefined });
  if (renamed && buffer.languageAuto) {
    buffer.language = BooEditor.detectLanguage(buffer.file, BooEditor.firstLine(buffer.state));
    if (buffer === current()) await BooEditor.setLanguage(view, buffer.language);
  }
  if (renamed) {
    // Relative image links now start from the new folder.
    if (buffer === current()) BooEditor.setImageDir(view, dirName(buffer.file));
    else buffer.state = BooEditor.withImageDir(buffer.state, dirName(buffer.file));
  }
  if (buffer === current()) showStatus();
  renderTabs();
  scheduleAutosave();
}

// A rich note is saved as an .html file (see RichNotes.serialize).
async function saveRichNote(buffer, { saveAs }) {
  let target = buffer.file;
  if (!target || saveAs) {
    target = await window.boo.chooseSavePath(
      // No extension is forced: Boo knows its rich notes by their contents, whatever
      // the name. Add .html to open the note in Word or a browser too.
      buffer.file ? baseName(buffer.file) : title(buffer).replace(/[\\/:*?"<>|]/g, '-'),
      buffer.file ? dirName(buffer.file) : buffer.defaultDir,
    );
    if (!target) return;
  }
  statusText.textContent = `Saving ${baseName(target)}…`;
  let result;
  let savedDoc;
  try {
    const html = await RichNotes.serialize(buffer, target);
    savedDoc = RichNotes.editorOf(buffer).state.doc;
    result = await writeDocument(textDocument(html), target, 'UTF-8', buffer.lineEnding ?? DEFAULT_LINE_ENDING);
  } catch (error) {
    await Dialogs.alert({ title: 'Unable to Save', message: error.message });
    showStatus();
    return;
  }
  RichNotes.markSaved(buffer, savedDoc);
  Object.assign(buffer, result, { dirty: RichNotes.isDirty(buffer), preview: false, defaultDir: undefined, encoding: 'UTF-8' });
  if (buffer === current()) showStatus();
  renderTabs();
  scheduleAutosave();
}

// ---------- Session ----------

async function recordFor(buffer) {
  // The guide is rebuilt from Guide.HTML on restore, so only its place is kept.
  if (buffer.guide) return { key: buffer.key, kind: 'guide' };
  if (!buffer.loaded) {
    const { notice, ...record } = buffer.record ?? { file: buffer.file, kind: buffer.kind };
    return { ...record, key: buffer.key, preview: buffer.preview, selection: buffer.selection };
  }
  if (isRich(buffer)) {
    const record = {
      key: buffer.key,
      file: buffer.file,
      kind: 'rich',
      dirty: buffer.dirty,
      preview: buffer.preview,
      defaultDir: buffer.defaultDir,
      fileSize: buffer.fileSize,
      fileMtimeMs: buffer.fileMtimeMs,
      scrollTop: buffer.scrollTop,
      title: buffer.file ? undefined : baseTitle(buffer),
      conflict: buffer.conflict,
      editedAt: buffer.editedAt,
    };
    // As with plain text, only unsaved notes keep their contents in the session.
    return buffer.file && !buffer.dirty ? record : { ...record, contents: RichNotes.htmlOf(buffer) };
  }
  const record = {
    key: buffer.key,
    file: buffer.file,
    kind: buffer.kind,
    encoding: buffer.encoding,
    lineEnding: buffer.lineEnding,
    language: buffer.languageAuto ? undefined : buffer.language,
    dirty: buffer.dirty,
    preview: buffer.preview,
    defaultDir: buffer.defaultDir,
    fileSize: buffer.fileSize,
    fileMtimeMs: buffer.fileMtimeMs,
    scrollTop: buffer.scrollTop,
    selection: buffer.state ? BooEditor.selectionOf(buffer.state) : [0, 0],
    title: buffer.file ? undefined : baseTitle(buffer),
    conflict: buffer.conflict,
    editedAt: buffer.editedAt,
  };
  // Saved files are read from disk again on restore; only unsaved text is kept.
  if (!isText(buffer) || (buffer.file && !buffer.dirty)) return record;
  const doc = buffer.state.doc;
  if (doc.length <= INLINE_TEXT_LIMIT) return { ...record, contents: BooEditor.textOf(buffer.state) };
  if (buffer.sidecarDoc !== doc) {
    const written = await writeDocument(doc, `buffer:${buffer.key}`, 'UTF-8', 'Unix');
    buffer.sidecarFile = written.file;
    buffer.sidecarDoc = doc;
  }
  return { ...record, contentsFile: buffer.sidecarFile };
}

async function snapshot() {
  captureEditor();
  const records = [];
  for (const buffer of [...buffers]) records.push(await recordFor(buffer));
  const { history, replaceHistory, ...findOptions } = BooEditor.find.findState;
  return {
    selected,
    settings: { ...settings, find: { ...findOptions, history, replaceHistory } },
    sidebar: { ...sidebarLayout, ...Sidebar.state(), search: SearchView.state() },
    buffers: records,
  };
}

function autosaveDelay() {
  const large = buffers.some((buffer) => buffer.dirty && buffer.state && buffer.state.doc.length > INLINE_TEXT_LIMIT);
  return large ? LARGE_AUTOSAVE_DELAY_MS : AUTOSAVE_DELAY_MS;
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(runAutosave, autosaveDelay());
}

async function runAutosave() {
  if (autosaving) {
    scheduleAutosave();
    return;
  }
  autosaving = (async () => {
    try {
      window.boo.autosave(await snapshot());
      Sync.soon();
      Reminders.refresh();
    } catch (error) {
      showMessage(`Couldn’t autosave: ${error.message}`);
    }
  })();
  await autosaving;
  autosaving = null;
}

window.boo.onCollect(async () => {
  window.boo.collecting();
  clearTimeout(autosaveTimer);
  await autosaving;
  window.boo.sendFinal(await snapshot());
});

// ---------- Layout, settings and pickers ----------

// Light, Dark or System: the page's colors (styles.css) and, on Windows, the window's.
function applyTheme() {
  if (settings.theme === 'light' || settings.theme === 'dark') document.documentElement.dataset.theme = settings.theme;
  else delete document.documentElement.dataset.theme;
  window.boo.setTheme(settings.theme);
}

function applyLayout() {
  layout.classList.toggle('sidebar-hidden', !sidebarLayout.visible);
  layout.style.setProperty('--sidebar-width', `${sidebarLayout.width}px`);
}

function toggleSidebar() {
  sidebarLayout.visible = !sidebarLayout.visible;
  applyLayout();
  scheduleAutosave();
}

function showSidebarView(name) {
  sidebarLayout.visible = true;
  sidebarLayout.view = name;
  applyLayout();
  Sidebar.showView(name);
  scheduleAutosave();
}

async function addFolders() {
  const paths = await window.boo.pickFolders();
  if (!paths.length) return;
  showSidebarView('folders');
  await Sidebar.addFolders(paths);
}

function switchRow(label, checked, onChange) {
  const row = Dialogs.el('label', 'list-row');
  const input = Dialogs.el('input');
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const toggle = Dialogs.el('span', 'switch');
  toggle.append(input, Dialogs.el('span', 'switch-track'));
  row.append(Dialogs.el('span', 'list-label', label), toggle);
  return row;
}

function segmented(options, value, onChange) {
  const control = Dialogs.el('div', 'segmented');
  control.setAttribute('role', 'radiogroup');
  for (const option of options) {
    const segment = Dialogs.el('button', 'segment', option.label);
    segment.setAttribute('role', 'radio');
    segment.setAttribute('aria-checked', String(option.value === value));
    segment.addEventListener('click', () => {
      for (const other of control.children) other.setAttribute('aria-checked', String(other === segment));
      onChange(option.value);
    });
    control.append(segment);
  }
  return control;
}

function openSettings(anchor) {
  const content = Dialogs.el('div', 'settings');
  const viewGroup = Dialogs.el('div', 'list-group');
  viewGroup.append(
    switchRow('Sidebar', sidebarLayout.visible, () => toggleSidebar()),
    switchRow('Line Numbers', settings.lineNumbers, (on) => {
      settings.lineNumbers = on;
      if (current().loaded && current().kind === 'text') BooEditor.setLineNumbers(view, on);
      scheduleAutosave();
    }),
    switchRow('Preview on Click', settings.previewOnClick, (on) => {
      settings.previewOnClick = on;
      scheduleAutosave();
    }),
    switchRow('New Notes Use Rich Text', settings.richNotes, (on) => {
      settings.richNotes = on;
      scheduleAutosave();
    }),
    switchRow('Boo Walks Along the Bottom', settings.booWalks, (on) => {
      settings.booWalks = on;
      Boo.setWalking(on);
      scheduleAutosave();
    }),
  );
  const appearance = segmented(
    [{ label: 'System', value: 'system' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }],
    settings.theme,
    (theme) => {
      settings.theme = theme;
      applyTheme();
      scheduleAutosave();
    },
  );
  const themeRow = Dialogs.el('button', 'list-row link-row');
  themeRow.append(
    Dialogs.el('span', 'list-label', 'Editor Theme'),
    Dialogs.el('span', 'result-dir', `${themeName(settings.editorTheme)} ›`),
  );
  const editorGroup = Dialogs.el('div', 'list-group');
  editorGroup.append(themeRow, stepperRow('Text Size', settings.fontSize, FONT_SIZES, (size) => {
    settings.fontSize = size;
    applyEditorAppearance();
    scheduleAutosave();
  }));
  content.append(
    Dialogs.el('div', 'list-header', 'View'),
    viewGroup,
    Dialogs.el('div', 'list-header', 'Editor'),
    editorGroup,
    Dialogs.el('div', 'list-header', 'Appearance'),
    appearance,
    Dialogs.el('div', 'list-header', 'Reminders: Alert Me'),
    segmented(
      [{ label: 'On time', value: 0 }, { label: '5 min', value: 5 }, { label: '15 min', value: 15 }, { label: '1 hr', value: 60 }, { label: '1 day', value: 1440 }],
      settings.remindLead,
      (minutes) => {
        settings.remindLead = minutes;
        Reminders.refresh();
        scheduleAutosave();
      },
    ),
    Dialogs.el('div', 'list-footer', 'How long before a ⏰ reminder Boo tells you.'),
    Dialogs.el('div', 'list-header', 'Sync'),
    Sync.settingsSection(() => popover.close()),
  );
  // Windows: closing the window leaves Boo in the tray, so reminders still arrive.
  if (window.boo.platform !== 'android' && window.boo.platform !== 'web') {
    const appGroup = Dialogs.el('div', 'list-group');
    const quitRow = Dialogs.el('button', 'list-row link-row');
    quitRow.append(Dialogs.el('span', 'list-label sync-action', 'Quit Boo'));
    quitRow.addEventListener('click', () => {
      popover.close();
      window.boo.quitApp();
    });
    appGroup.append(
      switchRow('Keep Running in the Tray When Closed', settings.keepInTray, (on) => {
        settings.keepInTray = on;
        window.boo.setKeepInTray(on);
        scheduleAutosave();
      }),
      quitRow,
    );
    content.append(Dialogs.el('div', 'list-header', 'Boo'), appGroup);
  }
  content.append(Dialogs.el('div', 'list-footer', 'Unsaved notes are kept automatically when you quit.'));
  const popover = Dialogs.popover(anchor, content, { className: 'settings-popover' });
  themeRow.addEventListener('click', () => {
    popover.close();
    openThemePicker(anchor);
  });
}

// ---------- Editor themes ----------

// Colors live in themes.css; Xcode is the default light/dark palette.
const EDITOR_THEMES = [
  { id: 'xcode', name: 'Xcode (Light or Dark)' },
  { id: 'mariana', name: 'Mariana (Sublime)' },
  { id: 'monokai', name: 'Monokai' },
  { id: 'dracula', name: 'Dracula' },
  { id: 'one-dark', name: 'One Dark' },
  { id: 'nord', name: 'Nord' },
  { id: 'github-dark', name: 'GitHub Dark' },
  { id: 'github-light', name: 'GitHub Light' },
  { id: 'solarized-light', name: 'Solarized Light' },
  { id: 'solarized-dark', name: 'Solarized Dark' },
];
const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18, 20, 22, 24];
const LINE_HEIGHT_RATIO = 1.57;

const themeName = (id) => (EDITOR_THEMES.find((theme) => theme.id === id) ?? EDITOR_THEMES[0]).name;

function applyEditorAppearance() {
  const area = document.getElementById('document');
  if (settings.editorTheme && settings.editorTheme !== 'xcode') area.dataset.editorTheme = settings.editorTheme;
  else delete area.dataset.editorTheme;
  area.style.setProperty('--editor-font-size', `${settings.fontSize}px`);
  area.style.setProperty('--line-height', `${Math.round(settings.fontSize * LINE_HEIGHT_RATIO)}px`);
  view.requestMeasure();
}

function stepperRow(label, value, steps, onChange) {
  const row = Dialogs.el('div', 'list-row');
  const stepper = Dialogs.el('div', 'stepper');
  const minus = Dialogs.el('button', '', '−');
  const plus = Dialogs.el('button', '', '+');
  const shown = Dialogs.el('span', '', `${value} pt`);
  minus.setAttribute('aria-label', `Smaller ${label.toLowerCase()}`);
  plus.setAttribute('aria-label', `Larger ${label.toLowerCase()}`);
  let index = Math.max(0, steps.indexOf(value));
  const update = () => {
    shown.textContent = `${steps[index]} pt`;
    minus.disabled = index === 0;
    plus.disabled = index === steps.length - 1;
  };
  const move = (step) => {
    index = Math.min(steps.length - 1, Math.max(0, index + step));
    update();
    onChange(steps[index]);
  };
  minus.addEventListener('click', () => move(-1));
  plus.addEventListener('click', () => move(1));
  update();
  stepper.append(minus, shown, plus);
  row.append(Dialogs.el('span', 'list-label', label), stepper);
  return row;
}

// A grid of small code samples, each drawn in its theme's colors.
function openThemePicker(anchor) {
  // [color class, text] pairs per line; no class is plain text.
  const sample = [
    [['c', '-- monthly totals']],
    [['k', 'SELECT'], ['', ' '], ['f', 'SUM'], ['', '(total)']],
    [['k', 'FROM'], ['', ' orders '], ['k', 'WHERE']],
    [['', '  year = '], ['v', '@year'], ['', ' AND '], ['s', "'paid'"]],
    [['k', 'LIMIT'], ['', ' '], ['n', '10'], ['', ';']],
  ];
  const grid = Dialogs.el('div', 'theme-grid');
  grid.setAttribute('role', 'radiogroup');
  for (const theme of EDITOR_THEMES) {
    const card = Dialogs.el('button', 'theme-card');
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', String((settings.editorTheme ?? 'xcode') === theme.id));
    if (theme.id !== 'xcode') card.dataset.editorTheme = theme.id;
    const code = Dialogs.el('span', 'theme-sample');
    sample.forEach((parts, line) => {
      if (line) code.append('\n');
      for (const [kind, text] of parts) code.append(kind ? Dialogs.el('span', kind, text) : text);
    });
    card.append(code, Dialogs.el('span', 'theme-name', theme.name));
    card.addEventListener('click', () => {
      settings.editorTheme = theme.id;
      applyEditorAppearance();
      for (const other of grid.children) other.setAttribute('aria-checked', String(other === card));
      scheduleAutosave();
    });
    grid.append(card);
  }
  const content = Dialogs.el('div', 'settings');
  content.append(
    Dialogs.el('div', 'list-header', 'Editor Theme'),
    grid,
    Dialogs.el('div', 'list-footer', 'The theme colors the editor only; the rest of Boo follows Appearance in Settings.'),
  );
  Dialogs.popover(anchor, content, { className: 'theme-popover' });
}

function openEmoji() {
  EmojiPicker.open(document.getElementById('emoji'), (emoji) => {
    if (isRich(current())) RichNotes.insertText(current(), emoji);
    else BooEditor.insertText(view, emoji);
  });
}

async function chooseLanguage() {
  const buffer = current();
  const choice = await Goto.pick({
    placeholder: 'Choose a syntax',
    items: BooEditor.languageNames().map((name) => ({ label: name, value: name, detail: name === buffer.language ? 'Current' : '' })),
  });
  if (!choice) return;
  buffer.language = choice;
  buffer.languageAuto = false;
  await BooEditor.setLanguage(view, choice);
  showStatus();
  scheduleAutosave();
}

async function chooseEncoding() {
  const buffer = current();
  if (!isText(buffer)) return;
  const choice = await Dialogs.menu({
    anchor: encodingButton,
    title: 'Save with Encoding',
    items: ENCODINGS.map((name) => ({ label: name, value: name, checked: name === (buffer.encoding ?? 'UTF-8') })),
  });
  if (!choice || choice === (buffer.encoding ?? 'UTF-8')) return;
  buffer.encoding = choice;
  buffer.dirty = true;
  showStatus();
  renderTabs();
  scheduleAutosave();
}

async function chooseLineEnding() {
  const buffer = current();
  const currentEnding = buffer.lineEnding ?? DEFAULT_LINE_ENDING;
  const choice = await Dialogs.menu({
    anchor: lineEndingButton,
    title: 'Line Endings',
    items: LINE_ENDINGS.map((name) => ({ label: name, value: name, checked: name === currentEnding })),
  });
  if (!choice || choice === currentEnding) return;
  buffer.lineEnding = choice;
  buffer.dirty = true;
  showStatus();
  renderTabs();
  scheduleAutosave();
}

function startSidebarResize(event) {
  event.preventDefault();
  const splitter = event.currentTarget;
  splitter.setPointerCapture(event.pointerId);
  splitter.classList.add('dragging');
  const startX = event.clientX;
  const startWidth = sidebarLayout.width;
  const move = (moveEvent) => {
    const width = startWidth + moveEvent.clientX - startX;
    sidebarLayout.width = Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)));
    applyLayout();
  };
  const stop = () => {
    splitter.classList.remove('dragging');
    splitter.removeEventListener('pointermove', move);
    splitter.removeEventListener('pointerup', stop);
    scheduleAutosave();
  };
  splitter.addEventListener('pointermove', move);
  splitter.addEventListener('pointerup', stop);
}

// ---------- Keyboard ----------

function inEditor(target) {
  return Boolean(target?.closest?.('.cm-editor'));
}

// App shortcuts run before the editor sees the key. Find shortcuts (Ctrl+F, F3, ...)
// belong to the editor, but also work from elsewhere in the window.
document.addEventListener('keydown', (event) => {
  if (Dialogs.isOpen()) return;
  const key = event.key.toLowerCase();
  const chord = Date.now() - chordStartedAt < CHORD_TIMEOUT_MS;
  const run = (action) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  };
  if (event.ctrlKey && chord && (key === 'b' || key === 'd')) {
    chordStartedAt = 0;
    return run(() => (key === 'b' ? toggleSidebar() : BooEditor.find.skipNextOccurrence(view)));
  }
  // F2 renames what's selected in Folders, as in Windows Explorer.
  if (event.key === 'F2' && !event.ctrlKey && !event.altKey && !document.getElementById('folders-view').hidden && sidebarLayout.visible) {
    if (Sidebar.renameSelected()) return run(() => {});
  }
  if (!event.ctrlKey || event.altKey) return;
  const actions = {
    k: () => { chordStartedAt = Date.now(); },
    n: () => openNewNote(),
    o: openFiles,
    s: () => save({ saveAs: event.shiftKey }),
    w: () => closeBuffer(selected),
    p: () => Goto.open(''),
    r: () => Goto.open('@'),
    g: () => Goto.open(':'),
    tab: () => select((selected + (event.shiftKey ? -1 : 1) + buffers.length) % buffers.length),
  };
  if (event.shiftKey && key === 'f') return run(() => SearchView.open());
  if (event.shiftKey && key === 'e') return run(openEmoji);
  if (event.shiftKey && key === 'n') return run(() => Templates.choose(document.getElementById('templates')));
  if (event.shiftKey && key !== 's' && key !== 'tab') return;
  if (actions[key]) return run(actions[key]);
  // In a rich note, Ctrl+F searches the note from the sidebar (Ctrl+I stays italic).
  if (key === 'f' && isRich(current()) && current().loaded) return run(() => SearchView.open({ scope: 'tab' }));
  if (!inEditor(event.target) && inCodeEditor(current())) {
    const findModes = { f: 'find', h: 'replace', i: 'incremental' };
    if (findModes[key]) run(() => BooEditor.find.openFind(view, findModes[key]));
  }
}, true);

// ---------- Wiring ----------

// Dropping a folder adds it to the sidebar; dropping a file opens it.
document.addEventListener('dragover', (event) => event.preventDefault());
async function openDropped(paths) {
  for (const target of paths) {
    if (!target) continue;
    if (await window.boo.isDirectory(target)) {
      showSidebarView('folders');
      await Sidebar.addFolders([target]);
    } else {
      await openPath(target);
    }
  }
}
document.addEventListener('drop', (event) => {
  event.preventDefault();
  openDropped([...event.dataTransfer.files].map((file) => window.boo.pathForFile(file)));
});
window.boo.onDroppedPaths(openDropped);

for (const button of document.querySelectorAll('[data-icon]')) button.innerHTML = Icons[button.dataset.icon];
document.getElementById('toggle-sidebar').addEventListener('click', toggleSidebar);
document.getElementById('new').addEventListener('click', () => openNewNote());
document.getElementById('templates').addEventListener('click', (event) => Templates.choose(event.currentTarget));
document.getElementById('open').addEventListener('click', openFiles);
document.getElementById('save').addEventListener('click', () => save());
document.getElementById('find-in-files').addEventListener('click', () => SearchView.open());
document.getElementById('emoji').addEventListener('click', openEmoji);
document.getElementById('settings').addEventListener('click', (event) => openSettings(event.currentTarget));
document.getElementById('guide-button').addEventListener('click', openGuide);

// Mac-style window buttons. Double-clicking the toolbar maximizes, as on a Mac.
const windowControls = document.getElementById('window-controls');
document.getElementById('window-close').addEventListener('click', () => window.boo.closeWindow());
document.getElementById('window-minimize').addEventListener('click', () => window.boo.minimizeWindow());
document.getElementById('window-maximize').addEventListener('click', () => window.boo.toggleMaximizeWindow());
window.boo.onWindowState(({ focused, maximized }) => {
  windowControls.classList.toggle('inactive', !focused);
  windowControls.classList.toggle('maximized', maximized);
  document.getElementById('window-maximize').title = maximized ? 'Restore' : 'Maximize';
});
document.getElementById('add-folder').addEventListener('click', addFolders);
document.getElementById('add-folder-empty').addEventListener('click', addFolders);
document.getElementById('splitter').addEventListener('pointerdown', startSidebarResize);
document.getElementById('cancel-load').addEventListener('click', () => closeBuffer(selected, { force: true }));
languageButton.addEventListener('click', chooseLanguage);
encodingButton.addEventListener('click', chooseEncoding);
lineEndingButton.addEventListener('click', chooseLineEnding);

const sidebarHandlers = {
  onFileClick: (file) => openPath(file, { preview: settings.previewOnClick }),
  onFileOpen: (file) => openPath(file),
  // Like Sublime's New File in a folder: an untitled note whose Save dialog starts there.
  onNewFile: (dir) => addBuffer(newNote({ defaultDir: dir })),
  onRenamed: (oldPath, newPath) => {
    for (const buffer of buffers) {
      if (buffer.file && isInside(buffer.file, oldPath)) buffer.file = newPath + buffer.file.slice(oldPath.length);
    }
    renderTabs();
    showStatus();
    scheduleAutosave();
    TagsView.refresh();
  },
  // Text stays open as an unsaved note, as in Sublime; image and hex tabs close.
  onDeleted: (target) => {
    const removed = buffers.filter((buffer) => buffer.file && isInside(buffer.file, target));
    for (const buffer of removed) {
      if ((isText(buffer) || isRich(buffer)) && buffer.loaded) {
        buffer.dirty = true;
        buffer.notice = 'This file was moved to the Recycle Bin. Its text is still here; save it to keep it.';
      }
    }
    const keep = buffers.filter((buffer) => !removed.includes(buffer) || ((isText(buffer) || isRich(buffer)) && buffer.loaded));
    if (keep.length !== buffers.length) {
      captureEditor();
      const active = current();
      for (const buffer of buffers) if (!keep.includes(buffer) && isRich(buffer)) RichNotes.detach(buffer);
      buffers = keep.length ? keep : [newNote()];
      selected = Math.max(0, buffers.indexOf(active));
      showBuffer();
    } else {
      showStatus();
    }
    renderTabs();
    scheduleAutosave();
    TagsView.refresh();
  },
  onEditTags: (file) => TagsView.editFileTags(file),
  onChange: scheduleAutosave,
};

(async () => {
  const session = await window.boo.loadSession();
  settings = { ...DEFAULT_SETTINGS, ...session?.settings };
  sidebarLayout = {
    visible: session?.sidebar?.visible ?? DEFAULT_SIDEBAR.visible,
    width: session?.sidebar?.width ?? DEFAULT_SIDEBAR.width,
    view: session?.sidebar?.view ?? DEFAULT_SIDEBAR.view,
  };
  // On Android there's no Folders view, and on a phone the sidebar covers the note.
  if (window.boo.platform === 'android') {
    if (sidebarLayout.view === 'folders') sidebarLayout.view = 'search';
    if (!session && window.innerWidth < 760) sidebarLayout.visible = false;
  }
  BooEditor.find.configureFind(settings.find ?? {}, {
    onChange: scheduleAutosave,
    onMessage: showMessage,
  });
  buffers = (session?.buffers ?? []).map((record) => (record.kind === 'guide' ? guideBuffer() : newBuffer({
    key: record.key,
    file: record.file,
    kind: record.kind ?? 'text',
    dirty: Boolean(record.dirty),
    preview: Boolean(record.preview),
    notice: record.notice,
    defaultDir: record.defaultDir,
    language: record.language,
    languageAuto: !record.language,
    selection: record.selection ?? [0, 0],
    scrollTop: record.scrollTop ?? 0,
    title: record.title ?? (record.contents ?? '').split('\n', 1)[0],
    encoding: record.encoding,
    lineEnding: record.lineEnding,
    conflict: record.conflict,
    editedAt: record.editedAt,
    record,
  })));
  if (!buffers.length) buffers.push(newNote());
  selected = Math.min(Math.max(session?.selected ?? 0, 0), buffers.length - 1);
  applyTheme();
  applyLayout();
  applyEditorAppearance();
  showBuffer();
  renderTabs();
  await Sidebar.init({ folders: session?.sidebar?.folders, expanded: session?.sidebar?.expanded, order: session?.sidebar?.order, pinned: session?.sidebar?.pinned }, sidebarHandlers);
  SearchView.init(session?.sidebar?.search);
  TagsView.init();
  Sidebar.showView(sidebarLayout.view);
  if (current().file) Sidebar.reveal(current().file);
  Boo.init({ walking: settings.booWalks });
  document.body.classList.add('ready');
  Sync.init();
  window.boo.setKeepInTray(settings.keepInTray);
  Reminders.init();
})();
