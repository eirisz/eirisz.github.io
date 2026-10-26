// Boo in a browser (Edge or Chrome, installable as an app): `window.boo` built on
// what the browser offers, in place of the Windows/Android app core (src-tauri).
// - Notes, sessions (hot exit), file tags, pasted pictures and sync state live in
//   the browser's own storage (IndexedDB) for this site.
// - Files and folders are the ones you open or add yourself; the browser asks once
//   for permission (choose "Allow on every visit" to keep it). Paths look like
//   "/Notes/sub/file.txt", "/Notes" being a folder in the sidebar.
// - Find in Files, the Goto file list and the tag scan run in a background worker
//   (src/web-worker.js), pasted pictures are served by the offline worker (sw.js).
// - Searching every drive, the Recycle Bin and "Open in File Explorer" aren't
//   possible in a browser.
(() => {
  if (window.boo) return;
  document.documentElement.classList.add('web');
  const BASE = new URL('./', location.href).href;
  const IMAGE_BASE = `${BASE}boo-image`;
  const DB_VERSION = 1;
  const EXCLUDED_FOLDERS = new Set(['.svn', '.git', '.hg', 'cvs']);
  const EXCLUDED_FILES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);
  const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', svg: 'image/svg+xml' };
  const STREAM_THRESHOLD = 8 * 1024 * 1024;
  const PIECE = 4 * 1024 * 1024;

  // ---------- Browser storage ----------

  let opening = null;
  function database() {
    opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('boo', DB_VERSION);
      request.onupgradeneeded = () => {
        for (const name of ['kv', 'images']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return opening;
  }
  async function store(name, mode, action) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(name, mode);
      const request = action(transaction.objectStore(name));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
    });
  }
  const kvGet = (key) => store('kv', 'readonly', (kv) => kv.get(key));
  const kvPut = (key, value) => store('kv', 'readwrite', (kv) => kv.put(value, key));
  const kvDelete = (key) => store('kv', 'readwrite', (kv) => kv.delete(key));
  const imageGet = (path) => store('images', 'readonly', (images) => images.get(path));
  const imagePut = (path, blob) => store('images', 'readwrite', (images) => images.put(blob, path));
  const imageDelete = (path) => store('images', 'readwrite', (images) => images.delete(path));

  // ---------- Folders and files the browser gave Boo ----------

  let roots = []; // [{ path: '/Notes', handle }]
  let singles = new Map(); // '/~files/<id>/<name>' → handle, for files opened on their own
  const ready = (async () => {
    const saved = await kvGet('handles');
    roots = saved?.roots ?? [];
    singles = new Map(saved?.singles ?? []);
  })();
  const saveHandles = () => kvPut('handles', { roots, singles: [...singles] });

  const nameOf = (path) => path.split('/').filter(Boolean).pop() ?? path;
  const parentOf = (path) => path.replace(/\/[^/]*\/?$/, '') || '/';
  const rootOf = (path) => roots.find((root) => path === root.path || path.startsWith(`${root.path}/`));

  // A path inside one of the sidebar folders for this handle, if it is in one.
  async function pathFor(handle) {
    for (const root of roots) {
      if (await root.handle.isSameEntry(handle)) return root.path;
      const parts = await root.handle.resolve(handle).catch(() => null);
      if (parts) return [root.path, ...parts].join('/');
    }
    for (const [path, other] of singles) if (await other.isSameEntry(handle)) return path;
    return null;
  }

  async function addRoot(handle) {
    for (const root of roots) if (await root.handle.isSameEntry(handle)) return root.path;
    let path = `/${handle.name}`;
    for (let n = 2; roots.some((root) => root.path === path); n++) path = `/${handle.name} (${n})`;
    roots.push({ path, handle });
    await saveHandles();
    return path;
  }

  async function addFile(handle) {
    const known = await pathFor(handle);
    if (known) return known;
    const path = `/~files/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}/${handle.name}`;
    singles.set(path, handle);
    await saveHandles();
    return path;
  }

  // The browser asks for access only while you're clicking. Anything that needs a
  // file before then (tabs restored at startup, the sidebar) waits for your click on
  // "Allow Access to Your Files".
  const needsAccess = new Map(); // handle → [resolve, ...]
  async function allowed(handle, write) {
    const mode = { mode: write ? 'readwrite' : 'read' };
    if ((await handle.queryPermission(mode)) === 'granted') return;
    if (navigator.userActivation?.isActive && (await handle.requestPermission({ mode: 'readwrite' })) === 'granted') return;
    await new Promise((resolve) => {
      for (const [other, waiting] of needsAccess) {
        if (other === handle) return waiting.push(resolve);
      }
      needsAccess.set(handle, [resolve]);
      showAccessButton();
    });
  }

  async function resolve(path, { write = false } = {}) {
    await ready;
    if (singles.has(path)) {
      const handle = singles.get(path);
      await allowed(handle, write);
      return handle;
    }
    const root = rootOf(path);
    if (!root) throw new Error(`“${path}” isn’t in a folder Boo can open. Add its folder in Folders.`);
    await allowed(root.handle, write);
    let handle = root.handle;
    const parts = path.slice(root.path.length).split('/').filter(Boolean);
    for (const [index, part] of parts.entries()) {
      try {
        handle = await handle.getDirectoryHandle(part);
      } catch {
        if (index < parts.length - 1) throw new Error(`“${path}” wasn’t found.`);
        handle = await handle.getFileHandle(part).catch(() => {
          throw new Error(`“${path}” wasn’t found.`);
        });
      }
    }
    return handle;
  }

  // One button asks again for every folder and file that needs your OK.
  let accessButton = null;
  function showAccessButton() {
    if (accessButton) return;
    accessButton = document.createElement('button');
    accessButton.className = 'filled-button web-access';
    accessButton.textContent = 'Allow Access to Your Files';
    accessButton.title = 'The browser asks again after Boo restarts; choose “Allow on every visit” to stop that.';
    accessButton.addEventListener('click', async () => {
      for (const [handle, waiting] of [...needsAccess]) {
        if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') continue;
        needsAccess.delete(handle);
        waiting.forEach((resume) => resume());
      }
      if (!needsAccess.size) {
        accessButton.remove();
        accessButton = null;
      }
    });
    document.body.append(accessButton);
  }

  // ---------- Text encodings, as in src-tauri/src/codec.rs ----------

  const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';
  function lineEndingOf(text) {
    const crlf = (text.match(/\r\n/g) ?? []).length;
    const lf = (text.match(/\n/g) ?? []).length - crlf;
    const cr = (text.match(/\r/g) ?? []).length - crlf;
    if (crlf + lf + cr === 0) return 'Windows';
    if (crlf >= lf && crlf >= cr) return 'Windows';
    return lf >= cr ? 'Unix' : 'Mac OS 9';
  }
  function decodeText(bytes) {
    const starts = (...marks) => marks.every((mark, index) => bytes[index] === mark);
    let text;
    let encoding;
    if (starts(0xef, 0xbb, 0xbf)) [text, encoding] = [new TextDecoder('utf-8').decode(bytes.subarray(3)), 'UTF-8 with BOM'];
    else if (starts(0xff, 0xfe)) [text, encoding] = [new TextDecoder('utf-16le').decode(bytes.subarray(2)), 'UTF-16 LE'];
    else if (starts(0xfe, 0xff)) [text, encoding] = [new TextDecoder('utf-16be').decode(bytes.subarray(2)), 'UTF-16 BE'];
    else if (bytes.includes(0)) return null;
    else {
      try {
        [text, encoding] = [new TextDecoder('utf-8', { fatal: true }).decode(bytes), 'UTF-8'];
      } catch {
        [text, encoding] = [new TextDecoder('windows-1252').decode(bytes), 'Western (Windows 1252)'];
      }
    }
    return { contents: text.replace(/\r\n?/g, '\n'), encoding, lineEnding: lineEndingOf(text) };
  }
  function hexPreview(bytes, total) {
    const shown = bytes.subarray(0, 256 * 1024);
    const lines = [];
    for (let offset = 0; offset < shown.length; offset += 16) {
      const row = shown.subarray(offset, offset + 16);
      const hex = [];
      for (let i = 0; i < 16; i += 2) hex.push([...row.subarray(i, i + 2)].map((byte) => byte.toString(16).padStart(2, '0')).join('').padEnd(4, ' '));
      const ascii = [...row].map((byte) => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.')).join('');
      lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex.join(' ')}  ${ascii}`);
    }
    const more = total > shown.length ? `\n\n… showing the first ${shown.length.toLocaleString('en')} of ${total.toLocaleString('en')} bytes` : '';
    return { kind: 'binary', contents: lines.join('\n') + more, encoding: 'Hexadecimal' };
  }
  const BOMS = { 'UTF-8 with BOM': [0xef, 0xbb, 0xbf], 'UTF-16 LE': [0xff, 0xfe], 'UTF-16 BE': [0xfe, 0xff] };
  function encodeChunk(text, encoding, lineEnding) {
    const newline = { Windows: '\r\n', 'Mac OS 9': '\r' }[lineEnding] ?? '\n';
    const converted = newline === '\n' ? text : text.replace(/\n/g, newline);
    if (encoding === 'UTF-16 LE' || encoding === 'UTF-16 BE') {
      const bytes = new Uint8Array(converted.length * 2);
      for (let index = 0; index < converted.length; index++) {
        const code = converted.charCodeAt(index);
        const [low, high] = [code & 0xff, code >> 8];
        bytes.set(encoding === 'UTF-16 LE' ? [low, high] : [high, low], index * 2);
      }
      return bytes;
    }
    if (encoding === 'Western (Windows 1252)') {
      const bytes = new Uint8Array(converted.length);
      let length = 0;
      for (const char of converted) {
        const code = char.codePointAt(0);
        if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) bytes[length++] = code;
        else {
          const high = CP1252.indexOf(char);
          if (high === -1) return null;
          bytes[length++] = 0x80 + high;
        }
      }
      return bytes.subarray(0, length);
    }
    return new TextEncoder().encode(converted);
  }

  // ---------- Loading files ----------

  const handlers = { chunk: [], reset: [], progress: [], done: [], job: [], folder: [], drop: [] };
  const notify = (kind, ...args) => handlers[kind].forEach((handler) => handler(...args));
  const cancelled = new Set();
  const attempt = async (action) => {
    try {
      return { result: await action() };
    } catch (error) {
      return { error: error.message };
    }
  };
  const dataUrl = (blob) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  async function load(id, path) {
    if (path.startsWith('buffer:')) {
      const text = (await kvGet(path)) ?? '';
      notify('chunk', id, text);
      return { file: path, kind: 'text', encoding: 'UTF-8', lineEnding: 'Unix' };
    }
    const file = await (await resolve(path)).getFile();
    const info = { file: path, fileSize: file.size, fileMtimeMs: file.lastModified };
    const extension = path.split('.').pop().toLowerCase();
    if (IMAGE_TYPES[extension] && extension !== 'svg' && file.size <= 50 * 1024 * 1024) {
      notify('progress', id, file.size, file.size);
      return { ...info, kind: 'image', dataUrl: await dataUrl(file) };
    }
    if (file.size <= STREAM_THRESHOLD) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = decodeText(bytes) ?? hexPreview(bytes, bytes.length);
      notify('chunk', id, doc.contents);
      notify('progress', id, file.size, file.size);
      const { contents, ...rest } = doc;
      return { ...info, ...rest };
    }
    // Large files arrive in pieces; one that isn't valid UTF-8 is read again as Windows 1252.
    const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
    const utf16 = head[0] === 0xff && head[1] === 0xfe ? 'utf-16le' : head[0] === 0xfe && head[1] === 0xff ? 'utf-16be' : null;
    if (!utf16 && head.includes(0)) {
      const { contents, ...rest } = hexPreview(new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()), file.size);
      notify('chunk', id, contents);
      return { ...info, ...rest };
    }
    const stream = async (label, fatal) => {
      const decoder = new TextDecoder(label, { fatal, ignoreBOM: false });
      const reader = file.stream().getReader();
      let read = 0;
      let pending = '';
      let carryCR = false;
      const counts = { crlf: 0, lf: 0, cr: 0 };
      const flush = (text, last) => {
        let piece = (carryCR ? '\r' : '') + text;
        carryCR = !last && piece.endsWith('\r');
        if (carryCR) piece = piece.slice(0, -1);
        counts.crlf += (piece.match(/\r\n/g) ?? []).length;
        counts.cr += (piece.match(/\r(?!\n)/g) ?? []).length;
        counts.lf += (piece.match(/(?<!\r)\n/g) ?? []).length;
        if (piece) notify('chunk', id, piece.replace(/\r\n?/g, '\n'));
      };
      for (;;) {
        if (cancelled.has(id)) return null;
        const { value, done } = await reader.read();
        if (done) break;
        read += value.length;
        pending += decoder.decode(value, { stream: true });
        if (pending.length >= PIECE) {
          flush(pending, false);
          pending = '';
          notify('progress', id, read, file.size);
        }
      }
      flush(pending + decoder.decode(), true);
      notify('progress', id, file.size, file.size);
      const { crlf, lf, cr } = counts;
      return crlf + lf + cr === 0 ? 'Windows' : crlf >= lf && crlf >= cr ? 'Windows' : lf >= cr ? 'Unix' : 'Mac OS 9';
    };
    let encoding = utf16 === 'utf-16le' ? 'UTF-16 LE' : utf16 === 'utf-16be' ? 'UTF-16 BE' : head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf ? 'UTF-8 with BOM' : 'UTF-8';
    let lineEnding;
    try {
      lineEnding = await stream(utf16 ?? 'utf-8', !utf16);
    } catch {
      notify('reset', id);
      encoding = 'Western (Windows 1252)';
      lineEnding = await stream('windows-1252', false);
    }
    if (lineEnding === null) return { ...info, cancelled: true };
    return { ...info, kind: 'text', encoding, lineEnding };
  }

  // ---------- Saving files ----------

  const writers = new Map();
  async function begin(id, target, encoding, lineEnding) {
    if (target.startsWith('buffer:')) {
      writers.set(id, { target, memory: [] });
      return;
    }
    const handle = await resolve(target, { write: true });
    const writable = await handle.createWritable();
    const writer = { target, handle, writable, encoding, lineEnding, held: encoding === 'Western (Windows 1252)' ? [] : null };
    if (!writer.held && BOMS[encoding]) await writable.write(new Uint8Array(BOMS[encoding]));
    writers.set(id, writer);
  }
  async function writePiece(id, text) {
    const writer = writers.get(id);
    if (!writer || writer.failed) return;
    try {
      if (writer.memory) writer.memory.push(text);
      else if (writer.held) writer.held.push(text);
      else await writer.writable.write(encodeChunk(text, writer.encoding, writer.lineEnding));
    } catch (error) {
      writer.failed = error;
    }
  }
  async function commit(id) {
    const writer = writers.get(id);
    writers.delete(id);
    if (!writer) throw new Error('The save was interrupted.');
    if (writer.memory) {
      await kvPut(writer.target, writer.memory.join(''));
      return { file: writer.target };
    }
    if (writer.failed) {
      await writer.writable.abort();
      throw writer.failed;
    }
    let notice;
    if (writer.held) {
      let pieces = writer.held.map((text) => encodeChunk(text, writer.encoding, writer.lineEnding));
      if (pieces.some((piece) => piece === null)) {
        writer.encoding = 'UTF-8';
        notice = 'Saved as UTF-8: the text has characters Windows 1252 cannot store.';
        pieces = writer.held.map((text) => encodeChunk(text, 'UTF-8', writer.lineEnding));
      }
      for (const piece of pieces) await writer.writable.write(piece);
    }
    await writer.writable.close();
    const file = await writer.handle.getFile();
    return { file: writer.target, fileSize: file.size, fileMtimeMs: file.lastModified, encoding: writer.encoding, notice };
  }

  // ---------- Folders ----------

  const listed = new Set();
  const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  async function list(dir) {
    const handle = await resolve(dir);
    listed.add(dir);
    const entries = [];
    for await (const [name, entry] of handle.entries()) {
      const isDir = entry.kind === 'directory';
      if ((isDir ? EXCLUDED_FOLDERS : EXCLUDED_FILES).has(name.toLowerCase())) continue;
      entries.push({ name, path: `${dir}/${name}`, isDir, entry });
    }
    await Promise.all(entries.map(async (item) => {
      item.modified = item.isDir ? 0 : (await item.entry.getFile().catch(() => null))?.lastModified ?? 0;
      delete item.entry;
    }));
    return entries.sort((a, b) => (a.isDir === b.isDir ? byName.compare(a.name, b.name) : a.isDir ? -1 : 1));
  }

  function validName(name) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Enter a name.');
    if (/[\\/:*?"<>|]/.test(trimmed)) throw new Error('A name cannot contain \\ / : * ? " < > |');
    if (trimmed === '.' || trimmed === '..') throw new Error('Choose a different name.');
    return trimmed;
  }

  async function rename(oldPath, newName) {
    const name = validName(newName);
    if (roots.some((root) => root.path === oldPath)) throw new Error('Rename this folder in File Explorer, then add it again.');
    const handle = await resolve(oldPath, { write: true });
    const newPath = `${parentOf(oldPath)}/${name}`;
    if (newPath === oldPath) return oldPath;
    if (singles.has(oldPath)) throw new Error('Only files in a sidebar folder can be renamed here.');
    const parent = await resolve(parentOf(oldPath), { write: true });
    const taken = await parent.getFileHandle(name).then(() => true, () => parent.getDirectoryHandle(name).then(() => true, () => false));
    if (taken && name.toLowerCase() !== nameOf(oldPath).toLowerCase()) throw new Error(`“${name}” already exists.`);
    if (handle.move) await handle.move(name);
    else if (handle.kind === 'file') {
      const copy = await parent.getFileHandle(name, { create: true });
      const writable = await copy.createWritable();
      await writable.write(await handle.getFile());
      await writable.close();
      await parent.removeEntry(nameOf(oldPath));
    } else throw new Error('This browser can’t rename folders; rename it in File Explorer.');
    renameTags(oldPath, newPath);
    return newPath;
  }

  // The browser can't use the Recycle Bin: deleting is for good (the sidebar asks first).
  async function remove(target) {
    const handle = await resolve(target, { write: true });
    const parent = await resolve(parentOf(target), { write: true });
    await parent.removeEntry(handle.name, { recursive: true });
    forgetTags(target);
    return { result: null };
  }

  function folderChanged(dirs) {
    notify('folder', dirs);
  }
  // Browsers don't report changes on disk; Boo looks again when you come back to it.
  window.addEventListener('focus', () => folderChanged([...listed]));
  setInterval(() => {
    if (!document.hidden) folderChanged([...listed]);
  }, 15000);

  // ---------- File tags ----------

  let fileTags = null;
  const tagsReady = (async () => {
    fileTags = (await kvGet('fileTags')) ?? {};
  })();
  const inside = (target, dir) => target === dir || target.startsWith(`${dir}/`);
  function renameTags(oldPath, newPath) {
    for (const [target, tags] of Object.entries(fileTags ?? {})) {
      if (!inside(target, oldPath)) continue;
      delete fileTags[target];
      fileTags[newPath + target.slice(oldPath.length)] = tags;
    }
    kvPut('fileTags', fileTags);
  }
  function forgetTags(target) {
    for (const key of Object.keys(fileTags ?? {})) if (inside(key, target)) delete fileTags[key];
    kvPut('fileTags', fileTags);
  }

  // ---------- Pasted pictures ----------

  const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' };
  const stamp = () => {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  };
  const toLink = (target) => `<${target}>`;
  const assetsOf = (file) => `${nameOf(file).replace(/\.[^.]*$/, '')}.assets`;

  // A saved note in a sidebar folder keeps its pictures in "<note>.assets" beside it;
  // other notes keep them in Boo's storage ("/~images/<note>/<name>").
  async function saveImage(bytes, mimeType, file, key) {
    const extension = EXTENSIONS[mimeType];
    if (!extension) throw new Error('Only PNG, JPEG, GIF, WebP and BMP images can be pasted.');
    const name = `image-${stamp()}.${extension}`;
    if (file && rootOf(file)) {
      const parent = await resolve(parentOf(file), { write: true });
      const assets = await parent.getDirectoryHandle(assetsOf(file), { create: true });
      const target = await assets.getFileHandle(name, { create: true });
      const writable = await target.createWritable();
      await writable.write(bytes);
      await writable.close();
      return { path: `${parentOf(file)}/${assetsOf(file)}/${name}`, link: toLink(`${assetsOf(file)}/${name}`) };
    }
    const path = `/~images/${key.replace(/[^\w-]/g, '')}/${name}`;
    await imagePut(path, new Blob([bytes], { type: mimeType }));
    return { path, link: toLink(path) };
  }

  // When a note is saved into a sidebar folder, its pictures move beside it.
  async function adoptPaths(paths, file) {
    if (!rootOf(file)) return [];
    const moved = [];
    for (const path of new Set(paths)) {
      if (!path.startsWith('/~images/')) continue;
      const blob = await imageGet(path);
      if (!blob) continue;
      const parent = await resolve(parentOf(file), { write: true });
      const assets = await parent.getDirectoryHandle(assetsOf(file), { create: true });
      const target = await assets.getFileHandle(nameOf(path), { create: true });
      const writable = await target.createWritable();
      await writable.write(blob);
      await writable.close();
      await imageDelete(path);
      moved.push([path, `${assetsOf(file)}/${nameOf(path)}`]);
    }
    return moved;
  }

  // The offline worker asks the page for pictures in your folders (it has no access itself).
  navigator.serviceWorker?.addEventListener('message', async (event) => {
    if (event.data?.type !== 'read') return;
    const [port] = event.ports;
    try {
      const path = event.data.path;
      const blob = path.startsWith('/~images/') ? await imageGet(path) : await (await resolve(path)).getFile();
      port.postMessage({ blob: blob ?? null });
    } catch {
      port.postMessage({ blob: null });
    }
  });

  // ---------- Background jobs ----------

  const jobs = new Map();
  function startJob(id, job, data) {
    const worker = new Worker(`${BASE}vendor/web-worker.js`);
    jobs.set(id, worker);
    worker.onmessage = ({ data: message }) => {
      notify('job', id, message);
      if (message.type === 'done' || message.type === 'error') {
        jobs.delete(id);
        worker.terminate();
      }
    };
    worker.onerror = (error) => {
      jobs.delete(id);
      notify('job', id, { type: 'error', message: error.message });
    };
    ready.then(() => Promise.all([...roots.map((root) => root.handle), ...singles.values()].map((handle) => allowed(handle, false)))).then(() => worker.postMessage({ job, data, roots: roots.map(({ path, handle }) => ({ path, handle })), files: [...singles].map(([path, handle]) => ({ path, handle })) }));
  }

  // ---------- Google Drive sync (the sync itself is renderer/sync.js) ----------

  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  // The browser's own window.open, kept before the page's scripts load.
  const openWindow = window.open.bind(window);
  let access = null;
  const syncData = async () => (await kvGet('sync')) ?? {};
  const saveSync = (data) => kvPut('sync', data);
  // For the end-to-end test: a stand-in Drive server and a fixed token.
  const testApi = () => {
    try {
      return JSON.parse(localStorage.getItem('booSyncTest') ?? 'null');
    } catch {
      return null;
    }
  };
  const random = (bytes) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  let pendingSignIn = null;
  async function tokenRequest(form) {
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) })
      .catch((error) => {
        throw new Error(`Couldn't reach Google: ${error.message}`);
      });
    const body = await response.json();
    if (!response.ok) throw new Error(`Google refused the sign-in: ${body.error_description ?? body.error ?? response.status}`);
    access = { token: body.access_token, expires: Date.now() + ((body.expires_in ?? 3600) - 120) * 1000 };
    return body;
  }

  async function status() {
    const test = testApi();
    const data = await syncData();
    if (test) return { configured: true, signedIn: true, email: 'test@example.com', enabled: data.enabled ?? true, apiBase: test.api };
    return { configured: Boolean(data.clientId), signedIn: Boolean(data.refreshToken), email: data.email, enabled: data.enabled ?? true };
  }

  async function token() {
    const test = testApi();
    if (test) return test.token;
    if (access && access.expires > Date.now()) return access.token;
    const data = await syncData();
    if (!data.refreshToken) throw new Error('Not signed in to Google Drive.');
    try {
      await tokenRequest({ refresh_token: data.refreshToken, client_id: data.clientId, client_secret: data.clientSecret ?? '', grant_type: 'refresh_token' });
    } catch (error) {
      if (/invalid_grant|expired|revoked/i.test(error.message)) {
        await saveSync({ ...data, refreshToken: undefined, email: undefined, state: undefined });
        throw new Error('Boo was signed out of Google Drive. Sign in again in Settings.');
      }
      throw error;
    }
    return access.token;
  }

  // Google's sign-in opens in a small window and comes back to oauth.html, which
  // hands the answer to this page.
  function signIn() {
    const popup = openWindow('about:blank', 'boo-google', 'width=520,height=680');
    return (async () => {
      const data = await syncData();
      if (!data.clientId) throw new Error('Set up a Google Cloud client for Boo first.');
      const verifier = random(48);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const state = random(16);
      const redirect = `${BASE}oauth.html`;
      const params = new URLSearchParams({ client_id: data.clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPE, code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent', state });
      if (!popup) throw new Error('The browser blocked the Google window; allow pop-ups for Boo and try again.');
      popup.location = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
      // Google's pages cut the link between the two windows, so the answer comes back
      // on a channel every Boo page of this site shares (oauth.html sends it). Closing
      // the Google window can't be noticed; a new sign-in or 10 minutes ends the wait.
      pendingSignIn?.(new Error('Sign-in was cancelled.'));
      const answer = await new Promise((resolve, reject) => {
        const channel = new BroadcastChannel('boo-oauth');
        const finish = (error, value) => {
          channel.close();
          clearTimeout(timer);
          pendingSignIn = null;
          if (error) reject(error);
          else resolve(value);
        };
        const timer = setTimeout(() => finish(new Error('Sign-in timed out; please try again.')), 10 * 60 * 1000);
        pendingSignIn = (error) => finish(error);
        channel.onmessage = ({ data }) => {
          const answered = new URLSearchParams(data?.search ?? '');
          if (data?.type === 'boo-oauth' && answered.get('state') === state) finish(null, answered);
        };
      });
      if (answer.get('error')) throw new Error(answer.get('error') === 'access_denied' ? 'Sign-in was cancelled.' : `Google said: ${answer.get('error')}`);
      if (answer.get('state') !== state) throw new Error('The sign-in answer didn’t match; please try again.');
      const tokens = await tokenRequest({ code: answer.get('code'), client_id: data.clientId, client_secret: data.clientSecret ?? '', redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier });
      if (!tokens.refresh_token) throw new Error('Google didn’t allow Boo to stay signed in.');
      let email = '';
      try {
        email = (await (await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: `Bearer ${access.token}` } })).json()).user?.emailAddress ?? '';
      } catch {}
      await saveSync({ ...data, refreshToken: tokens.refresh_token, email, enabled: true });
      return status();
    })().catch((error) => {
      popup?.close();
      throw error;
    });
  }

  const COMMANDS = {
    sync_status: status,
    sync_configure: async ({ clientId, clientSecret }) => saveSync({ ...(await syncData()), clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
    sync_set_enabled: async ({ enabled }) => saveSync({ ...(await syncData()), enabled }),
    sync_sign_in: signIn,
    sync_sign_out: async () => {
      access = null;
      const { refreshToken, email, state, ...rest } = await syncData();
      await saveSync(rest);
    },
    sync_token: token,
    sync_state: async () => (await syncData()).state ?? null,
    sync_set_state: async ({ stateValue }) => saveSync({ ...(await syncData()), state: stateValue }),
    sync_image_path: async ({ key, name }) => {
      const path = `/~images/${key.replace(/[^\w-]/g, '')}/${name.replace(/[\\/:*?"<>|]/g, '')}`;
      return { path, exists: Boolean(await imageGet(path)) };
    },
    sync_write_image: async ({ key, name, data }) => {
      const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
      const type = IMAGE_TYPES[name.split('.').pop().toLowerCase()] ?? 'application/octet-stream';
      await imagePut(`/~images/${key.replace(/[^\w-]/g, '')}/${name.replace(/[\\/:*?"<>|]/g, '')}`, new Blob([bytes], { type }));
    },
  };

  // ---------- Reminders: browser notifications while Boo is open ----------

  const reminderTimers = new Map();
  async function setReminders(alerts) {
    for (const timer of reminderTimers.values()) clearTimeout(timer);
    reminderTimers.clear();
    if (alerts.length && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    for (const alert of alerts) {
      const wait = alert.at - Date.now();
      if (wait < 0 || wait > 2 ** 31 - 1) continue;
      reminderTimers.set(alert.id, setTimeout(async () => {
        if (Notification.permission !== 'granted') return;
        const registration = await navigator.serviceWorker?.getRegistration();
        if (registration) registration.showNotification(alert.title, { body: alert.body, tag: alert.id, icon: `${BASE}icons/icon-192.png` });
        else new Notification(alert.title, { body: alert.body });
      }, wait));
    }
  }

  // ---------- Dropping files and folders on the window ----------

  // Files opened with Boo from File Explorer, once Boo is installed as an app.
  const launched = [];
  window.launchQueue?.setConsumer(async ({ files }) => {
    const paths = [];
    for (const handle of files ?? []) paths.push(handle.kind === 'directory' ? await addRoot(handle) : await addFile(handle));
    if (!paths.length) return;
    if (handlers.drop.length) notify('drop', paths);
    else launched.push(...paths);
  });

  document.addEventListener('drop', (event) => {
    const pending = [...(event.dataTransfer?.items ?? [])].filter((item) => item.kind === 'file').map((item) => item.getAsFileSystemHandle?.());
    Promise.all(pending).then(async (dropped) => {
      const paths = [];
      for (const handle of dropped.filter(Boolean)) paths.push(handle.kind === 'directory' ? await addRoot(handle) : await addFile(handle));
      if (paths.length) notify('drop', paths);
    });
  }, true);

  // ---------- The app shell: offline worker and install ----------

  navigator.serviceWorker?.register(`${BASE}sw.js`).catch(() => {});

  const pick = async (action) => {
    try {
      return await action();
    } catch (error) {
      if (error.name === 'AbortError') return null;
      throw error;
    }
  };

  window.boo = {
    platform: 'web',
    imageBase: IMAGE_BASE,
    sep: '/',
    nativePath: (file) => file.replace(/\\/g, '/'),
    call: (command, args = {}) => {
      const run = COMMANDS[command];
      if (!run) return Promise.reject(new Error(`Unknown command ${command}`));
      return run(args);
    },

    loadSession: async () => {
      await ready;
      const candidates = (await Promise.all([kvGet('session'), kvGet('autosave')])).filter((session) => session?.version === 1 && Array.isArray(session.buffers));
      candidates.sort((a, b) => b.savedAt - a.savedAt);
      const session = candidates[0];
      if (!session) return null;
      // Like the app core: saved files with no unsaved changes are read again from disk.
      session.buffers = session.buffers.map((buffer) => {
        if (!buffer.file || buffer.dirty || (buffer.kind && buffer.kind !== 'text' && buffer.kind !== 'rich')) return buffer;
        const { contents, contentsFile, ...fromDisk } = buffer;
        return { ...fromDisk, dirty: false };
      });
      return session;
    },
    autosave: (session) => {
      kvPut('autosave', { ...session, version: 1, savedAt: Date.now() });
    },
    onCollect: () => {},
    collecting: () => {},
    sendFinal: (session) => {
      kvPut('session', { ...session, version: 1, savedAt: Date.now() });
    },

    loadFile: (id, file) => {
      cancelled.delete(id);
      attempt(() => load(id, file)).then((outcome) => notify('done', id, outcome));
    },
    cancelLoad: (id) => cancelled.add(id),
    onLoadChunk: (handler) => handlers.chunk.push(handler),
    onLoadDone: (handler) => handlers.done.push(handler),
    onLoadReset: (handler) => handlers.reset.push(handler),
    onLoadProgress: (handler) => handlers.progress.push(handler),
    chooseFiles: async () => {
      const handles = await pick(() => window.showOpenFilePicker({ multiple: true }));
      const paths = [];
      for (const handle of handles ?? []) paths.push(await addFile(handle));
      return paths;
    },
    chooseSavePath: async (suggestedName, defaultDir) => {
      let startIn;
      if (defaultDir) startIn = await resolve(defaultDir).catch(() => undefined);
      const handle = await pick(() => window.showSaveFilePicker({ suggestedName, ...(startIn?.kind === 'directory' ? { startIn } : {}) }));
      return handle ? addFile(handle) : null;
    },

    beginDocument: (id, target, encoding, lineEnding) => attempt(() => begin(String(id), target, encoding, lineEnding)),
    sendDocumentChunk: (id, text) => {
      const writer = writers.get(String(id));
      if (writer) writer.chain = (writer.chain ?? Promise.resolve()).then(() => writePiece(String(id), text));
    },
    commitDocument: async (id) => {
      await writers.get(String(id))?.chain;
      return attempt(() => commit(String(id)));
    },
    abortDocument: (id) => {
      const writer = writers.get(String(id));
      writers.delete(String(id));
      writer?.writable?.abort();
    },

    startJob,
    stopJob: (id) => {
      const worker = jobs.get(id);
      if (!worker) return;
      jobs.delete(id);
      worker.terminate();
      notify('job', id, { type: 'stopped' });
    },
    onJobEvent: (handler) => handlers.job.push(handler),
    drives: async () => [],

    pickFolders: async () => {
      const handle = await pick(() => window.showDirectoryPicker({ mode: 'readwrite' }));
      return handle ? [await addRoot(handle)] : [];
    },
    listFolder: (dir) => list(dir),
    watchFolders: () => {},
    onFolderChanged: (callback) => handlers.folder.push(callback),

    renamePath: (oldPath, newName) => attempt(() => rename(oldPath, newName)),
    newFolder: (parent, name) => attempt(async () => {
      const folder = validName(name);
      const handle = await resolve(parent, { write: true });
      const exists = await handle.getDirectoryHandle(folder).then(() => true, () => false);
      if (exists) throw new Error(`“${folder}” already exists.`);
      await handle.getDirectoryHandle(folder, { create: true });
      return `${parent}/${folder}`;
    }),
    trashPath: (target) => remove(target).catch((error) => ({ error: error.message })),
    revealPath: () => {},
    isDirectory: async (target) => (await resolve(target)).kind === 'directory',
    pathForFile: () => null,
    onDroppedPaths: (callback) => {
      handlers.drop.push(callback);
      if (launched.length) setTimeout(() => callback(launched.splice(0)), 500);
    },

    saveImage: (bytes, mimeType, file, key) => attempt(() => saveImage(bytes, mimeType, file, key)),
    adoptImages: (text, file) => attempt(async () => {
      const targets = [...text.matchAll(/!\[[^\]]*\]\(<([^>]+)>\)/g)].map((match) => match[1]);
      return (await adoptPaths(targets, file)).map(([target, relative]) => [toLink(target), toLink(relative)]);
    }),
    adoptImagePaths: (paths, file) => attempt(() => adoptPaths(paths, file)),

    fileTags: async () => {
      await tagsReady;
      return fileTags;
    },
    setFileTags: async (target, tags) => {
      await tagsReady;
      const clean = [...new Set(tags.map(BooEditor.tagParse.normalizeTag).filter(Boolean))];
      if (clean.length) fileTags[target] = clean;
      else delete fileTags[target];
      await kvPut('fileTags', fileTags);
      return clean;
    },

    setTheme: () => {},
    quitApp: () => window.close(),
    setKeepInTray: () => {},
    setReminders,
    onReminderDue: () => {},
    minimizeWindow: () => {},
    toggleMaximizeWindow: () => {},
    closeWindow: () => window.close(),
    onWindowState: (callback) => {
      const update = () => callback({ focused: document.hasFocus(), maximized: false });
      window.addEventListener('focus', update);
      window.addEventListener('blur', update);
      update();
    },

    // For the end-to-end test: a folder from the browser's private storage stands in
    // for one you picked.
    adoptFolderHandle: (handle) => addRoot(handle),
  };

  // Hot exit in a browser: the session is written as you work and when the page goes away.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && typeof runAutosave === 'function') runAutosave();
  });
})();
