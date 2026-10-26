// Tags, for finding things by keyword. Two kinds, shown together:
// - #hashtags written in notes (plain text and Markdown), found in open tabs and in
//   the notes inside the sidebar folders;
// - tags given to whole files or folders from the sidebar (right-click › Tags…),
//   kept by Boo without changing the files.
// Pick a tag to list the files that carry it and every line that mentions it.
const TagsView = (() => {
  const { el } = Dialogs;
  const { tagColor, normalizeTag, findHashtags, isNoteFile } = BooEditor.tagParse;
  const listView = document.getElementById('tags-list-view');
  const list = document.getElementById('tags-list');
  const filterInput = document.getElementById('tags-filter');
  const detailView = document.getElementById('tag-detail');
  const scanStatus = document.getElementById('tags-status');
  const MAX_BUFFER_CHARS = 2 * 1024 * 1024;

  let fileTags = {};
  let folderMentions = new Map();
  let scannedRoots = null;
  let stale = true;
  let job = null;
  let detailTag = null;

  const fileTagsFor = (target) => fileTags[target] ?? [];

  function chip(tag, { removable = false, onRemove } = {}) {
    const node = el('span', `tag-chip tag-${tagColor(tag)}`, `#${tag}`);
    if (removable) {
      const remove = el('button', 'tag-chip-remove', '×');
      remove.title = `Remove #${tag}`;
      remove.addEventListener('click', onRemove);
      node.append(remove);
    }
    return node;
  }

  // Hashtags in open tabs win over the copy on disk, so unsaved edits count.
  function bufferMentions() {
    const found = [];
    for (const buffer of buffers) {
      // The guide's examples (#invoice, #todo) aren't real tags.
      if (!buffer.loaded || buffer.guide) continue;
      let text;
      if (isRich(buffer)) {
        text = RichNotes.textOf(buffer);
      } else {
        if (buffer.kind !== 'text' || !isNoteFile(buffer.file ? baseName(buffer.file) : null)) continue;
        const state = buffer === current() ? view.state : buffer.state;
        if (state.doc.length > MAX_BUFFER_CHARS) continue;
        text = state.doc.toString();
      }
      if (text.length > MAX_BUFFER_CHARS) continue;
      for (const mention of findHashtags(text)) found.push({ ...mention, file: buffer.file, buffer });
    }
    return found;
  }

  function collect() {
    const tags = new Map();
    const entry = (tag) => {
      if (!tags.has(tag)) tags.set(tag, { tag, files: [], mentions: [] });
      return tags.get(tag);
    };
    for (const [target, names] of Object.entries(fileTags)) for (const name of names) entry(name).files.push(target);
    const open = new Set(buffers.filter((buffer) => buffer.loaded && buffer.file).map((buffer) => buffer.file));
    for (const mention of bufferMentions()) entry(mention.tag).mentions.push(mention);
    for (const [file, mentions] of folderMentions) {
      if (open.has(file)) continue;
      for (const mention of mentions) entry(mention.tag).mentions.push({ ...mention, file });
    }
    return tags;
  }

  function scan() {
    const roots = Sidebar.folders();
    const key = roots.join('|');
    if (!stale && key === scannedRoots) return;
    if (job) Jobs.stop(job);
    stale = false;
    scannedRoots = key;
    if (!roots.length) {
      folderMentions = new Map();
      render();
      return;
    }
    const found = new Map();
    scanStatus.textContent = 'Looking for #tags in your folders…';
    job = Jobs.start('tags', { roots }, (message) => {
      if (message.type === 'tags') found.set(message.file, message.tags);
      if (message.type === 'done' || message.type === 'error' || message.type === 'stopped') {
        job = null;
        if (message.type === 'done') folderMentions = found;
        scanStatus.textContent = '';
        render();
      }
    });
  }

  function render() {
    const tags = [...collect().values()];
    if (detailTag) {
      renderDetail(tags.find((item) => item.tag === detailTag) ?? { tag: detailTag, files: [], mentions: [] });
      return;
    }
    detailView.hidden = true;
    listView.hidden = false;
    const filter = normalizeTag(filterInput.value);
    const shown = tags
      .filter((item) => !filter || item.tag.includes(filter))
      .sort((a, b) => b.files.length + b.mentions.length - (a.files.length + a.mentions.length) || a.tag.localeCompare(b.tag));
    if (!shown.length) {
      list.replaceChildren(el('div', 'empty-note', tags.length
        ? 'No tags match.'
        : window.boo.platform === 'android'
          ? 'No tags yet. Write #tags in your notes.'
          : 'No tags yet. Write #tags in your notes, or right-click a file in Folders and choose Tags…'));
      return;
    }
    list.replaceChildren(...shown.map((item) => {
      const row = el('button', 'tag-row');
      const counts = [];
      if (item.files.length) counts.push(`${item.files.length} file${item.files.length === 1 ? '' : 's'}`);
      if (item.mentions.length) counts.push(`${item.mentions.length} mention${item.mentions.length === 1 ? '' : 's'}`);
      row.append(el('span', `tag-dot tag-${tagColor(item.tag)}`), el('span', 'tag-name', `#${item.tag}`), el('span', 'tag-count', counts.join(' · ')));
      row.addEventListener('click', () => show(item.tag));
      return row;
    }));
  }

  function renderDetail({ tag, files, mentions }) {
    listView.hidden = true;
    detailView.hidden = false;
    const back = el('button', 'back-button', 'Tags');
    back.addEventListener('click', () => {
      detailTag = null;
      render();
    });
    const header = el('div', 'tag-detail-header');
    header.append(chip(tag));
    const parts = [back, header];

    if (files.length) {
      parts.push(el('div', 'list-header', 'Tagged Files'));
      const group = el('div', 'list-group');
      for (const file of files) {
        const row = el('button', 'list-row link-row');
        const icon = el('span', 'row-icon file');
        icon.innerHTML = Icons.doc;
        row.append(icon, el('span', 'list-label', baseName(file)), el('span', 'result-dir', dirName(file)));
        row.title = file;
        row.addEventListener('click', () => openPath(file, { preview: settings.previewOnClick }));
        group.append(row);
      }
      parts.push(group);
    }

    if (mentions.length) {
      parts.push(el('div', 'list-header', 'Mentions'));
      const byFile = new Map();
      for (const mention of mentions) {
        const key = mention.file ?? `buffer:${mention.buffer.id}`;
        if (!byFile.has(key)) byFile.set(key, []);
        byFile.get(key).push(mention);
      }
      for (const items of byFile.values()) {
        const { file, buffer } = items[0];
        const section = el('div', 'result-file');
        const top = el('div', 'result-header');
        const icon = el('span', 'row-icon file');
        icon.innerHTML = Icons.doc;
        top.append(icon, el('span', 'result-name', file ? baseName(file) : title(buffer)), el('span', 'result-count', String(items.length)));
        top.title = file ?? 'Unsaved note';
        section.append(top);
        for (const mention of items) {
          const row = el('div', 'result-line');
          const text = el('span', 'result-text');
          text.append(highlightText(mention.preview, { ranges: [[mention.column, mention.column + mention.display.length + 1]] }));
          row.append(el('span', 'result-number', String(mention.line)), text);
          row.addEventListener('click', () => {
            const at = { line: mention.line, column: mention.column, length: mention.display.length + 1 };
            if (file) openPath(file, { preview: settings.previewOnClick, at });
            else {
              const index = buffers.indexOf(buffer);
              if (index === -1) return;
              select(index);
              revealMatch(at);
            }
          });
          section.append(row);
        }
        parts.push(section);
      }
    }
    if (!files.length && !mentions.length) parts.push(el('div', 'empty-note', `Nothing is tagged #${tag} yet.`));
    detailView.replaceChildren(...parts);
  }

  function show(tag) {
    detailTag = normalizeTag(tag);
    scan();
    render();
  }

  // File tags are re-read because renames and deletes update them in the main process.
  async function refresh() {
    fileTags = await window.boo.fileTags();
    Sidebar.render();
    scan();
    render();
  }

  // The Tags… sheet for a file or folder: chips to remove, a field to add, and
  // suggestions from tags already in use.
  async function editFileTags(target) {
    let tags = [...fileTagsFor(target)];
    const known = [...collect().keys()];
    const content = el('div', 'tag-editor');
    const chips = el('div', 'tag-chips');
    const input = el('input', 'alert-input tag-input');
    input.placeholder = 'Add a tag and press Enter';
    input.spellcheck = false;
    const suggestions = el('div', 'tag-suggestions');
    const done = el('button', 'filled-button', 'Done');

    const draw = () => {
      chips.replaceChildren(...(tags.length
        ? tags.map((tag) => chip(tag, { removable: true, onRemove: () => { tags = tags.filter((item) => item !== tag); draw(); } }))
        : [el('span', 'empty-note', 'No tags yet.')]));
      const typed = normalizeTag(input.value);
      const options = known.filter((tag) => !tags.includes(tag) && (!typed || tag.includes(typed))).slice(0, 12);
      suggestions.replaceChildren(...options.map((tag) => {
        const button = chip(tag);
        button.classList.add('suggestion');
        button.addEventListener('click', () => add(tag));
        return button;
      }));
    };
    const add = (value) => {
      for (const part of value.split(/[,\s]+/)) {
        const tag = normalizeTag(part);
        if (tag && !tags.includes(tag)) tags.push(tag);
      }
      input.value = '';
      draw();
      input.focus();
    };
    input.addEventListener('input', draw);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        if (input.value.trim()) add(input.value);
        else sheet.close();
      } else if (event.key === 'Backspace' && !input.value && tags.length) {
        tags.pop();
        draw();
      }
    });

    content.append(
      el('div', 'alert-title', 'Tags'),
      el('div', 'alert-message', baseName(target)),
      chips,
      input,
      suggestions,
      done,
    );
    const save = async () => {
      if (input.value.trim()) add(input.value);
      const saved = await window.boo.setFileTags(target, tags);
      if (saved.length) fileTags[target] = saved;
      else delete fileTags[target];
      Sidebar.render();
      render();
    };
    const sheet = Dialogs.sheet(content, { className: 'tag-sheet', onClose: save });
    done.addEventListener('click', () => sheet.close());
    draw();
    input.focus();
  }

  async function init() {
    fileTags = await window.boo.fileTags();
    Sidebar.render();
    filterInput.addEventListener('input', render);
    window.boo.onFolderChanged(() => {
      stale = true;
      if (!document.getElementById('tags-view').hidden) refresh();
    });
  }

  return { init, show, refresh, editFileTags, fileTagsFor };
})();
