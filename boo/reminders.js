// Reminders: the ⏰ chips in rich notes (added with the ⏰ button). Each one alerts
// Settings › Reminders before its time (15 minutes by default):
// - Boo walks up with a speech bubble: Open the note, Snooze 10 minutes, or Done
//   (which strikes the reminder through in the note, on every synced device);
// - a Windows or Android notification, handed to the app core, which shows it even
//   while Boo is in the tray (Windows) or not running at all (Android).
// Closing a bubble with × only dismisses it on this device.
const Reminders = (() => {
  const CHECK_MS = 10000;
  const SNOOZE_MS = 10 * 60000;
  // Alerts that are more than this late (Boo was off) still show once, in the page.
  const STALE_MS = 3 * 24 * 3600000;
  const alerted = new Set();
  let pushed = '';

  const keyOf = (buffer, id) => `${buffer.key}/${id}`;
  const when = (at) => new Date(at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // Every reminder in the open notes: { buffer, id, at (ms), done, text }.
  function collect() {
    const found = [];
    for (const buffer of buffers) {
      if (!isRich(buffer) || buffer.guide) continue;
      const editor = buffer.loaded ? RichNotes.editorOf(buffer) : null;
      if (editor && window.BooRich) {
        for (const reminder of BooRich.remindersIn(editor.state.doc)) found.push({ buffer, ...reminder });
        continue;
      }
      const html = buffer.record?.contents;
      if (!html?.includes('data-reminder')) continue;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      for (const span of doc.querySelectorAll('span[data-reminder]')) {
        const block = span.closest('p, li, h1, h2, h3, h4, h5, h6, td, th') ?? span.parentElement;
        const copy = block.cloneNode(true);
        copy.querySelectorAll('span[data-reminder]').forEach((chip) => chip.remove());
        found.push({ buffer, at: span.getAttribute('data-reminder'), id: span.getAttribute('data-id'), done: span.getAttribute('data-done') === 'true', text: copy.textContent.trim() });
      }
    }
    return found
      .map((reminder) => ({ ...reminder, at: new Date(reminder.at).getTime() }))
      .filter((reminder) => reminder.id && !Number.isNaN(reminder.at));
  }

  // When to alert: the lead time before, or the end of a snooze.
  function alertTime(reminder) {
    return settings.reminderSnooze?.[keyOf(reminder.buffer, reminder.id)] ?? reminder.at - (settings.remindLead ?? 15) * 60000;
  }

  const pending = (reminders) => {
    const dismissed = new Set(settings.remindersDismissed ?? []);
    return reminders.filter((reminder) => !reminder.done && !dismissed.has(keyOf(reminder.buffer, reminder.id)));
  };

  const titleOf = (reminder) => reminder.text || title(reminder.buffer);

  // The notifications still to come go to the app core.
  function refresh() {
    const now = Date.now();
    const alerts = pending(collect())
      .filter((reminder) => alertTime(reminder) > now - 60000)
      .map((reminder) => ({ id: keyOf(reminder.buffer, reminder.id), at: alertTime(reminder), title: `⏰ ${titleOf(reminder)}`, body: `${when(reminder.at)} · ${title(reminder.buffer)}` }));
    const signature = JSON.stringify(alerts);
    if (signature === pushed) return;
    pushed = signature;
    window.boo.setReminders(alerts);
  }

  function remember(field, update) {
    settings[field] = update(settings[field]);
    scheduleAutosave();
  }

  // Marks the reminder done in its note, so it stops alerting on every device.
  function markDone(reminder) {
    const { buffer, id } = reminder;
    if (!RichNotes.setReminderDone(buffer, id) && buffer.record?.contents) {
      const doc = new DOMParser().parseFromString(buffer.record.contents, 'text/html');
      doc.querySelector(`span[data-id="${CSS.escape(id)}"]`)?.setAttribute('data-done', 'true');
      buffer.record = { ...buffer.record, contents: doc.body.innerHTML };
      buffer.dirty = true;
    }
    scheduleAutosave();
    refresh();
  }

  function show(reminder) {
    const key = keyOf(reminder.buffer, reminder.id);
    const dismiss = () => remember('remindersDismissed', (list = []) => [...list.filter((item) => item !== key), key].slice(-500));
    Boo.alert({
      title: `⏰ ${titleOf(reminder)}`,
      body: `${when(reminder.at)} · ${title(reminder.buffer)}`,
      actions: [
        {
          label: 'Open',
          onClick: () => {
            const index = buffers.indexOf(reminder.buffer);
            if (index !== -1) select(index);
            dismiss();
          },
        },
        {
          label: 'Snooze',
          onClick: () => {
            remember('reminderSnooze', (snoozes = {}) => ({ ...snoozes, [key]: Date.now() + SNOOZE_MS }));
            alerted.delete(key);
            refresh();
          },
        },
        { label: 'Done', primary: true, onClick: () => markDone(reminder) },
      ],
      onClose: dismiss,
    });
  }

  // Shows Boo's bubble for each reminder that has come due.
  function check() {
    const now = Date.now();
    for (const reminder of pending(collect())) {
      const key = keyOf(reminder.buffer, reminder.id);
      const due = alertTime(reminder);
      if (due > now || now - due > STALE_MS || alerted.has(key)) continue;
      alerted.add(key);
      show(reminder);
    }
    refresh();
  }

  function init() {
    check();
    setInterval(check, CHECK_MS);
    window.boo.onReminderDue(() => check());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check();
    });
  }

  return { init, refresh, check };
})();
