// Folder sidebar, modelled on Sublime Text's side bar:
// - the folder list and which folders are expanded are saved in the session;
// - folders are watched, so the tree updates when files change on disk;
// - single-click previews a file, double-click opens it in a tab;
// - right-click offers Sublime's side bar commands (New File, Rename, Delete...);
//   F2 renames the selected item;
// - drag a row up or down to put it where you want among its neighbours (the order
//   is Boo's own, kept in the session; nothing moves on disk);
// - pinned files are listed in a Pinned section at the top.
const Sidebar = (() => {
  const { el } = Dialogs;
  const tree = document.getElementById('tree');
  const empty = document.getElementById('sidebar-empty');
  const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|ico|avif|svg)$/i;
  const PINNED = 'pinned';
  const ROOTS = '';

  let folders = [];
  let expanded = new Set();
  let selectedPath = null;
  // Your own order of the items in a folder: { [folder]: [names] }.
  let order = {};
  let pinned = [];
  const listings = new Map();
  let handlers = {};
  let suppressClick = false;

  // "14:32" today, "25 Oct" this year, "25 Oct 2025" before.
  function shortDate(ms) {
    const date = new Date(ms);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }
  const fullDate = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  // A folder's entries in your order: the ones you placed first, the rest after,
  // folders before files, by name.
  function sorted(dir, entries) {
    const placed = order[dir];
    if (!placed?.length) return entries;
    const rank = new Map(placed.map((name, index) => [name, index]));
    return [...entries].sort((a, b) => (rank.get(a.name) ?? Infinity) - (rank.get(b.name) ?? Infinity));
  }

  const baseName = (target) => target.split(/[\\/]/).filter(Boolean).pop() ?? target;
  const parentOf = (target) => target.replace(/[\\/][^\\/]*[\\/]?$/, '');
  const isInside = (target, dir) => target === dir || target.startsWith(`${dir}\\`) || target.startsWith(`${dir}/`);
  const replacePrefix = (target, oldPath, newPath) =>
    isInside(target, oldPath) ? newPath + target.slice(oldPath.length) : target;

  async function load(dir) {
    try {
      listings.set(dir, await window.boo.listFolder(dir));
    } catch {
      listings.set(dir, { error: 'This folder can’t be read. It may have been moved or deleted.' });
    }
  }

  async function refreshAll() {
    const dirs = [...folders, ...[...expanded].filter((dir) => folders.some((root) => isInside(dir, root)))];
    await Promise.all([...new Set(dirs)].map(load));
    render();
  }

  function row({ path, name, isDir, depth, isRoot, modified, parent, isPin }) {
    const node = el('div', `row${isRoot ? ' root' : ''}${isPin ? ' pin-row' : ''}${path === selectedPath ? ' selected' : ''}`);
    node.setAttribute('role', 'treeitem');
    node.tabIndex = -1;
    node.title = modified ? `${path}\nModified ${fullDate(modified)}` : path;
    node.dataset.path = path;
    node.dataset.parent = parent;
    node.style.setProperty('--depth', depth);
    node.addEventListener('mousedown', (event) => startDrag(event, { path, name, parent }));

    const chevron = el('span', 'chevron');
    if (isDir) {
      chevron.innerHTML = Icons.chevron;
      node.setAttribute('aria-expanded', String(expanded.has(path)));
      chevron.classList.toggle('open', expanded.has(path));
    }
    const icon = el('span', `row-icon ${isDir ? 'folder' : 'file'}`);
    icon.innerHTML = isDir ? Icons.folder : IMAGE_EXTENSIONS.test(name) ? Icons.photo : Icons.doc;
    node.append(chevron, icon, el('span', 'row-name', name));
    if (isPin) node.append(el('span', 'row-folder', baseName(parentOf(path))));
    else if (pinned.includes(path)) node.append(el('span', 'row-pin', '📌'));
    // Colored dots for tags given to the file, like Finder and the iOS Files app.
    const tags = TagsView.fileTagsFor(path);
    if (tags.length) {
      const dots = el('span', 'tag-dots');
      dots.title = tags.map((tag) => `#${tag}`).join(' ');
      for (const tag of tags.slice(0, 3)) dots.append(el('span', `tag-dot tag-${BooEditor.tagParse.tagColor(tag)}`));
      node.append(dots);
    }
    if (!isDir && modified) node.append(el('span', 'row-date', shortDate(modified)));

    node.addEventListener('click', () => {
      if (suppressClick) return;
      select(path);
      if (isDir) toggle(path);
      else handlers.onFileClick(path);
    });
    node.addEventListener('dblclick', () => {
      if (!isDir) handlers.onFileOpen(path);
    });
    node.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      select(path);
      showMenu({ path, isDir, isRoot }, event.clientX, event.clientY);
    });
    return node;
  }

  function appendChildren(fragment, dir, depth) {
    const listing = listings.get(dir);
    if (!listing) return;
    if (listing.error) {
      const note = el('div', 'row-note', listing.error);
      note.style.setProperty('--depth', depth);
      fragment.append(note);
      return;
    }
    for (const entry of sorted(dir, listing)) {
      fragment.append(row({ ...entry, depth, parent: dir }));
      if (entry.isDir && expanded.has(entry.path)) appendChildren(fragment, entry.path, depth + 1);
    }
  }

  function render() {
    const fragment = document.createDocumentFragment();
    if (pinned.length) {
      fragment.append(el('div', 'tree-header', 'Pinned'));
      for (const target of pinned) fragment.append(row({ path: target, name: baseName(target), isDir: false, depth: 0, parent: PINNED, isPin: true }));
      if (folders.length) fragment.append(el('div', 'tree-header', 'Folders'));
    }
    for (const root of folders) {
      fragment.append(row({ path: root, name: baseName(root), isDir: true, depth: 0, isRoot: true, parent: ROOTS }));
      if (expanded.has(root)) appendChildren(fragment, root, 1);
    }
    tree.replaceChildren(fragment);
    empty.hidden = folders.length > 0 || pinned.length > 0;
  }

  // ---------- Dragging rows into your own order ----------

  // A row can be dropped above or below its neighbours: items in the same folder,
  // pinned files among pinned files, sidebar folders among sidebar folders.
  function startDrag(event, item) {
    if (event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY };
    let ghost = null;
    let target = null;
    const clear = () => tree.querySelectorAll('.drop-before, .drop-after').forEach((node) => node.classList.remove('drop-before', 'drop-after'));
    const move = (moving) => {
      if (!ghost) {
        if (Math.hypot(moving.clientX - start.x, moving.clientY - start.y) < 6) return;
        ghost = el('div', 'drag-ghost', item.name);
        document.body.append(ghost);
        document.body.classList.add('dragging-row');
      }
      ghost.style.transform = `translate(${moving.clientX + 12}px, ${moving.clientY + 8}px)`;
      clear();
      const over = document.elementFromPoint(moving.clientX, moving.clientY)?.closest?.('#tree .row');
      target = null;
      if (over && over.dataset.parent === item.parent && over.dataset.path !== item.path) {
        const box = over.getBoundingClientRect();
        target = { path: over.dataset.path, after: moving.clientY > box.top + box.height / 2 };
        over.classList.add(target.after ? 'drop-after' : 'drop-before');
      }
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!ghost) return;
      ghost.remove();
      document.body.classList.remove('dragging-row');
      clear();
      // The click that ends a drag doesn't open the file.
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (target) reorder(item, target);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function reorder(item, { path: targetPath, after }) {
    const place = (list, value, key = (entry) => entry) => {
      const rest = list.filter((entry) => key(entry) !== key(value));
      const index = rest.findIndex((entry) => key(entry) === targetPath) + (after ? 1 : 0);
      rest.splice(index, 0, value);
      return rest;
    };
    if (item.parent === PINNED) pinned = place(pinned, item.path);
    else if (item.parent === ROOTS) folders = place(folders, item.path);
    else {
      const listing = listings.get(item.parent);
      if (!Array.isArray(listing)) return;
      const entries = sorted(item.parent, listing);
      const moved = entries.find((entry) => entry.path === item.path);
      order[item.parent] = place(entries, moved, (entry) => entry.path).map((entry) => entry.name);
    }
    render();
    handlers.onChange();
  }

  function setPinned(target, pin) {
    pinned = pin ? [...pinned.filter((item) => item !== target), target] : pinned.filter((item) => item !== target);
    render();
    handlers.onChange();
  }

  function select(target) {
    selectedPath = target;
    for (const node of tree.querySelectorAll('.row')) node.classList.toggle('selected', node.dataset.path === target);
  }

  async function toggle(dir) {
    if (expanded.has(dir)) {
      expanded.delete(dir);
    } else {
      expanded.add(dir);
      if (!listings.has(dir)) await load(dir);
    }
    render();
    handlers.onChange();
  }

  function watch() {
    window.boo.watchFolders(folders);
  }

  async function addFolders(paths) {
    const added = paths.filter((target) => !folders.includes(target));
    if (!added.length) return;
    folders.push(...added);
    for (const target of added) expanded.add(target);
    watch();
    await refreshAll();
    handlers.onChange();
  }

  function removeFolder(root) {
    folders = folders.filter((target) => target !== root);
    for (const dir of [...expanded]) if (isInside(dir, root)) expanded.delete(dir);
    for (const dir of [...listings.keys()]) if (isInside(dir, root)) listings.delete(dir);
    watch();
    render();
    handlers.onChange();
  }

  async function showError(title, message) {
    await Dialogs.alert({ title, message });
  }

  async function rename(target, isRoot) {
    const name = baseName(target);
    const dot = name.lastIndexOf('.');
    const newName = await Dialogs.prompt({
      title: 'Rename',
      message: `Enter a new name for “${name}”.`,
      value: name,
      select: [0, dot > 0 ? dot : name.length],
      confirmLabel: 'Rename',
    });
    if (newName === null || newName === name) return;
    const { result: newPath, error } = await window.boo.renamePath(target, newName);
    if (error) return showError('Unable to Rename', error);

    // Like Sublime's rename_path, open tabs follow the file to its new name; so do its
    // place in your order and its pin.
    folders = folders.map((dir) => (dir === target && isRoot ? newPath : dir));
    expanded = new Set([...expanded].map((dir) => replacePrefix(dir, target, newPath)));
    pinned = pinned.map((item) => replacePrefix(item, target, newPath));
    order = Object.fromEntries(Object.entries(order).map(([dir, names]) => [
      replacePrefix(dir, target, newPath),
      parentOf(target) === dir ? names.map((item) => (item === name ? baseName(newPath) : item)) : names,
    ]));
    for (const dir of [...listings.keys()]) if (isInside(dir, target)) listings.delete(dir);
    selectedPath = newPath;
    handlers.onRenamed(target, newPath);
    if (isRoot) watch();
    await refreshAll();
    handlers.onChange();
  }

  async function newFolder(parent) {
    const name = await Dialogs.prompt({ title: 'New Folder', placeholder: 'Folder name', confirmLabel: 'Create' });
    if (name === null) return;
    const { error } = await window.boo.newFolder(parent, name);
    if (error) return showError('Unable to Create Folder', error);
    expanded.add(parent);
    await load(parent);
    render();
    handlers.onChange();
  }

  // Sublime sends files to the trash without asking, and asks first for folders.
  // A browser has no Recycle Bin, so there Boo always asks.
  async function trash(target, isDir) {
    const web = window.boo.platform === 'web';
    if (isDir || web) {
      const confirmed = await Dialogs.alert({
        title: `Delete “${baseName(target)}”${web ? ' for good' : ''}?`,
        message: web
          ? 'In the browser Boo can’t use the Recycle Bin, so this can’t be undone.'
          : 'The folder and everything in it will be moved to the Recycle Bin.',
        buttons: [
          { label: 'Cancel', value: false, role: 'cancel' },
          { label: 'Delete', value: true, role: 'destructive' },
        ],
      });
      if (!confirmed) return;
    }
    const { error } = await window.boo.trashPath(target);
    if (error) return showError('Unable to Delete', error);
    pinned = pinned.filter((item) => !isInside(item, target));
    handlers.onDeleted(target);
    await load(parentOf(target));
    render();
  }

  async function showMenu({ path: target, isDir, isRoot }, x, y) {
    const items = isDir
      ? [
          { label: 'New File', value: 'newFile', icon: 'newFile' },
          { label: 'New Folder…', value: 'newFolder', icon: 'newFolder' },
          { label: 'Rename…', value: 'rename', icon: 'rename', shortcut: 'F2' },
          { label: 'Tags…', value: 'tags', icon: 'tag' },
          { label: 'Open in File Explorer', value: 'reveal', icon: 'reveal' },
          'separator',
          isRoot
            ? { label: 'Remove Folder from Sidebar', value: 'remove', icon: 'remove' }
            : { label: 'Delete Folder', value: 'trash', icon: 'trash', destructive: true },
        ]
      : [
          { label: 'Open', value: 'open', icon: 'doc' },
          pinned.includes(target)
            ? { label: 'Unpin', value: 'unpin', icon: 'remove' }
            : { label: 'Pin to Top', value: 'pin', icon: 'tag' },
          { label: 'Rename…', value: 'rename', icon: 'rename', shortcut: 'F2' },
          { label: 'Tags…', value: 'tags', icon: 'tag' },
          { label: 'Open Containing Folder', value: 'reveal', icon: 'reveal' },
          'separator',
          { label: 'Delete File', value: 'trash', icon: 'trash', destructive: true },
        ];
    // A browser can't open File Explorer.
    if (window.boo.platform === 'web') items.splice(items.findIndex((item) => item.value === 'reveal'), 1);
    const choice = await Dialogs.menu({ x, y, items });
    const actions = {
      open: () => handlers.onFileOpen(target),
      newFile: () => handlers.onNewFile(target),
      newFolder: () => newFolder(target),
      rename: () => rename(target, isRoot),
      tags: () => handlers.onEditTags(target),
      reveal: () => window.boo.revealPath(target),
      remove: () => removeFolder(target),
      trash: () => trash(target, isDir),
      pin: () => setPinned(target, true),
      unpin: () => setPinned(target, false),
    };
    actions[choice]?.();
  }

  // F2: rename the selected file or folder, its extension included.
  function renameSelected() {
    if (!selectedPath) return false;
    rename(selectedPath, folders.includes(selectedPath));
    return true;
  }

  // Reload listings for directories that changed on disk.
  window.boo.onFolderChanged(async (dirs) => {
    const stale = [...listings.keys()].filter((dir) => dirs.includes(dir));
    if (!stale.length) return;
    await Promise.all(stale.map(load));
    render();
  });

  function init(state, eventHandlers) {
    folders = state.folders ?? [];
    expanded = new Set(state.expanded ?? []);
    order = state.order ?? {};
    pinned = state.pinned ?? [];
    handlers = eventHandlers;
    watch();
    render();
    return refreshAll();
  }

  // Folders / Search / Tags, switched with the segmented control at the top.
  const switcher = document.getElementById('sidebar-switcher');
  function showView(name) {
    for (const button of switcher.querySelectorAll('.segment')) {
      button.setAttribute('aria-checked', String(button.dataset.view === name));
    }
    for (const section of document.querySelectorAll('.sidebar-view')) section.hidden = section.id !== `${name}-view`;
    if (name === 'tags') TagsView.refresh();
  }
  switcher.addEventListener('click', (event) => {
    const button = event.target.closest('.segment');
    if (button) showSidebarView(button.dataset.view);
  });

  return {
    init,
    addFolders,
    showView,
    render,
    folders: () => [...folders],
    state: () => ({ folders: [...folders], expanded: [...expanded], order, pinned: [...pinned] }),
    reveal: select,
    renameSelected,
    shortDate,
    fullDate,
  };
})();
