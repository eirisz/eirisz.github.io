// Google Drive sync: every note tab (unsaved notes, and saved .html/.txt/.md notes
// once opened) is kept as a file in a "Boo Notes" folder in your Drive, so Boo on
// another computer, tablet or phone shows the same notes.
// - A note changed here is uploaded; a note changed elsewhere is downloaded into its tab.
// - Changed in both places since the last sync: the newer edit wins and the note
//   stays one note; the older text is kept in the Drive file's version history.
// - Closing a note's tab moves its Drive file to the Drive's Trash (kept 30 days), and
//   the tab closes on the other devices too.
// - Pasted pictures travel with their notes, in "Boo Notes/Images".
// Boo only ever sees the files it created (Google's "drive.file" permission).
const Sync = (() => {
  let DRIVE = 'https://www.googleapis.com/drive/v3';
  let UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const FOLDER_NAME = 'Boo Notes';
  const IMAGES_NAME = 'Images';
  const FOLDER_TYPE = 'application/vnd.google-apps.folder';
  const SOON_MS = 4000;
  const EVERY_MS = 60000;
  const MAX_NOTE_CHARS = 5 * 1024 * 1024;
  const NOTE_NAME = /\.(txt|text|md|markdown|note|notes|html?)$/i;
  const IMAGE_TOKEN = 'boo-image:';

  let status = { configured: false, signedIn: false, enabled: true };
  let state = { notes: {}, closed: [] };
  let running = null;
  let again = false;
  let soonTimer = null;
  let lastSynced = null;
  let lastError = null;
  let applying = false;
  const listeners = new Set();

  // The sync commands of the app core (Tauri) or the browser version (platform-web.js).
  const invoke = (command, args) => window.boo.call(command, args);
  const available = () => Boolean(window.boo.call);
  const active = () => available() && status.signedIn && status.enabled;
  const notify = () => listeners.forEach((listener) => listener());

  // A short fingerprint of a note's text, to tell whether it changed.
  function fingerprint(text) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return `${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`;
  }

  // The fingerprint a note will have once it's open: rich notes are compared as the
  // editor writes them, so its tidying of the HTML isn't taken for an edit.
  async function hashOf(kind, text) {
    return fingerprint(kind === 'rich' ? await RichNotes.normalize(text) : text);
  }

  // ---------- Which tabs are notes, and their text ----------

  function syncable(buffer) {
    if (buffer.guide || (buffer.kind !== 'rich' && buffer.kind !== 'text')) return false;
    return !buffer.file || NOTE_NAME.test(buffer.file) || !/\.[^\\/.]+$/.test(buffer.file);
  }

  // The note's text as stored in Drive, or null when it isn't available right now
  // (a saved file that hasn't been opened since Boo started).
  function contentsOf(buffer) {
    let text;
    if (buffer.loaded) {
      if (isRich(buffer)) text = RichNotes.editorOf(buffer) ? RichNotes.htmlOf(buffer) : null;
      else {
        const editorState = buffer === viewBuffer ? view.state : buffer.state;
        text = editorState && editorState.doc.length <= MAX_NOTE_CHARS ? editorState.doc.toString() : null;
      }
    } else {
      text = buffer.record?.contents ?? null;
    }
    return text;
  }

  const isBlank = (text) => !/<img[\s>]/i.test(text) && text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === '';

  // ---------- Pictures ----------

  const pathFromImageUrl = (url) => window.boo.nativePath(decodeURIComponent(url.slice(window.boo.imageBase.length)));
  const nameOf = (file) => file.split(/[\\/]/).pop();

  // Local pictures in a note become boo-image:<name> for Drive, each uploaded once.
  async function outgoing(buffer, text, images) {
    const found = new Map();
    let portable;
    if (buffer.kind === 'rich') {
      portable = text.replace(/src="([^"]+)"/g, (all, src) => {
        if (!src.startsWith(window.boo.imageBase)) return all;
        const file = pathFromImageUrl(src);
        found.set(nameOf(file), file);
        return `src="${IMAGE_TOKEN}${encodeURIComponent(nameOf(file))}"`;
      });
    } else {
      portable = text.replace(/(!\[[^\]]*\]\()<([^>]+)>\)/g, (all, start, target) => {
        if (/^(https?|data):/i.test(target)) return all;
        const file = /^([a-z]:|\\\\|\/)/i.test(target) ? target : `${dirName(buffer.file ?? '')}/${target}`;
        found.set(nameOf(file), window.boo.nativePath(file));
        return `${start}<${IMAGE_TOKEN}${nameOf(file)}>)`;
      });
    }
    for (const [name, file] of found) {
      if (images.has(`${buffer.key}/${name}`)) continue;
      const response = await fetch(`${window.boo.imageBase}${file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')}`);
      if (!response.ok) continue;
      await createFile({ name: `${buffer.key}--${name}`, parents: [state.imagesId], appProperties: { booKey: buffer.key, booImage: name } }, await response.blob());
      images.add(`${buffer.key}/${name}`);
    }
    return portable;
  }

  // boo-image:<name> in a downloaded note becomes a picture stored with Boo's data.
  async function incoming(key, kind, text, imageFiles) {
    const names = new Set();
    for (const match of text.matchAll(/boo-image:([^"<>)\s]+)/g)) names.add(decodeURIComponent(match[1]));
    const local = new Map();
    for (const name of names) {
      const { path, exists } = await invoke('sync_image_path', { key, name });
      if (!exists) {
        const remote = imageFiles.get(`${key}/${name}`);
        if (!remote) continue;
        const bytes = await (await drive(`${DRIVE}/files/${remote}?alt=media`)).arrayBuffer();
        await invoke('sync_write_image', { key, name, data: toBase64(bytes) });
      }
      local.set(name, path);
    }
    if (kind === 'rich') {
      return text.replace(/src="boo-image:([^"]+)"/g, (all, name) => {
        const file = local.get(decodeURIComponent(name));
        return file ? `src="${window.boo.imageBase}${file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')}"` : all;
      });
    }
    return text.replace(/<boo-image:([^>]+)>/g, (all, name) => (local.has(name) ? `<${local.get(name)}>` : all));
  }

  function toBase64(bytes) {
    let binary = '';
    const view8 = new Uint8Array(bytes);
    for (let index = 0; index < view8.length; index += 0x8000) binary += String.fromCharCode(...view8.subarray(index, index + 0x8000));
    return btoa(binary);
  }

  // ---------- Google Drive ----------

  async function drive(url, options = {}) {
    const token = await invoke('sync_token');
    const response = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      let reason = `${response.status}`;
      try {
        reason = (await response.json()).error?.message ?? reason;
      } catch {}
      throw new Error(`Google Drive: ${reason}`);
    }
    return response;
  }

  const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  function multipart(metadata, content, type) {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', content instanceof Blob ? content : new Blob([content], { type }));
    return form;
  }

  async function createFile(metadata, content, type = 'text/plain') {
    const response = await drive(`${UPLOAD}/files?uploadType=multipart&fields=id,md5Checksum`, { method: 'POST', body: multipart(metadata, content, type) });
    return response.json();
  }

  async function updateFile(id, metadata, content, type) {
    const response = await drive(`${UPLOAD}/files/${id}?uploadType=multipart&fields=id,md5Checksum`, { method: 'PATCH', body: multipart(metadata, content, type) });
    return response.json();
  }

  async function listAll(query) {
    const files = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({ q: query, pageSize: '1000', fields: 'nextPageToken,files(id,name,md5Checksum,appProperties)' });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await (await drive(`${DRIVE}/files?${params}`)).json();
      files.push(...page.files);
      pageToken = page.nextPageToken ?? '';
    } while (pageToken);
    return files;
  }

  async function folder(name, parent, savedId) {
    if (savedId) {
      try {
        const found = await (await drive(`${DRIVE}/files/${savedId}?fields=id,trashed`)).json();
        if (!found.trashed) return savedId;
      } catch {}
    }
    const parentQuery = parent ? ` and '${parent}' in parents` : '';
    const existing = await listAll(`mimeType='${FOLDER_TYPE}' and name='${name}' and trashed=false${parentQuery}`);
    if (existing.length) return existing[0].id;
    const created = await (await drive(`${DRIVE}/files?fields=id`, json({ name, mimeType: FOLDER_TYPE, parents: parent ? [parent] : undefined }))).json();
    return created.id;
  }

  // ---------- Applying notes from Drive ----------

  function noteFileName(buffer) {
    const name = (baseTitle(buffer) || 'untitled').replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 80) || 'untitled';
    return `${name}.${buffer.kind === 'rich' ? 'html' : 'txt'}`;
  }

  // The tab title of a note that isn't open yet: its first line, as the editor would show it.
  function firstLineOf(kind, text) {
    const lines = kind === 'rich'
      ? [...new DOMParser().parseFromString(text, 'text/html').body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, td, th, pre')].map((block) => block.textContent)
      : text.split('\n');
    const line = lines.find((part) => part.trim()) ?? '';
    return line.replace(/^\s*#+\s+/, '').trim().slice(0, 40);
  }

  // Replaces a note's text, keeping the cursor where it was when possible.
  function replaceContents(buffer, text) {
    buffer.dirty = true;
    buffer.preview = false;
    if (!buffer.loaded) {
      buffer.record = { ...(buffer.record ?? {}), kind: buffer.kind, contents: text, dirty: true };
      buffer.title = firstLineOf(buffer.kind, text);
      return;
    }
    if (isRich(buffer)) {
      RichNotes.editorOf(buffer)?.commands.setContent(text, { emitUpdate: false });
      return;
    }
    const editorState = buffer === viewBuffer ? view.state : buffer.state;
    const old = editorState.doc.toString();
    let start = 0;
    while (start < old.length && start < text.length && old[start] === text[start]) start++;
    let end = 0;
    while (end < old.length - start && end < text.length - start && old[old.length - 1 - end] === text[text.length - 1 - end]) end++;
    const changes = { from: start, to: old.length - end, insert: text.slice(start, text.length - end) };
    // Not an edit of yours, so it doesn't change when the note was last edited.
    if (buffer !== viewBuffer) {
      buffer.state = buffer.state.update({ changes }).state;
      return;
    }
    applying = true;
    try {
      view.dispatch({ changes });
    } finally {
      applying = false;
    }
  }

  function addNote(key, kind, text, name, { conflict = false } = {}) {
    const buffer = newBuffer({ key, kind, dirty: true, conflict, title: name.replace(/\.(html?|txt)$/i, ''), record: { kind, contents: text, dirty: true, conflict } });
    buffers.push(buffer);
    return buffer;
  }

  // When the note was last edited (by you, on this device), stored with it in Drive.
  const editedStamp = (buffer) => String(buffer.editedAt ?? Date.now());

  // Whether Drive's copy is still the one this device last uploaded or downloaded.
  // Drive's checksum of the contents is compared, not its version number: Drive
  // raises the version for changes of its own too, which isn't an edit.
  const sameAsKnown = (remote, known) => Boolean(known?.sum) && remote.md5Checksum === known.sum;

  function closeNote(buffer) {
    const index = buffers.indexOf(buffer);
    if (index !== -1) closeBuffer(index, { force: true, fromSync: true });
  }

  // ---------- One sync ----------

  async function syncOnce() {
    captureEditor();
    state.notes ??= {};
    state.closed ??= [];
    state.rootId = await folder(FOLDER_NAME, null, state.rootId);
    state.imagesId = await folder(IMAGES_NAME, state.rootId, state.imagesId);
    const remoteNotes = new Map();
    for (const file of await listAll(`'${state.rootId}' in parents and trashed=false and mimeType!='${FOLDER_TYPE}'`)) {
      if (file.appProperties?.booKey) remoteNotes.set(file.appProperties.booKey, file);
    }
    const imageFiles = new Map();
    for (const file of await listAll(`'${state.imagesId}' in parents and trashed=false`)) {
      const { booKey, booImage } = file.appProperties ?? {};
      if (booKey && booImage) imageFiles.set(`${booKey}/${booImage}`, file.id);
    }
    const uploadedImages = new Set(imageFiles.keys());
    let changedTabs = false;

    // Tabs closed here: their notes go to the Drive's Trash, unless changed elsewhere since.
    for (const key of state.closed) {
      const remote = remoteNotes.get(key);
      const known = state.notes[key];
      // (Notes synced before checksums were kept have no `sum`; closing them trashes them.)
      if (remote && (!known?.sum || sameAsKnown(remote, known))) {
        await drive(`${DRIVE}/files/${remote.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
        remoteNotes.delete(key);
      }
      delete state.notes[key];
    }
    state.closed = [];

    const local = new Map(buffers.filter(syncable).map((buffer) => [buffer.key, buffer]));
    for (const [key, buffer] of local) {
      const text = contentsOf(buffer);
      const remote = remoteNotes.get(key);
      const known = state.notes[key];
      remoteNotes.delete(key);
      // Nothing to keep yet: an empty new note isn't uploaded until something's typed.
      if (text === null || (!known && !remote && isBlank(text))) continue;
      // A tab that hasn't been opened since Boo started can't have changed here.
      const hash = buffer.loaded ? fingerprint(text) : known ? known.hash : await hashOf(buffer.kind, text);
      const type = buffer.kind === 'rich' ? 'text/html' : 'text/plain';
      const localChanged = !known || known.hash !== hash;
      const remoteChanged = remote && !sameAsKnown(remote, known);
      if (!remote) {
        if (known && !localChanged) {
          // Closed on another device.
          closeNote(buffer);
          delete state.notes[key];
          changedTabs = true;
          continue;
        }
        const portable = await outgoing(buffer, text, uploadedImages);
        const created = await createFile({ name: noteFileName(buffer), parents: [state.rootId], appProperties: { booKey: key, booKind: buffer.kind, booEdited: editedStamp(buffer) } }, portable, type);
        state.notes[key] = { id: created.id, sum: created.md5Checksum, hash };
      } else if (remoteChanged && localChanged && known) {
        // Changed here and on another device since the last sync: the newer edit wins
        // and the note stays one note. The older text isn't thrown away: it goes into
        // the Drive file's version history (Drive › the note › Manage versions).
        const other = await (await drive(`${DRIVE}/files/${remote.id}?alt=media`)).text();
        const received = await incoming(key, buffer.kind, other, imageFiles);
        const receivedHash = await hashOf(buffer.kind, received);
        if (receivedHash === hash) {
          state.notes[key] = { id: remote.id, sum: remote.md5Checksum, hash };
          continue;
        }
        const remoteEdited = Number(remote.appProperties?.booEdited ?? 0);
        const portable = await outgoing(buffer, text, uploadedImages);
        if ((buffer.editedAt ?? 0) >= remoteEdited) {
          const updated = await updateFile(remote.id, { name: noteFileName(buffer), appProperties: { booEdited: editedStamp(buffer) } }, portable, type);
          state.notes[key] = { id: remote.id, sum: updated.md5Checksum, hash };
        } else {
          await updateFile(remote.id, { name: noteFileName(buffer) }, portable, type);
          const restored = await updateFile(remote.id, { name: remote.name, appProperties: { booEdited: String(remoteEdited) } }, other, type);
          replaceContents(buffer, received);
          buffer.editedAt = remoteEdited;
          state.notes[key] = { id: remote.id, sum: restored.md5Checksum, hash: receivedHash };
          changedTabs = true;
        }
      } else if (remoteChanged) {
        const other = await (await drive(`${DRIVE}/files/${remote.id}?alt=media`)).text();
        const received = await incoming(key, buffer.kind, other, imageFiles);
        const receivedHash = await hashOf(buffer.kind, received);
        if (receivedHash !== hash) {
          replaceContents(buffer, received);
          buffer.editedAt = Math.max(buffer.editedAt ?? 0, Number(remote.appProperties?.booEdited ?? 0));
          changedTabs = true;
        }
        state.notes[key] = { id: remote.id, sum: remote.md5Checksum, hash: receivedHash };
      } else if (localChanged) {
        const portable = await outgoing(buffer, text, uploadedImages);
        const updated = await updateFile(remote.id, { name: noteFileName(buffer), appProperties: { booEdited: editedStamp(buffer) } }, portable, type);
        state.notes[key] = { id: remote.id, sum: updated.md5Checksum, hash };
      }
    }

    // Notes from other devices that aren't open here yet.
    for (const [key, remote] of remoteNotes) {
      const known = state.notes[key];
      if (known) {
        // Closed here while syncing was paused: same as closing it now.
        if (!known.sum || sameAsKnown(remote, known)) {
          await drive(`${DRIVE}/files/${remote.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
          delete state.notes[key];
          continue;
        }
      }
      const kind = remote.appProperties.booKind === 'rich' ? 'rich' : 'text';
      const text = await incoming(key, kind, await (await drive(`${DRIVE}/files/${remote.id}?alt=media`)).text(), imageFiles);
      addNote(key, kind, text, remote.name);
      state.notes[key] = { id: remote.id, sum: remote.md5Checksum, hash: await hashOf(kind, text) };
      changedTabs = true;
    }

    await invoke('sync_set_state', { stateValue: state });
    if (changedTabs) {
      renderTabs();
      if (current() && !current().loaded) showBuffer();
      scheduleAutosave();
    }
  }

  async function run() {
    if (!active()) return;
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        await syncOnce();
        lastSynced = new Date();
        lastError = null;
      } catch (error) {
        lastError = error.message ?? String(error);
        if (/signed out/i.test(lastError)) status = await invoke('sync_status');
      }
      running = null;
      notify();
      if (again) {
        again = false;
        run();
      }
    })();
    return running;
  }

  async function setEnabled(enabled) {
    await invoke('sync_set_enabled', { enabled });
    status = await invoke('sync_status');
    notify();
    if (status.enabled) await run();
  }

  // A sync shortly after typing stops.
  function soon() {
    if (!active()) return;
    clearTimeout(soonTimer);
    soonTimer = setTimeout(run, SOON_MS);
  }

  // Called when a note's tab is closed here.
  function noteClosed(buffer) {
    if (!active() || !syncable(buffer)) return;
    if (!state.closed.includes(buffer.key)) state.closed.push(buffer.key);
    soon();
  }

  async function init() {
    if (!available()) return;
    status = await invoke('sync_status');
    // The end-to-end test points Boo at a stand-in Drive server.
    if (status.apiBase) {
      DRIVE = `${status.apiBase}/drive/v3`;
      UPLOAD = `${status.apiBase}/upload/drive/v3`;
    }
    state = { notes: {}, closed: [], ...(await invoke('sync_state')) };
    setInterval(run, EVERY_MS);
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) run();
    });
    run();
  }

  // ---------- Settings ----------

  function describe() {
    if (!available()) return 'Not available in this version of Boo.';
    if (!status.configured) return 'Not set up yet.';
    if (!status.signedIn) return 'Off';
    if (!status.enabled) return `Paused · ${status.email}`;
    if (running) return `Syncing… · ${status.email}`;
    if (lastError) return `⚠ ${lastError}`;
    const when = lastSynced ? `synced ${lastSynced.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'signed in';
    return `${status.email} · ${when}`;
  }

  // The Google Drive section of Settings.
  function settingsSection(closeSettings) {
    const { el } = Dialogs;
    const group = el('div', 'list-group');
    const line = el('div', 'list-row');
    const label = el('span', 'list-label', 'Google Drive');
    const detail = el('span', 'result-dir sync-detail', describe());
    line.append(label, detail);
    group.append(line);
    const refresh = () => {
      detail.textContent = describe();
    };
    listeners.add(refresh);
    const button = (text, action) => {
      const row = el('button', 'list-row link-row', '');
      row.append(el('span', 'list-label sync-action', text));
      row.addEventListener('click', action);
      group.append(row);
    };
    if (!available()) return group;
    if (!status.configured) {
      button('Set Up Google Drive Sync…', () => {
        closeSettings();
        configure();
      });
    } else if (!status.signedIn) {
      button('Sign In with Google…', async () => {
        detail.textContent = window.boo.platform === 'web' ? 'Sign in in the Google window…' : 'Sign in in your browser, then come back to Boo…';
        try {
          status = await invoke('sync_sign_in');
          state = { notes: {}, closed: [] };
          refresh();
          run();
        } catch (error) {
          detail.textContent = `⚠ ${error}`;
        }
      });
    } else {
      button('Sync Now', () => run());
      button(status.enabled ? 'Pause Syncing' : 'Resume Syncing', async () => {
        closeSettings();
        await setEnabled(!status.enabled);
      });
      button('Sign Out', async () => {
        const sure = await Dialogs.alert({
          title: 'Sign out of Google Drive?',
          message: 'Your notes stay on this device and in your Drive; they just stop syncing here.',
          buttons: [{ label: 'Cancel', value: false, role: 'cancel' }, { label: 'Sign Out', value: true, role: 'destructive' }],
        });
        if (!sure) return;
        await invoke('sync_sign_out');
        status = await invoke('sync_status');
        state = { notes: {}, closed: [] };
        closeSettings();
      });
    }
    return group;
  }

  // Where to paste the Google Cloud client Boo signs in with (once per device,
  // unless it was built into Boo).
  async function configure() {
    const { el } = Dialogs;
    const content = el('div', 'sync-setup');
    const idInput = el('input', 'alert-input');
    idInput.placeholder = 'Client ID (…apps.googleusercontent.com)';
    idInput.spellcheck = false;
    const secretInput = el('input', 'alert-input');
    secretInput.placeholder = 'Client secret';
    secretInput.spellcheck = false;
    const cancel = el('button', 'plain-button', 'Cancel');
    const save = el('button', 'filled-button', 'Save');
    const buttons = el('div', 'sync-buttons');
    buttons.append(cancel, save);
    content.append(
      el('div', 'alert-title', 'Google Drive Sync'),
      el('div', 'alert-message', `Paste the client ID and secret of the Google Cloud “${window.boo.platform === 'web' ? 'Web application' : 'Desktop app'}” client you made for Boo. The Boo Guide explains how to make one.`),
      idInput,
      secretInput,
      buttons,
    );
    const sheet = Dialogs.sheet(content, { className: 'sync-sheet' });
    save.addEventListener('click', async () => {
      if (!idInput.value.trim()) return idInput.focus();
      await invoke('sync_configure', { clientId: idInput.value, clientSecret: secretInput.value });
      status = await invoke('sync_status');
      sheet.close();
    });
    cancel.addEventListener('click', () => sheet.close());
    idInput.focus();
  }

  return {
    init, run, soon, setEnabled, noteClosed, settingsSection,
    onChange: (listener) => listeners.add(listener),
    isBusy: () => Boolean(running),
    get applying() { return applying; },
  };
})();
