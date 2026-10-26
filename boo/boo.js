// Boo, the ghost from the PixelPals sprite pack (lib/pixelpals.js): the logo in
// the toolbar, and a 32×32 Boo who strolls slowly along the bottom of the window,
// stopping now and then to look around. Turn him off in Settings.
const Boo = (() => {
  const SIZE = 32;
  const WALK_SPEED = 16; // pixels per second
  const WALK_MS = [6000, 16000];
  const REST_MS = [2500, 6000];
  const REST_MOODS = ['happy', 'quiet', 'investigating', 'insightful'];
  const walker = document.getElementById('boo-walker');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let pal = null;
  let x = 40;
  let direction = 1;
  let on = false;
  let stroll = null;
  let restTimer = null;

  const between = ([low, high]) => low + Math.random() * (high - low);

  // The toolbar logo: a still, happy Boo at the sprite's own size.
  function drawLogo(canvas) {
    const grid = PixelPals.grid('boo', 'happy', 0);
    const width = grid[0].length;
    const height = grid.length;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    grid.forEach((row, y) => row.forEach((color, column) => {
      if (!color) return;
      context.fillStyle = color;
      context.fillRect(column, y, 1, 1);
    }));
  }

  function place(position) {
    x = position;
    walker.style.transform = `translateX(${Math.round(x)}px)`;
  }

  // Each stroll is one linear animation run by the browser's compositor, so walking
  // costs no script per frame; the sprite itself redraws only a few times a second.
  function walk() {
    if (!on) return;
    const maxX = Math.max(0, window.innerWidth - SIZE);
    place(Math.min(x, maxX));
    let distance = (WALK_SPEED * between(WALK_MS)) / 1000;
    const room = direction > 0 ? maxX - x : x;
    const turnsAround = distance >= room;
    if (turnsAround) distance = room;
    const target = x + direction * distance;
    pal.setWalk(true).setMood('happy').setFlip(direction < 0);
    const animation = walker.animate(
      [{ transform: `translateX(${Math.round(x)}px)` }, { transform: `translateX(${Math.round(target)}px)` }],
      { duration: (distance / WALK_SPEED) * 1000, easing: 'linear', fill: 'forwards' },
    );
    stroll = animation;
    animation.onfinish = () => {
      if (stroll !== animation) return;
      place(target);
      animation.cancel();
      stroll = null;
      if (turnsAround) direction = -direction;
      rest();
    };
  }

  function rest() {
    if (!on) return;
    pal.setWalk(false).setMood(REST_MOODS[Math.floor(Math.random() * REST_MOODS.length)]);
    restTimer = setTimeout(walk, between(REST_MS));
  }

  function stop() {
    clearTimeout(restTimer);
    if (stroll) {
      // Keep Boo where he is now rather than where the stroll would have ended.
      place(new DOMMatrix(getComputedStyle(walker).transform).m41);
      stroll.cancel();
      stroll = null;
    }
  }

  function setWalking(enabled) {
    on = enabled;
    walker.hidden = !on;
    if (on && !pal) pal = PixelPals.mount(walker, { character: 'boo', mood: 'happy', scale: 1 });
    if (!pal) return;
    stop();
    if (on) {
      pal.play();
      walk();
    } else {
      pal.pause();
    }
  }

  // Nothing to watch while the window is minimized or hidden.
  document.addEventListener('visibilitychange', () => {
    if (!on || !pal) return;
    if (document.hidden) {
      pal.pause();
      stroll?.pause();
    } else {
      pal.play();
      stroll?.play();
    }
  });

  function init({ walking }) {
    for (const canvas of document.querySelectorAll('.boo-logo')) drawLogo(canvas);
    setWalking(walking);
  }

  // ---------- Alerts ----------

  // Boo stops, bounces and says something in a speech bubble (a reminder that's due).
  // `actions` are buttons: [{ label, primary, onClick }]; the × just closes it. Alerts
  // that arrive while one is showing wait their turn. Shows Boo even if he isn't walking.
  const queue = [];
  let bubble = null;

  function alert(message) {
    queue.push(message);
    if (!bubble) showNext();
  }

  function showNext() {
    const message = queue.shift();
    if (!message) return;
    const wasWalking = on;
    if (!pal) pal = PixelPals.mount(walker, { character: 'boo', mood: 'happy', scale: 1 });
    stop();
    walker.hidden = false;
    pal.play();
    pal.setWalk(false).setMood('insightful');
    walker.classList.add('alerting');

    bubble = document.createElement('div');
    bubble.className = 'boo-bubble';
    bubble.setAttribute('role', 'alert');
    const close = document.createElement('button');
    close.className = 'boo-bubble-close';
    close.textContent = '×';
    close.title = 'Close';
    const heading = document.createElement('div');
    heading.className = 'boo-bubble-title';
    heading.textContent = message.title;
    const body = document.createElement('div');
    body.className = 'boo-bubble-body';
    body.textContent = message.body ?? '';
    const buttons = document.createElement('div');
    buttons.className = 'boo-bubble-actions';
    const finish = (action) => {
      bubble.remove();
      bubble = null;
      walker.classList.remove('alerting');
      action?.();
      if (queue.length) return showNext();
      if (wasWalking && on) walk();
      else {
        walker.hidden = !on;
        if (!on) pal.pause();
      }
    };
    for (const action of message.actions ?? []) {
      const button = document.createElement('button');
      button.className = action.primary ? 'filled-button' : 'boo-bubble-button';
      button.textContent = action.label;
      button.addEventListener('click', () => finish(action.onClick));
      buttons.append(button);
    }
    close.addEventListener('click', () => finish(message.onClose));
    bubble.append(close, heading, body, buttons);
    document.body.append(bubble);
    // Above Boo, kept inside the window.
    const width = bubble.offsetWidth;
    bubble.style.left = `${Math.max(8, Math.min(x + SIZE / 2 - width / 2, window.innerWidth - width - 8))}px`;
    bubble.style.setProperty('--tail', `${Math.round(x + SIZE / 2 - bubble.offsetLeft)}px`);
  }

  return { init, setWalking, alert, defaultWalking: !reducedMotion };
})();
