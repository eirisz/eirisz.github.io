// Note templates. Picking one opens a form with its questions; the answers become a
// new rich text note with a heading per question, tagged with #hashtags (editable in
// the form) so the note shows up in the Tags view. To add a template, add an entry
// to TEMPLATES.
const Templates = (() => {
  const { el } = Dialogs;
  const { normalizeTag, tagColor } = BooEditor.tagParse;

  // `list` fields turn one line per item into a numbered list; `code` fields become
  // a fenced block so logs keep their exact text.
  const TEMPLATES = [
    {
      id: 'rca',
      name: 'RCA',
      title: 'Root Cause Analysis',
      description: 'Issue, what it affected, logs, troubleshooting and the fix',
      tags: ['rca'],
      heading: (answers) => `RCA: ${firstLine(answers.issue) || 'Untitled issue'}`,
      fields: [
        { key: 'issue', label: 'Issue description', placeholder: 'What happened, when, and who noticed it?', lines: 3, required: true },
        { key: 'affected', label: 'Software/Hardware affected', placeholder: 'Product, version, device or system', lines: 2 },
        { key: 'logs', label: 'Logs content', placeholder: 'Paste the relevant log lines', lines: 6, code: true },
        { key: 'steps', label: 'Troubleshooting steps', placeholder: 'One step per line', lines: 4, list: true },
        { key: 'fix', label: 'Fix/Resolution', placeholder: 'What fixed it, and the root cause', lines: 3 },
        { key: 'notes', label: 'Additional Notes', placeholder: 'Follow-ups, prevention, links', lines: 2 },
      ],
    },
    {
      id: 'onboarding',
      name: 'Onboarding',
      title: 'Onboarding',
      description: 'A product and its step-by-step onboarding procedure',
      tags: ['onboarding'],
      heading: (answers) => `Onboarding: ${firstLine(answers.product) || 'Untitled product'}`,
      fields: [
        { key: 'product', label: 'Product', placeholder: 'Product name', lines: 1, required: true },
        { key: 'procedure', label: 'Details of the onboarding step by step procedure', placeholder: 'One step per line', lines: 6, list: true },
        { key: 'notes', label: 'Additional notes', placeholder: 'Prerequisites, contacts, links', lines: 2 },
      ],
    },
    {
      id: 'eisenhower',
      name: 'Eisenhower',
      title: 'Eisenhower Matrix',
      description: 'Sort tasks into Do, Schedule, Delegate and Drop',
      tags: ['priorities'],
      heading: (answers) => firstLine(answers.title) || `Priorities, ${today()}`,
      fields: [
        { key: 'title', label: 'Title', placeholder: 'e.g. This week', lines: 1 },
        { key: 'do', label: 'Do first — urgent and important', placeholder: 'One task per line', lines: 3 },
        { key: 'schedule', label: 'Schedule — important, not urgent', placeholder: 'One task per line', lines: 3 },
        { key: 'delegate', label: 'Delegate — urgent, not important', placeholder: 'One task per line', lines: 3 },
        { key: 'drop', label: 'Drop — neither urgent nor important', placeholder: 'One task per line', lines: 3 },
      ],
      // A 2×2 grid of checklists, one quadrant per cell, each in its own colour.
      // The labels are ordinary headings (rename them freely) and Cell Color in the
      // table bar recolours a quadrant.
      render: (template, answers, tags) => {
        const QUADRANTS = [
          { key: 'do', label: 'Do first', hint: 'Urgent · Important', color: 'rgba(255, 59, 48, 0.18)' },
          { key: 'schedule', label: 'Schedule', hint: 'Important · Not urgent', color: 'rgba(0, 122, 255, 0.18)' },
          { key: 'delegate', label: 'Delegate', hint: 'Urgent · Not important', color: 'rgba(255, 204, 0, 0.24)' },
          { key: 'drop', label: 'Drop', hint: 'Not urgent · Not important', color: 'rgba(142, 142, 147, 0.22)' },
        ];
        const cell = ({ key, label, hint, color }) => {
          const tasks = (answers[key] ?? '').split('\n').map((line) => line.trim().replace(/^([-*•]|\d+[.)]|\[ ?\])\s*/, '')).filter(Boolean);
          const items = (tasks.length ? tasks : ['']).map((task) => `<li data-type="taskItem" data-checked="false"><p>${escapeHtml(task)}</p></li>`).join('');
          return `<td style="background-color: ${color}"><h3>${label}</h3><p><em>${hint}</em></p><ul data-type="taskList">${items}</ul></td>`;
        };
        const parts = [`<h1>${escapeHtml(template.heading(answers))}</h1>`, `<p>Date: ${today()}</p>`];
        if (tags.length) parts.push(`<p>Tags: ${tags.map((tag) => `#${escapeHtml(tag)}`).join(' ')}</p>`);
        parts.push(`<table><tbody><tr>${cell(QUADRANTS[0])}${cell(QUADRANTS[1])}</tr><tr>${cell(QUADRANTS[2])}${cell(QUADRANTS[3])}</tr></tbody></table><p></p>`);
        return parts.join('');
      },
    },
  ];

  const NOT_PROVIDED = 'Not provided';

  function firstLine(text = '') {
    return text.trim().split('\n', 1)[0].trim().slice(0, 80);
  }

  const escapeHtml = (text) => text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

  // One step per line becomes a numbered list (existing "1." or "-" markers are dropped).
  function numberedList(text) {
    const items = text.split('\n').map((line) => line.trim().replace(/^(\d+[.)]|[-*•])\s+/, '')).filter(Boolean);
    return `<ol>${items.map((item) => `<li><p>${escapeHtml(item)}</p></li>`).join('')}</ol>`;
  }

  // Logs keep their exact text and line breaks in a code block.
  const codeBlock = (text) => `<pre><code>${escapeHtml(text.replace(/\s+$/, ''))}</code></pre>`;

  // Blank lines separate paragraphs; single line breaks stay line breaks.
  const paragraphs = (text) => text.split(/\n{2,}/).map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join('');

  function today() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // The note's rich text, as HTML.
  function render(template, answers, tags) {
    if (template.render) return template.render(template, answers, tags);
    const parts = [`<h1>${escapeHtml(template.heading(answers))}</h1>`, `<p>Date: ${today()}</p>`];
    if (tags.length) parts.push(`<p>Tags: ${tags.map((tag) => `#${escapeHtml(tag)}`).join(' ')}</p>`);
    for (const field of template.fields) {
      const value = (answers[field.key] ?? '').trim();
      let body = `<p><em>${NOT_PROVIDED}</em></p>`;
      if (value) body = field.code ? codeBlock(answers[field.key]) : field.list ? numberedList(value) : paragraphs(value);
      parts.push(`<h2>${escapeHtml(field.label)}</h2>`, body);
    }
    return parts.join('');
  }

  function tagChip(tag, onRemove) {
    const chip = el('span', `tag-chip tag-${tagColor(tag)}`, `#${tag}`);
    const remove = el('button', 'tag-chip-remove', '×');
    remove.type = 'button';
    remove.title = `Remove #${tag}`;
    remove.addEventListener('click', onRemove);
    chip.append(remove);
    return chip;
  }

  // The form, as an iOS-style sheet: Cancel and Create in the header, one grouped
  // field per question, and the tags at the end. Resolves to the note's HTML or null.
  function ask(template) {
    return new Promise((resolve) => {
      let tags = [...template.tags];
      let done = false;
      const form = el('form', 'template-form');
      form.noValidate = true;

      const cancel = el('button', 'text-button', 'Cancel');
      cancel.type = 'button';
      const create = el('button', 'text-button strong', 'Create');
      create.type = 'submit';
      const header = el('div', 'template-header');
      header.append(cancel, el('div', 'template-title', template.title), create);

      const body = el('div', 'template-body');
      const inputs = {};
      template.fields.forEach((field, index) => {
        const label = el('label', 'list-header', `${index + 1}. ${field.label}${field.required ? '' : ' (optional)'}`);
        const input = field.lines > 1 ? el('textarea', 'template-input') : el('input', 'template-input');
        input.id = `template-${field.key}`;
        label.htmlFor = input.id;
        input.placeholder = field.placeholder ?? '';
        input.spellcheck = !field.code;
        if (field.lines > 1) input.rows = field.lines;
        if (field.code) input.classList.add('code');
        input.addEventListener('input', update);
        inputs[field.key] = input;
        body.append(label, input);
      });

      const tagLabel = el('label', 'list-header', 'Tags');
      const tagBox = el('div', 'template-tags');
      const tagInput = el('input', 'template-tag-input');
      tagInput.id = 'template-tags';
      tagInput.placeholder = 'Add a tag';
      tagInput.spellcheck = false;
      tagLabel.htmlFor = tagInput.id;
      const drawTags = () => {
        tagBox.replaceChildren(...tags.map((tag) => tagChip(tag, () => {
          tags = tags.filter((item) => item !== tag);
          drawTags();
        })), tagInput);
      };
      const addTags = (text) => {
        for (const part of text.split(/[,\s]+/)) {
          const tag = normalizeTag(part);
          if (tag && !tags.includes(tag)) tags.push(tag);
        }
        tagInput.value = '';
        drawTags();
        tagInput.focus();
      };
      tagInput.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ',' || event.key === ' ') && tagInput.value.trim()) {
          event.preventDefault();
          addTags(tagInput.value);
        } else if (event.key === 'Backspace' && !tagInput.value && tags.length) {
          tags.pop();
          drawTags();
        }
      });
      body.append(tagLabel, tagBox, el('div', 'list-footer', 'The note opens as a new tab. Tags are written into it as #hashtags, so it shows up in the Tags view.'));
      drawTags();

      const answers = () => Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value]));
      const hasContent = () => Object.values(inputs).some((input) => input.value.trim());
      function update() {
        create.disabled = template.fields.some((field) => field.required && !inputs[field.key].value.trim());
      }

      const finish = (result) => {
        done = true;
        sheet.close();
        resolve(result);
      };
      // Like iOS, closing a form with answers in it asks first.
      async function confirmCancel() {
        if (done) return;
        if (!hasContent()) return finish(null);
        const discard = await Dialogs.alert({
          title: 'Discard this note?',
          message: 'Your answers will be lost.',
          buttons: [
            { label: 'Keep Editing', value: false, role: 'cancel' },
            { label: 'Discard', value: true, role: 'destructive' },
          ],
        });
        if (discard) finish(null);
      }

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (create.disabled) return;
        if (tagInput.value.trim()) addTags(tagInput.value);
        finish(render(template, answers(), tags));
      });
      form.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.ctrlKey) {
          event.preventDefault();
          form.requestSubmit();
        }
      });
      cancel.addEventListener('click', confirmCancel);

      form.append(header, body);
      const sheet = Dialogs.sheet(form, { className: 'template-sheet', onDismiss: confirmCancel });
      update();
      inputs[template.fields[0].key].focus();
    });
  }

  // The template menu, then the form, then a new tab with the note.
  async function choose(anchor) {
    const id = await Dialogs.menu({
      anchor,
      title: 'New Note from Template',
      items: [
        { label: 'Blank Rich Text Note', value: 'blank-rich', icon: 'compose' },
        { label: 'Blank Plain Text Note', value: 'blank-plain', icon: 'doc' },
        'separator',
        ...TEMPLATES.map((template) => ({ label: template.title, value: template.id, icon: 'template' })),
      ],
    });
    if (id === 'blank-rich' || id === 'blank-plain') await openNewNote({ rich: id === 'blank-rich' });
    else if (id) await create(id);
  }

  async function create(id) {
    const template = TEMPLATES.find((item) => item.id === id);
    const html = await ask(template);
    if (html) await openNewNote({ html });
  }

  return { TEMPLATES, choose, create, render };
})();
