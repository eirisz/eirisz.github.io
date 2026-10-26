// Emoji picker. The editor font list falls back to the system color-emoji font
// (Segoe UI Emoji on Windows), so emoji render in color as they do in Sublime Text.
const EmojiPicker = (() => {
  const { el } = Dialogs;
  const RECENT_KEY = 'boo.recentEmoji';
  const MAX_RECENT = 24;
  const split = (list) => list.split(/\s+/).filter(Boolean);

  const CATEGORIES = [
    {
      name: 'Smileys & People',
      icon: '😀',
      emoji: split(`😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭
        🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕
        😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡
        👻 👽 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾 👋 🤚 🖐️ ✋ 🖖 👌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎
        ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🧠 👀 👅 👄 👶 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 🙋 🙇 🤦 🤷
        🧑‍💻 🧑‍🍳 🧑‍🎨 🧑‍🚀 🦸 🧙 🧚 🧛 🧜 🧝`),
    },
    {
      name: 'Animals & Nature',
      icon: '🐻',
      emoji: split(`🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗
        🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🐢 🐍 🦎 🐙 🦑 🦐 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦒 🐪 🐫 🦘
        🐃 🐄 🐎 🐖 🐏 🐑 🐐 🦌 🐕 🐩 🐈 🐓 🦃 🦚 🦜 🦢 🐇 🦝 🦨 🦡 🦦 🦥 🐁 🐀 🐿️ 🦔 🌵 🌲 🌳 🌴 🌱 🌿
        🍀 🍁 🍂 🍃 🌷 🌹 🌺 🌸 🌼 🌻`),
    },
    {
      name: 'Food & Drink',
      icon: '🍉',
      emoji: split(`🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🧄 🧅
        🥔 🍠 🥐 🥯 🍞 🥖 🧀 🥚 🍳 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙
        🍚 🍘 🍥 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🥛 ☕ 🍵 🧃 🥤 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹`),
    },
    {
      name: 'Activities',
      icon: '⚽',
      emoji: split(`⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥅 🏒 🏑 🏏 ⛳ 🏹 🎣 🥊 🥋 🎽 🛹 ⛸️ 🥌 🎿 🏂 🏋️ 🤸 🏊
        🚴 🧗 🏆 🥇 🥈 🥉 🏅 🎖️ 🎗️ 🎫 🎟️ 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🎲 ♟️ 🎯 🎳 🎮 🕹️ 🧩 🎉
        🎊 🎈 🎁`),
    },
    {
      name: 'Travel & Places',
      icon: '🚗',
      emoji: split(`🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🚚 🚛 🚜 🛵 🏍️ 🚲 🛴 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚃 🚄 🚅 🚂
        🚆 🚇 🚉 ✈️ 🛫 🛬 🚀 🛸 🚁 ⛵ 🚤 🛳️ 🚢 ⚓ 🗺️ 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻
        🏕️ 🏠 🏡 🏢 🏬 🏥 🏦 🏨 🏪 🏫 ⛪ 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙️ 🌃 🌌 🌉 🌁 ☀️ 🌤️ ⛅ 🌧️ ⛈️ 🌩️ ❄️ ☃️
        ⛄ 🌈 ☔ ⚡ 🔥 💧 🌊 🌙 ⭐ 🌟 🌍`),
    },
    {
      name: 'Objects',
      icon: '💡',
      emoji: split(`⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💾 💿 📷 📸 📹 🎥 📞 ☎️ 📺 📻 🎙️ ⏰ ⏳ 📡 🔋 🔌 💡 🔦 🕯️ 🧯 💸
        💵 💰 💳 💎 ⚖️ 🧰 🔧 🔨 🛠️ 🔩 ⚙️ 🧱 🧲 💣 🔪 🛡️ 🔮 🧿 🔭 🔬 💊 💉 🧬 🦠 🧪 🌡️ 🧹 🧺 🧻 🛁 🔑
        🗝️ 🚪 🛋️ 🛏️ 🧸 🖼️ 🛍️ 🛒 ✉️ 📩 📨 📧 📦 📫 📮 📜 📃 📄 📑 📊 📈 📉 🗒️ 📆 📅 🗂️ 📋 📁 📂 📰
        📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🔗 📎 🖇️ 📐 📏 📌 📍 ✂️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔒 🔓`),
    },
    {
      name: 'Symbols',
      icon: '❤️',
      emoji: split(`❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ☯️ ✴️ 🆚 💯 ✅ ☑️ ✔️ ❌
        ❎ ➕ ➖ ➗ ✖️ ♾️ ❓ ❔ ❕ ❗ ‼️ ⁉️ ⚠️ 🚫 ⛔ 📵 🔅 🔆 🔱 ⚜️ 🔰 ♻️ 🌐 💠 🌀 💤 ♿ 🅿️ 🔤 🔣 🔢 🔟
        #️⃣ *️⃣ 0️⃣ 1️⃣ 2️⃣ 3️⃣ ▶️ ⏸️ ⏹️ ⏺️ ⏭️ ⏮️ ⏩ ⏪ 🔀 🔁 🔂 ◀️ 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ 🔄
        🎵 🎶 💲 💱 ©️ ®️ ™️ 🔚 🔙 🔛 🔝 🔜 ✳️ ❇️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🔶 🔷
        🔸 🔹 🔺 🔻 💬 💭 🗯️ ♠️ ♣️ ♥️ ♦️ 🃏 🎴 🚩 🏁 🏳️ 🏴 🏳️‍🌈`),
    },
  ];

  function loadRecent() {
    try {
      const list = JSON.parse(localStorage.getItem(RECENT_KEY));
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function remember(emoji) {
    const list = [emoji, ...loadRecent().filter((item) => item !== emoji)].slice(0, MAX_RECENT);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch {
      // Recents are a convenience; the picker works without them.
    }
  }

  // Stays open so several emoji can be inserted in a row, like the iOS keyboard.
  function open(anchor, onPick) {
    const recent = loadRecent();
    const sections = recent.length ? [{ name: 'Frequently Used', icon: '🕘', emoji: recent }, ...CATEGORIES] : CATEGORIES;

    const content = el('div', 'emoji-picker');
    const tabs = el('div', 'emoji-tabs');
    const grid = el('div', 'emoji-scroll');

    for (const section of sections) {
      const heading = el('div', 'emoji-heading', section.name);
      const cells = el('div', 'emoji-grid');
      for (const emoji of section.emoji) {
        const cell = el('button', 'emoji-cell', emoji);
        cell.title = emoji;
        cell.addEventListener('click', () => {
          remember(emoji);
          onPick(emoji);
        });
        cells.append(cell);
      }
      grid.append(heading, cells);

      const tab = el('button', 'emoji-tab', section.icon);
      tab.title = section.name;
      tab.addEventListener('click', () => grid.scrollTo({ top: heading.offsetTop - grid.offsetTop, behavior: 'smooth' }));
      tabs.append(tab);
    }

    content.append(tabs, grid, el('div', 'emoji-footer', 'Tip: Windows + . opens the full Windows emoji panel'));
    return Dialogs.popover(anchor, content, { className: 'emoji-popover' });
  }

  return { open };
})();
