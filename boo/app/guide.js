// The Boo Guide: a short manual, shown read-only in a tab of its own. Click the
// Boo logo at the top left to open it.
const Guide = (() => {
  const HTML = `
<h1>Welcome to Boo 👻</h1>
<p>Boo is a notes app and text editor. Your notes are kept automatically, it opens any file, and it finds things fast. This guide can't be edited; close its tab whenever you like and click the Boo logo to bring it back.</p>

<h2>Notes</h2>
<ul>
<li><p><strong>New note:</strong> Ctrl+N or the ✎ button. New notes are <em>rich text</em>, like Word. To make plain text notes instead, turn off <strong>New Notes Use Rich Text</strong> in Settings.</p></li>
<li><p><strong>Nothing is lost:</strong> close Boo at any time without saving. Every tab, saved or not, comes back next time, even after a crash.</p></li>
<li><p><strong>Save to a file:</strong> Ctrl+S (Save As: Ctrl+Shift+S). Like Sublime, Boo suggests the first line as the name with no extension: type any name and extension you like. Name a rich note <code>.html</code> to open it in Word or a browser too.</p></li>
<li><p><strong>Templates:</strong> the 📄 button or Ctrl+Shift+N. <em>Root Cause Analysis</em> and <em>Onboarding</em> ask a few questions and build a formatted note for you. <em>Eisenhower Matrix</em> sorts your tasks into four coloured quadrants (Do first, Schedule, Delegate, Drop) with a checklist in each: rename a quadrant by editing its heading, and recolour it with <strong>Cell Color</strong> in the table bar.</p></li>
<li><p><strong>Close Boo</strong> with the red button and it keeps running in the tray (bottom right of the taskbar), so reminders still arrive. Click the tray icon to bring it back; choose <strong>Quit Boo</strong> there or in Settings to end it.</p></li>
</ul>

<h2>Reminders</h2>
<ul>
<li><p>Click the <strong>⏰</strong> button in a note's formatting bar and pick a time. A reminder chip goes into the text, with the rest of the line as what to remember.</p></li>
<li><p>Before it's due (15 minutes by default; change it in <strong>Settings › Reminders</strong>), Boo walks up with a speech bubble: <strong>Open</strong> the note, <strong>Snooze</strong> 10 minutes, or <strong>Done</strong>. You also get a Windows or Android notification, even when Boo is closed.</p></li>
<li><p>Click a reminder chip to change its time, mark it done or remove it. Reminders sync with their notes.</p></li>
</ul>

<h2>Formatting rich notes</h2>
<p>Select text, then use the toolbar above the note:</p>
<ul>
<li><p><strong>Style</strong> (Normal, Heading 1–3, Quote, Code), <strong>font</strong>, <strong>size</strong> and <strong>weight</strong>.</p></li>
<li><p><strong>B</strong> bold, <em>I</em> italic, <u>U</u> underline, <u class="double" style="text-decoration-line: underline; text-decoration-style: double">U</u> double underline, <s>S</s> strikethrough.</p></li>
<li><p><span style="color: #ff3b30">A</span> text color and <mark data-color="#fff3a3" style="background-color: #fff3a3; color: inherit">highlight</mark>.</p></li>
<li><p>Bullet, numbered and check lists; Tab and Shift+Tab move list items in and out.</p></li>
<li><p>Alignment, <strong>tables</strong> (pick a size from the grid; a table bar appears while you're in one), <strong>Ω symbols</strong> (€ % ± → © ✓ …) and clear formatting.</p></li>
<li><p>Tables copied from Excel, Word or a web page paste in as tables.</p></li>
</ul>

<h2>Pictures</h2>
<p>Paste a screenshot (Ctrl+V) into any note and it appears in place. Hover over a picture and click × to remove it; click the picture to open it in its own tab.</p>

<h2>Finding things</h2>
<ul>
<li><p><strong>In this tab:</strong> Ctrl+F. In code and text files there is also Replace (Ctrl+H), Find Next (F3) and more.</p></li>
<li><p><strong>In a folder or everywhere:</strong> Ctrl+Shift+F opens Search in the sidebar. Choose <em>This Tab</em>, <em>Folder</em> or <em>Everywhere</em> (every drive), type, and press Enter.</p></li>
<li><p><strong>Jump to a file:</strong> Ctrl+P and type part of its name. Ctrl+G goes to a line; Ctrl+R to a heading or function.</p></li>
</ul>

<h2>Tags</h2>
<p>Write <code>#</code> before a word in a note, like <code>#invoice</code> or <code>#todo</code>, and it becomes a tag, coloured as you type; Ctrl+click it to see everywhere it is used. You can also tag whole files: right-click a file in the sidebar and choose <strong>Tags…</strong>. The <strong>Tags</strong> view in the sidebar lists every tag; pick one to see everything that has it.</p>

<h2>Files and folders</h2>
<ul>
<li><p><strong>Add Folder</strong> in the sidebar (or drop a folder on the window) to browse it. Click a file to preview it, double-click to keep it open. Right-click for New File, Rename, Delete and more.</p></li>
<li><p><strong>F2</strong> renames the selected file, its extension too. <strong>Drag</strong> a file or folder up or down to put it where you like. Right-click › <strong>Pin to Top</strong> keeps a file in the Pinned list at the top. Each file shows when it was last changed.</p></li>
<li><p>Boo opens any file: text and code with colors for 140 languages, pictures as pictures, other files as read-only hex. Huge files (hundreds of MB) open in seconds.</p></li>
</ul>

<h2>Make it yours</h2>
<p>In <strong>Settings</strong> (the ☰ button at the top right): Light or Dark appearance, the editor theme and text size, line numbers, the sidebar, and whether Boo walks along the bottom of the window.</p>

<h2>Shortcuts</h2>
<table>
<tr><th><p>Keys</p></th><th><p>What they do</p></th></tr>
<tr><td><p>Ctrl+N / Ctrl+Shift+N</p></td><td><p>New note / new note from a template</p></td></tr>
<tr><td><p>Ctrl+O / Ctrl+S / Ctrl+W</p></td><td><p>Open a file / save / close the tab</p></td></tr>
<tr><td><p>Ctrl+Tab</p></td><td><p>Next tab</p></td></tr>
<tr><td><p>Ctrl+F / Ctrl+Shift+F</p></td><td><p>Find in this tab / find in folders</p></td></tr>
<tr><td><p>Ctrl+P / Ctrl+G</p></td><td><p>Go to a file / go to a line</p></td></tr>
<tr><td><p>Ctrl+B / Ctrl+I / Ctrl+U</p></td><td><p>Bold / italic / underline</p></td></tr>
<tr><td><p>Ctrl+Shift+D / Ctrl+Shift+X</p></td><td><p>Double underline / strikethrough</p></td></tr>
<tr><td><p>Ctrl+Shift+7 / 8 / 9</p></td><td><p>Numbered / bullet / check list</p></td></tr>
<tr><td><p>Ctrl+Shift+E</p></td><td><p>Emoji</p></td></tr>
<tr><td><p>F2</p></td><td><p>Rename the selected file in Folders</p></td></tr>
<tr><td><p>Ctrl+K, then Ctrl+B</p></td><td><p>Show or hide the sidebar</p></td></tr>
</table>

<h2>Sync with your phone and tablet</h2>
<p>Turn it on in <strong>Settings › Sync</strong> and sign in with Google. Your notes are then kept in a <strong>Boo Notes</strong> folder in your Google Drive, and Boo on your other computers, tablet and phone shows the same notes.</p>
<ul>
<li>Every note tab syncs: unsaved notes, and saved notes (.html, .txt, .md) once you've opened them. Code and log files don't.</li>
<li>Pictures in your notes come along.</li>
<li>Closing a note's tab closes it on your other devices too. It stays in Google Drive's Trash for 30 days.</li>
<li>If a note was changed on two devices before they synced, the newer change wins and the note stays one note. The older text isn’t lost: open the note in Google Drive and choose <em>Manage versions</em>.</li>
<li>Boo can only see the files it made in your Drive, nothing else.</li>
</ul>
<p><strong>First time only:</strong> Boo needs a free Google Cloud “client” to sign in with.</p>
<ol>
<li>Go to console.cloud.google.com and create a project named Boo.</li>
<li>Under <em>APIs &amp; Services › Library</em>, find <strong>Google Drive API</strong> and click Enable.</li>
<li>Under <em>Google Auth Platform</em>, set it up with the name Boo and your email, Audience <strong>External</strong>. Then under <em>Audience</em>, click <strong>Publish app</strong> (otherwise Google signs Boo out every 7 days).</li>
<li>Under <em>Clients</em>, create a client of type <strong>Desktop app</strong> and copy its Client ID and Client secret. For Boo in a browser, make a second client of type <strong>Web application</strong> instead, with the Boo address's origin (like <code>https://eirisz.github.io</code>) under <em>Authorized JavaScript origins</em> and its <code>oauth.html</code> page (like <code>https://eirisz.github.io/boo/app/oauth.html</code>) under <em>Authorized redirect URIs</em>.</li>
<li>In Boo, choose <em>Settings › Sync › Set Up Google Drive Sync…</em>, paste both, then <em>Sign In with Google</em>. Google may warn that the app isn't verified: it's your own, so choose Continue.</li>
</ol>

<h2>Boo in a browser</h2>
<p>Where Boo.exe isn't allowed (a work PC, say), open Boo's web address in Edge or Chrome. Click the install icon at the right of the address bar to give it its own window, Start menu entry and taskbar button; it then works offline too.</p>
<ul>
<li>Notes, tabs and settings are kept in the browser for that address. Clearing the browser's site data deletes them, so turn on sync.</li>
<li><strong>Add Folder</strong> and <strong>Open</strong> ask the browser for access to your files. After a restart, click <strong>Allow Access to Your Files</strong> once (choose <em>Allow on every visit</em> to stop being asked).</li>
<li>Deleting a file in Folders is permanent: a browser can't use the Recycle Bin. Search <em>Everywhere</em>, the tray and <em>Open in File Explorer</em> aren't available.</li>
<li>Reminders show as browser notifications while Boo is open.</li>
</ul>

<h2>Your data</h2>
<p>Boo keeps everything in the <strong>Data</strong> folder next to Boo.exe. To move Boo to another computer, copy the whole Boo folder. On Android, Boo keeps it in its own storage; sync is how your notes get there.</p>
`;

  return { HTML, TITLE: 'Boo Guide' };
})();
