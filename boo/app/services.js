// Routes streamed events from the main process to whoever asked for them.

// Streaming file loads. Text arrives in pieces and is split into lines as it
// comes, so a file never has to exist as one huge string in the page.
const Loader = (() => {
  const loads = new Map();
  let counter = 0;

  window.boo.onLoadChunk((id, text) => loads.get(id)?.chunk(text));
  window.boo.onLoadReset((id) => loads.get(id)?.reset());
  window.boo.onLoadProgress((id, loaded, total) => loads.get(id)?.progress(loaded, total));
  window.boo.onLoadDone((id, outcome) => loads.get(id)?.done(outcome));

  // Resolves to { meta, lines } or { error } or { cancelled: true }.
  // onStart receives the id that cancel() takes.
  function load(file, { onProgress = () => {}, onStart = () => {} } = {}) {
    const id = `load-${++counter}`;
    const lines = [];
    let carry = '';
    return new Promise((resolve) => {
      loads.set(id, {
        chunk(text) {
          const parts = (carry + text).split('\n');
          carry = parts.pop();
          for (const part of parts) lines.push(part);
        },
        reset() {
          lines.length = 0;
          carry = '';
        },
        progress: onProgress,
        done({ result, error }) {
          loads.delete(id);
          if (error) resolve({ error });
          else if (result.cancelled) resolve({ cancelled: true });
          else {
            lines.push(carry);
            resolve({ meta: result, lines });
          }
        },
      });
      onStart(id);
      window.boo.loadFile(id, file);
    });
  }

  return { load, cancel: (id) => window.boo.cancelLoad(id) };
})();

// Background jobs in a worker thread: Find in Files, the Goto Anything file
// index and the hashtag scan.
const Jobs = (() => {
  const handlers = new Map();
  let counter = 0;
  const FINAL = new Set(['done', 'error', 'stopped']);

  window.boo.onJobEvent((id, message) => {
    const handler = handlers.get(id);
    if (!handler) return;
    if (FINAL.has(message.type)) handlers.delete(id);
    handler(message);
  });

  function start(job, data, onEvent) {
    const id = `job-${++counter}`;
    handlers.set(id, onEvent);
    window.boo.startJob(id, job, data);
    return id;
  }

  return { start, stop: (id) => window.boo.stopJob(id) };
})();

// Saves a document by sending it in pieces; the main process writes them to a
// temp file and renames it into place when all have arrived.
async function writeDocument(doc, target, encoding, lineEnding) {
  const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const begun = await window.boo.beginDocument(id, target, encoding, lineEnding);
  if (begun.error) throw new Error(begun.error);
  for (const chunk of BooEditor.documentChunks(doc)) window.boo.sendDocumentChunk(id, chunk);
  const { result, error } = await window.boo.commitDocument(id);
  if (error) throw new Error(error);
  return result;
}

// Sublime-style fuzzy matching for Goto Anything: the query's characters must
// appear in order; matches in the file name, at word starts and in runs score higher.
function fuzzyMatch(query, target) {
  if (!query) return { score: 0, positions: [] };
  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();
  const nameStart = Math.max(target.lastIndexOf('\\'), target.lastIndexOf('/')) + 1;
  const positions = [];
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of lowerQuery) {
    if (char === ' ') continue;
    // Prefer a match in the file name over one earlier in the path.
    let index = lowerTarget.indexOf(char, Math.max(from, positions.length ? from : nameStart));
    if (index === -1) index = lowerTarget.indexOf(char, from);
    if (index === -1) return null;
    const boundary = index === 0 || /[\\/_\-. ]/.test(target[index - 1]) || (target[index] !== lowerTarget[index] && target[index - 1] === lowerTarget[index - 1]);
    score += 1 + (index === previous + 1 ? 5 : 0) + (boundary ? 3 : 0) + (index >= nameStart ? 2 : 0);
    positions.push(index);
    previous = index;
    from = index + 1;
  }
  return { score: score - target.length * 0.01, positions };
}

// Wraps the characters at `positions` (or within `ranges`) in <mark>.
function highlightText(text, { positions, ranges }) {
  const marks = new Array(text.length).fill(false);
  for (const position of positions ?? []) marks[position] = true;
  for (const [start, end] of ranges ?? []) for (let index = start; index < end; index++) marks[index] = true;
  const fragment = document.createDocumentFragment();
  let index = 0;
  while (index < text.length) {
    const marked = marks[index];
    let end = index;
    while (end < text.length && marks[end] === marked) end++;
    const piece = text.slice(index, end);
    fragment.append(marked ? Object.assign(document.createElement('mark'), { textContent: piece }) : piece);
    index = end;
  }
  return fragment;
}
