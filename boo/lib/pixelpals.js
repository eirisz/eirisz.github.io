/*! PixelPals v2.0 — 30 animated pixel characters × 20 moods × 7 life stages × 6 activities.
 *  Zero dependencies. Renders to <canvas>. Use freely on your site.
 *
 *  <script src="pixelpals.js"></script>
 *  <div data-pixelpal="bean" data-mood="insightful" data-stage="corporate" data-activity="work" data-scale="5"></div>
 *
 *  const pal = PixelPals.mount(el, { character: 'mochi', mood: 'happy', stage: 'baby', activity: 'eat', scale: 4 });
 *  pal.setMood('angry'); pal.setStage('elder'); pal.setActivity('learn'); pal.setCharacter('lemon');
 *  PixelPals.toDataURL('halo', 'asleep', 0, 8, { stage: 'teen' });   // one PNG frame
 *  PixelPals.spriteSheet('halo', 'asleep', 8, { stage: 'teen' });    // canvas, 12 frames side by side
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PixelPals = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var W = 32, H = 24;      // logical grid (wider than tall: room for held food and props)
  var BX = 9, BY = 6;      // full-size body origin (14 px wide body)
  var FRAMES = 12, FRAME_MS = 140;

  var MOODS = ['happy', 'quiet', 'asleep', 'investigating', 'alert', 'stressed',
    'pokerface', 'memeface', 'wtf', 'angry', 'sad', 'doubtful', 'lost', 'flabbergasted',
    'amazed', 'ecstatic', 'insightful', 'secretive', 'extrovert', 'introvert', 'tantrum'];
  var STAGES = ['baby', 'toddler', 'teen', 'adult', 'corporate', 'settled', 'elder'];
  var ACTIVITIES = ['none', 'eat', 'learn', 'work', 'play', 'argue'];

  var STAGE_SCALE = { baby: 0.7, toddler: 0.85, teen: 1, adult: 1, corporate: 1, settled: 1, elder: 1 };
  var ANCHORS = {
    14: { eyeL: 3, eyeR: 8, eyeY: 4, mouthX: 4, mouthY: 8 },
    12: { eyeL: 2, eyeR: 7, eyeY: 3, mouthX: 3, mouthY: 7 },
    10: { eyeL: 2, eyeR: 6, eyeY: 3, mouthX: 2, mouthY: 6 }
  };

  // ---- body silhouettes (14 wide) -------------------------------------------
  var R12 = ['....######....', '..##########..', '.############.', '##############', '##############', '##############', '##############', '##############', '##############', '.############.', '..##########..', '....######....'];
  var SHAPES = {
    round: R12,
    square: ['.############.', '##############', '##############', '##############', '##############', '##############', '##############', '##############', '##############', '##############', '##############', '.############.'],
    blob: ['.....#####....', '...#########..', '..###########.', '.#############', '##############', '##############', '##############', '##############', '.############.', '.##.####.####.', '.#..###...##..', '....##....#...'],
    cloud: ['...##....##...', '..####..####..', '.############.', '##############', '##############', '##############', '##############', '##############', '##############', '.############.', '..####..####..', '...##....##...'],
    tall: ['....######....', '..##########..', '.############.', '##############', '##############', '##############', '##############', '##############', '##############', '##############', '##############', '##############', '##############', '#.##.####.##.#'],
    lemon: ['.......##.....', '....#######...', '..##########..', '.############.', '##############', '##############', '##############', '##############', '.############.', '..##########..', '...#######....', '.....##.......'],
    potato: ['...#####......', '.#########....', '############..', '##############', '##############', '##############', '##############', '.#############', '.#############', '..###########.', '...#########..', '.....######...'],
    toast: ['...###..###...', '.############.', '##############', '##############', '##############', '.############.', '.############.', '.############.', '.############.', '.############.', '.############.', '.############.'],
    drop: ['......##......', '.....####.....', '....######....', '...########...', '..##########..', '.############.', '##############', '##############', '##############', '.############.', '..##########..', '....######....'],
    rock: ['....#######...', '..##########..', '.############.', '##############', '##############', '##############', '##############', '##############', '##############', '##############', '.############.', '..###########.'],
    star: ['......##......', '.....####.....', '.....####.....', '############..', '.############.', '..##########..', '...########...', '...########...', '..##########..', '.####....####.', '.###......###.', '##..........##'],
    cactus: ['.....####.....', '....######....', '##..######..##', '##..######..##', '###.######.###', '.##########...', '..#########...', '....######....', '....######....', '....######....', '....######....', '....######....'],
    mug: ['############..', '############..', '############.#', '############.#', '############.#', '############.#', '############.#', '############.#', '############..', '############..', '.##########...', '..########....'],
    critter: ['....######....', '..##########..', '.############.', '##############', '##############', '##############', '##############', '##############', '.############.', '..##########..', '...########...', '..##########..', '..##########..', '...########...', '...##....##...', '...##....##...'],
    whale: ['..............', '....######....', '.###########..', '##############', '##############', '##############', '##############', '##############', '.############.', '..#########...', '....#....###..', '...##.....####'],
    heart: ['.####....####.', '######..######', '##############', '##############', '##############', '##############', '.############.', '..##########..', '...########...', '....######....', '.....####.....', '......##......']
  };

  var GLOBAL = { K: '#1b1a2e', W: '#ffffff', P: '#f48fb1', Y: '#ffe066', R: '#ff4d4d', L: '#7cc7ff', G: '#4fc35a', O: '#8b5a2b' };

  // ---- faces ---------------------------------------------------------------------
  var EYES = {
    dot: ['.E.', '.E.', '...'], happy: ['.E.', 'E.E', '...'], blink: ['...', 'EEE', '...'],
    closed: ['...', 'E.E', '.E.'], wide: ['EEE', 'EWE', 'EEE'], squint: ['...', 'EEE', '...'],
    worryL: ['..K', '.E.', '...'], worryR: ['K..', '.E.', '...'],
    angryL: ['K..', '.K.', '.E.'], angryR: ['..K', '.K.', '.E.'],
    sadL: ['..K', '.E.', '.E.'], sadR: ['K..', '.E.', '.E.'],
    sideL: ['E..', 'E..', '...'], sideR: ['..E', '..E', '...'], down: ['...', '.E.', '.E.'],
    star: ['.Y.', 'YYY', '.Y.'], half: ['EEE', '.E.', '...'], browDot: ['KKK', '.E.', '.E.'],
    lash: ['E.E', 'EEE', '...'], shut: ['...', 'EEE', '...'], wailL: ['K..', 'EEE', '...'], wailR: ['..K', 'EEE', '...']
  };
  var MOUTHS = {
    smile: ['M...M', '.MMM.'], flat: ['.MMM.'], small: ['..M..'], tiny: ['.MM..'],
    grin: ['M...M', 'MWWWM', '.MMM.'], frown: ['.MMM.', 'M...M'], open: ['.MMM.', '.MMM.'],
    gape: ['.MMM.', '.MWM.', '.MMM.'], smirk: ['....M', '.MMM.'], slant: ['.MM..', '...M.'],
    wavy0: ['M.M.M', '.M.M.'], wavy1: ['.M.M.', 'M.M.M'], o: ['..MM.', '..MM.'],
    shout: ['.MMM.', 'MMMMM', '.MMM.'], wail: ['.MMM.', 'MMMMM', 'MMMMM'], chew0: ['.MMM.'], chew1: ['.M.M.', '.MMM.'], pout: ['..MM.']
  };

  // ---- accessory painters ----------------------------------------------------------
  function mirror(rows) { return rows.map(function (r) { return r.split('').reverse().join(''); }); }
  var WING = ['...W', '..WW', '.WWW', 'WWWW', '.WWW', '..WW'];
  var BATWING = ['C...', 'CC..', 'CCC.', '.CCC', '.CC.', 'C...'];
  function lines(ch, n, w) { var s = ''; for (var i = 0; i < w; i++) s += ch; var out = []; for (var j = 0; j < n; j++) out.push(s); return out; }

  // layers: back (behind body), mid (on body, under face), face (after face), front (over everything but mood overlays)
  var ACC = {
    blush: { layer: 'face', draw: function (g, f, a) { g.put(a.eyeL - 2, a.eyeY + 3, ['PP']); g.put(a.eyeR + 3, a.eyeY + 3, ['PP']); } },
    ears: { layer: 'back', draw: function (g) { g.put(1, -1, ['B..', 'BP.', 'BPB']); g.put(10, -1, ['..B', '.PB', 'BPB']); } },
    rays: { layer: 'back', draw: function (g, f) {
      g.put(6, -3, ['AA', 'AA']); g.put(6, 12, ['AA', 'AA']); g.put(-3, 5, ['AA', 'AA']); g.put(15, 5, ['AA', 'AA']);
      if (f % 6 < 3) { g.put(0, -2, ['A.', '.A']); g.put(12, -2, ['.A', 'A.']); g.put(0, 12, ['.A', 'A.']); g.put(12, 12, ['A.', '.A']); }
    } },
    partyhat: { layer: 'front', draw: function (g) { g.put(4, -4, ['..Y..', '.AAA.', '.AWA.', 'AAAAA']); } },
    bowtie: { layer: 'front', draw: function (g) { g.put(5, 10, ['A.A', 'AAA', 'A.A']); } },
    bangs: { layer: 'front', draw: function (g) { g.put(0, 0, ['...KKKKKKKK...', '..KKKKKKKKKK..', '.KKKKKKKKKKKK.', '.KKK..........', '.KK...........', '..K...........']); } },
    batwings: { layer: 'back', draw: function (g, f) { var dy = f % 6 < 3 ? 3 : 2; g.put(-4, dy, BATWING); g.put(14, dy, mirror(BATWING)); } },
    wings: { layer: 'back', draw: function (g, f) { var dy = f % 6 < 3 ? 3 : 2; g.put(-4, dy, WING); g.put(14, dy, mirror(WING)); } },
    halo: { layer: 'front', draw: function (g, f) { g.put(2, f % 8 < 4 ? -3 : -4, ['..AAAAAA..', '.A......A.', '..AAAAAA..']); } },
    headband: { layer: 'front', draw: function (g) { g.put(0, 2, ['AAAAAAAAAAAAAAAA', '..............A.', '...............A']); } },
    brows: { layer: 'front', draw: function (g) { g.put(3, 3, ['KKK']); g.put(8, 3, ['KKK']); } },
    hood: { layer: 'mid', draw: function (g) { g.put(0, 0, ['..CCCCCCCCCC..', '.CCCCCCCCCCCC.'].concat(lines('C', 0, 0), ['CC..........CC', 'CC..........CC', 'CC..........CC', 'CC..........CC', 'CC..........CC', 'CC..........CC', 'CC..........CC', 'CC..........CC'])); } },
    glasses: { layer: 'front', draw: function (g) { g.put(2, 3, ['.KKK..KKK.', 'K...KK...K', 'K...KK...K', 'K...KK...K', '.KKK..KKK.']); } },
    antenna: { layer: 'front', draw: function (g, f) { g.put(7, -3, [f % 6 < 3 ? 'Y' : 'A', 'K', 'K']); } },
    leaf: { layer: 'front', draw: function (g, f) { g.put(f % 8 < 4 ? 7 : 8, -3, ['.GG', 'GG.', '.K.']); } },
    cap: { layer: 'front', draw: function (g) { g.put(1, -1, ['..AAAAAAAA......', '.AAAAAAAAAA.....', 'AAAAAAAAAAAAAAAA']); g.put(5, -1, ['.G.', 'GGG', '.G.']); } },
    scarf: { layer: 'front', draw: function (g) { g.put(0, 10, ['.AAAAAAAAAAAA.', '..AAA.........', '..AA..........']); } },
    flame: { layer: 'front', draw: function (g, f) { g.put(4, -4, f % 4 < 2 ? ['...A..', '.A.AA.', '.AAYA.', 'AAYYAA'] : ['..A...', '.AA.A.', '.AYAA.', 'AAYYAA']); } },
    screen: { layer: 'mid', draw: function (g) { g.put(2, 3, lines('C', 8, 10)); } },
    bolts: { layer: 'front', draw: function (g) { g.put(0, 6, ['K']); g.put(13, 6, ['K']); g.put(0, 9, ['K']); g.put(13, 9, ['K']); } },
    bubbles: { layer: 'back', draw: function (g, f) { var k = f % 6; g.put(-3, 4 - (k >> 1), ['.C.', 'C.C', '.C.']); g.put(15, 7 - (k % 3), ['C']); if (k < 3) g.put(-1, 10, ['C']); } },
    // ---- new cast ----
    bow: { layer: 'front', draw: function (g) { g.put(8, -3, ['AA..AA', 'AAAAAA', '.AYYA.', 'AAAAAA', 'AA..AA']); } },
    lashes: { layer: 'face', draw: function (g, f, a) { g.put(a.eyeL - 1, a.eyeY, ['K']); g.put(a.eyeR + 3, a.eyeY, ['K']); } },
    tophat: { layer: 'front', draw: function (g) { g.put(2, -6, ['..CCCCCC..', '..CCCCCC..', '..CCCCCC..', '..CAAAAC..', '..CCCCCC..', 'CCCCCCCCCC']); } },
    stache: { layer: 'face', draw: function (g, f, a) { g.put(a.mouthX - 1, a.mouthY - 1, ['KK..KK', 'KKKKKK']); } },
    monocle: { layer: 'front', draw: function (g) { g.put(7, 3, ['.KKK.', 'K...K', 'K...K', 'K...K', '.KKK.', '....K']); } },
    mughandle: { layer: 'mid', draw: function (g) { g.put(12, 1, ['.CC', 'C.C', 'C.C', 'C.C', 'C.C', 'C.C', '.CC']); } },
    coffee: { layer: 'front', draw: function (g, f) { g.put(0, 0, ['OOOOOOOOOOOO']); g.put(3, -3 - (f % 4 > 1 ? 1 : 0), ['H.H', '.H.', 'H.H']); } },
    eyebags: { layer: 'face', draw: function (g, f, a) { g.put(a.eyeL, a.eyeY + 3, ['SSS']); g.put(a.eyeR, a.eyeY + 3, ['SSS']); } },
    zest: { layer: 'back', draw: function (g, f) { g.put(5, -3, ['..G', '.GG', 'GG.']); if (f % 6 < 3) g.put(15, 2, ['Y']); } },
    sprouts: { layer: 'back', draw: function (g) { g.put(1, -2, ['.G', 'G.']); g.put(9, -3, ['G.', '.G']); g.put(11, 2, ['..G', '.G.']); } },
    crust: { layer: 'mid', draw: function (g) { g.put(0, 0, ['...CCC..CCC...', '.CCCCCCCCCCCC.', 'CC..........CC', 'C............C', 'C............C', '.C..........C.', '.C..........C.', '.C..........C.', '.C..........C.', '.C..........C.', '.C..........C.', '.CCCCCCCCCCCC.']); g.put(5, 8, ['YYYY', 'YYYY']); } },
    beads: { layer: 'front', draw: function (g) { g.put(2, 10, ['C.C.C.C.C.']); g.put(6, -1, ['A']); } },
    spines: { layer: 'back', draw: function (g) { g.put(3, -2, ['K.....K', '.K...K.']); g.put(-2, 3, ['K.', '.K']); g.put(14, 3, ['.K', 'K.']); g.put(1, 8, ['K']); g.put(12, 8, ['K']); } },
    flower: { layer: 'front', draw: function (g) { g.put(5, -3, ['.P.', 'PYP', '.P.']); } },
    cracks: { layer: 'mid', draw: function (g) { g.put(1, 3, ['S', '.S', '.S']); g.put(10, 7, ['S.', '.S', '.S']); g.put(3, 9, ['SS']); } },
    ripple: { layer: 'back', draw: function (g, f) { var k = f % 6; g.put(-3 - (k >> 1), 9, ['C']); g.put(16 + (k >> 1), 9, ['C']); if (k > 2) { g.put(-2, 11, ['C']); g.put(15, 11, ['C']); } } },
    shine: { layer: 'front', draw: function (g, f) { if (f % 6 < 3) g.put(-3, 1, ['.Y.', 'YYY', '.Y.']); else g.put(14, 2, ['.Y.', 'YYY', '.Y.']); } },
    mask: { layer: 'mid', draw: function (g) { g.put(0, 0, ['...KKKKKKKK...', '..KKKKKKKKKK..', '.KKKKKKKKKKKK.', 'KKKKKKKKKKKKKK', '..............', '..............', '..............', 'KKKKKKKKKKKKKK', 'KKKKKKKKKKKKKK', '.KKKKKKKKKKKK.', '..KKKKKKKKKK..', '....KKKKKK....']); g.put(13, 2, ['.AA', 'AA.', '.A.']); } },
    pirate: { layer: 'front', draw: function (g, f, a) { g.put(0, -3, ['...KKKKKKKK...', '.KKKKKKKKKKKK.', 'KKKKKWKKKKKKKK', 'KKKKKKKKKKKKKK']); g.put(a.eyeR - 1, a.eyeY - 1, ['KKKKK', 'KKKKK', 'KKKKK', 'KKKKK']); g.put(a.eyeL + 2, a.eyeY - 1, ['KKK']); g.put(a.eyeR + 4, a.eyeY, ['K']); } },
    shades: { layer: 'front', draw: function (g) { g.put(1, 3, ['KKKKKKKKKKKK', 'KKKKK..KKKKK', '.KKK....KKK.']); } },
    lips: { layer: 'face', draw: function (g, f, a) { g.put(a.mouthX, a.mouthY, ['R']); g.put(a.mouthX + 4, a.mouthY, ['R']); } },
    boo: { layer: 'back', draw: function (g, f) { g.put(f % 8 < 4 ? -3 : -2, 6, ['H', 'H']); g.put(f % 8 < 4 ? 15 : 16, 6, ['H', 'H']); } },
    crown: { layer: 'front', draw: function (g) { g.put(3, -3, ['A..A..A.', 'AA.AA.AA', 'AAAAAAAA']); g.put(4, -2, ['R', '.', '.', '.']); } },
    // ---- critter cast ----
    belly: { layer: 'mid', draw: function (g, f, a) { g.put(4, a.mouthY + 2, ['.WWWW.', 'WWWWWW', 'WWWWWW', '.WWWW.']); } },
    bellyC: { layer: 'mid', draw: function (g, f, a) { g.put(4, a.mouthY + 2, ['.CCCC.', 'CCCCCC', 'CCCCCC', '.CCCC.']); } },
    beak: { layer: 'face', draw: function (g, f, a) { g.put(a.mouthX + 1, a.mouthY, ['AAA', '.A.']); } },
    smallBeak: { layer: 'face', draw: function (g, f, a) { g.put(a.mouthX + 2, a.mouthY, ['A']); } },
    pandaEyes: { layer: 'mid', draw: function (g, f, a) { g.put(a.eyeL - 1, a.eyeY - 1, ['.CCC.', 'CCCCC', 'CCCCC', '.CCC.']); g.put(a.eyeR - 1, a.eyeY - 1, ['.CCC.', 'CCCCC', 'CCCCC', '.CCC.']); } },
    roundEars: { layer: 'back', draw: function (g) { g.put(0, -1, ['CCC', 'CCC', 'CC.']); g.put(11, -1, ['CCC', 'CCC', '.CC']); } },
    catEars: { layer: 'back', draw: function (g) { g.put(1, -3, ['C..', 'CC.', 'CPC']); g.put(10, -3, ['..C', '.CC', 'CPC']); } },
    foxEars: { layer: 'back', draw: function (g) { g.put(0, -4, ['C...', 'CC..', 'CWC.', 'CWWC']); g.put(10, -4, ['...C', '..CC', '.CWC', 'CWWC']); } },
    bunEars: { layer: 'back', draw: function (g, f) { var t = f % 8 < 4 ? 0 : -1; g.put(3, -7, ['CC', 'CP', 'CP', 'CP', 'CP', 'CC', 'CC']); g.put(9, -7 + t, ['CC', 'CP', 'CP', 'CP', 'CP', 'CC', 'CC']); } },
    pupEars: { layer: 'back', draw: function (g) { g.put(-1, 0, ['CC', 'CC', 'CC', 'CC', '.C']); g.put(13, 0, ['CC', 'CC', 'CC', 'CC', 'C.']); } },
    bearHood: { layer: 'mid', draw: function (g) { g.put(0, -2, ['.CC........CC.', 'CCCC......CCCC', 'CCCCCCCCCCCCCC', 'CCCCCCCCCCCCCC', 'CC..........CC', 'C............C', 'C............C', 'C............C', 'C............C', 'C............C', '.C..........C.']); } },
    frogBumps: { layer: 'back', draw: function (g) { g.put(1, -2, ['.BB.', 'BBBB']); g.put(9, -2, ['.BB.', 'BBBB']); } },
    helmet: { layer: 'mid', draw: function (g, f, a) { g.put(0, -2, ['......RR......', '....CCRRCC....', '..CCCCCCCCCC..', '.CCCCCCCCCCCC.', 'CCCCCCCCCCCCCC', 'CCCCCCCCCCCCCC', 'CC..........CC', 'CC..........CC', 'CC..........CC', 'CCCCCCCCCCCCCC', 'CC..........CC', '.C..........C.']); g.put(0, a.eyeY - 1, ['CC..........CC']); } },
    sword: { layer: 'back', draw: function (g) { g.put(13, 1, ['....W', '...WW', '..WW.', '.WW..', 'KK...', '.K...']); } },
    shield: { layer: 'front', draw: function (g) { g.put(-3, 7, ['.CC.', 'CAAC', 'CAAC', '.CC.']); } },
    horns: { layer: 'back', draw: function (g) { g.put(1, -3, ['C.', 'CC', '.C']); g.put(11, -3, ['.C', 'CC', 'C.']); } },
    trident: { layer: 'back', draw: function (g) { g.put(14, 0, ['A.A.A', '.AAA.', '..A..', '..A..', '..A..', '..A..', '..A..']); } },
    devilTail: { layer: 'back', draw: function (g, f) { g.put(13, 10, f % 6 < 3 ? ['.C', 'CC', 'C.', 'CC'] : ['C.', 'C.', 'CC', '.C']); } },
    vikingHelm: { layer: 'mid', draw: function (g) { g.put(-2, -3, ['CC............CC', 'CC............CC', '.CC..........CC.', '..AAAAAAAAAAAA..', '.AAAAAAAAAAAAAA.', '.AAAAAAAAAAAAAA.', '.AAAAAAAAAAAAAA.']); } },
    axe: { layer: 'back', draw: function (g) { g.put(13, 2, ['.CCC', 'CCCC', 'CCCC', '.CK.', '..K.', '..K.', '..K.']); } },
    toque: { layer: 'front', draw: function (g, f, a) { g.put(2, a.offY - 6, ['.WWWWWWWW.', 'WWWWWWWWWW', 'WWWWWWWWWW', 'WWWWWWWWWW', '.WWWWWWWW.', '.KKKKKKKK.']); } },
    apron: { layer: 'mid', draw: function (g, f, a) { g.put(3, a.mouthY + 2, ['WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW', '.WWWWWW.']); g.put(5, a.mouthY + 3, ['KKKK']); } },
    spoon: { layer: 'back', draw: function (g) { g.put(13, 5, ['.AA', 'AAA', '.A.', '.A.', '.A.', '.A.']); } },
    owlTufts: { layer: 'back', draw: function (g) { g.put(1, -2, ['C.', 'CC']); g.put(11, -2, ['.C', 'CC']); } },
    owlMask: { layer: 'mid', draw: function (g, f, a) { g.put(a.eyeL - 2, a.eyeY - 2, ['.CCC..CCC.', 'CCCCCCCCCC', 'CCCCCCCCCC', 'CCCCCCCCCC', 'CCCCCCCCCC', '.CCC..CCC.']); } },
    wingsS: { layer: 'back', draw: function (g, f) { var dy = f % 6 < 3 ? 8 : 7; g.put(-2, dy, ['.S', 'SS', 'SS', '.S']); g.put(14, dy, ['S.', 'SS', 'SS', 'S.']); } },
    cowSpots: { layer: 'mid', draw: function (g) { g.put(1, 2, ['CC.', 'CCC', '.CC']); g.put(9, 6, ['CCC', '.CC']); g.put(5, 11, ['CC', 'CC']); } },
    cowHorns: { layer: 'back', draw: function (g) { g.put(0, -2, ['A.', 'AA']); g.put(12, -2, ['.A', 'AA']); } },
    snout: { layer: 'face', draw: function (g, f, a) { g.put(a.mouthX, a.mouthY - 1, ['PPPPP', 'PKPKP']); } },
    tentacles: { layer: 'front', draw: function (g, f) { var t = f % 4 < 2; g.put(1, 10, t ? ['B.BB.BB.BB.B', 'B.B..B..B..B', 'B....B.....B'] : ['.BB.BB.BB.BB', 'B..B..B..B..', 'B....B.....B']); } },
    spout: { layer: 'back', draw: function (g, f) { if (f % 8 < 5) g.put(6, -4, ['L.L', '.L.', '.L.']); } },
    fin: { layer: 'front', draw: function (g) { g.put(4, 11, ['.BB', 'BBB']); } },
    collar: { layer: 'front', draw: function (g, f, a) { g.put(2, a.mouthY + 2, ['AAAAAAAAAA']); g.put(6, a.mouthY + 3, ['YY']); } },
    tongue: { layer: 'face', draw: function (g, f, a) { if (f % 8 < 5) g.put(a.mouthX + 2, a.mouthY + 1, ['P', 'P']); } },
    nose: { layer: 'face', draw: function (g, f, a) { g.put(a.mouthX + 1, a.mouthY - 1, ['KKK', '.K.']); } },
    whiskers: { layer: 'face', draw: function (g, f, a) { g.put(a.eyeL - 3, a.eyeY + 3, ['KK', '..', 'KK']); g.put(a.eyeR + 4, a.eyeY + 3, ['KK', '..', 'KK']); } },
    stripes: { layer: 'mid', draw: function (g) { g.put(2, 0, ['.C........C.', 'C..........C']); g.put(1, 3, ['C', 'C']); g.put(12, 3, ['C', 'C']); } }
  };

  // ---- the cast ----------------------------------------------------------------------
  //  B body  S shade  H highlight  E eyes/mouth  A accent  C accent 2
  var CHARACTERS = [
    { id: 'mochi',   name: 'Mochi',   vibe: 'cute',           shape: 'round',  acc: ['ears', 'blush'],                 B: '#ffb3c6', S: '#e58aa3', H: '#ffd6e0', E: '#3b2a35', A: '#ff6f91', C: '#ffffff' },
    { id: 'puff',    name: 'Puff',    vibe: 'fluffy',         shape: 'cloud',  acc: ['blush'],                         B: '#f6f1ec', S: '#d9cfc7', H: '#ffffff', E: '#4a3f3a', A: '#c9b8ad', C: '#ffffff' },
    { id: 'sunny',   name: 'Sunny',   vibe: 'sunny',          shape: 'round',  acc: ['rays', 'blush'],                 B: '#ffd23f', S: '#e6a92a', H: '#fff3b0', E: '#4a3a12', A: '#ff9f1c', C: '#ffffff' },
    { id: 'jolly',   name: 'Jolly',   vibe: 'jolly',          shape: 'round',  acc: ['partyhat', 'bowtie', 'blush'],   B: '#e94f4f', S: '#b63a3a', H: '#ff8a80', E: '#2d1b1b', A: '#2ec4b6', C: '#ffffff' },
    { id: 'raven',   name: 'Raven',   vibe: 'gothic',         shape: 'round',  acc: ['batwings', 'bangs'],             B: '#b8b0cc', S: '#8a82a3', H: '#d9d3ea', E: '#7b2cbf', A: '#3c096c', C: '#2a1f3d' },
    { id: 'brick',   name: 'Brick',   vibe: 'strong',         shape: 'square', acc: ['headband', 'brows'],             B: '#f08a4b', S: '#c46a33', H: '#ffb98a', E: '#2b1d14', A: '#d62828', C: '#ffffff' },
    { id: 'umbra',   name: 'Umbra',   vibe: 'dark',           shape: 'tall',   acc: ['hood'],                          B: '#3a3a4a', S: '#26262f', H: '#4e4e63', E: '#ff3b3b', A: '#ff3b3b', C: '#141420' },
    { id: 'halo',    name: 'Halo',    vibe: 'holy',           shape: 'round',  acc: ['wings', 'halo'],                 B: '#fff8e1', S: '#e8d9a8', H: '#ffffff', E: '#5a4a2a', A: '#ffd166', C: '#ffffff' },
    { id: 'byte',    name: 'Byte',    vibe: 'geek',           shape: 'round',  acc: ['glasses', 'antenna'],            B: '#52b7b0', S: '#3a8a85', H: '#8ee0d9', E: '#1f2a44', A: '#ff6b35', C: '#ffffff' },
    { id: 'lucky',   name: 'Lucky',   vibe: 'happy-go-lucky', shape: 'round',  acc: ['cap', 'blush'],                  B: '#ffa94d', S: '#d9822b', H: '#ffd3a1', E: '#3a2614', A: '#4361ee', C: '#ffffff' },
    { id: 'frost',   name: 'Frost',   vibe: 'cool',           shape: 'round',  acc: ['scarf'],                         B: '#9ad1f0', S: '#6aa6c9', H: '#d0edff', E: '#243b53', A: '#e63946', C: '#ffffff' },
    { id: 'ember',   name: 'Ember',   vibe: 'fiery',          shape: 'round',  acc: ['flame'],                         B: '#ff6b35', S: '#c8491f', H: '#ffa07a', E: '#3b1a0d', A: '#ff9f1c', C: '#ffffff' },
    { id: 'sprout',  name: 'Sprout',  vibe: 'soft',           shape: 'blob',   acc: ['leaf', 'blush'],                 B: '#a3d977', S: '#7fb35a', H: '#cdeeb0', E: '#2f4a1f', A: '#ffffff', C: '#ffffff' },
    { id: 'pixel',   name: 'Pixel',   vibe: 'robot',          shape: 'square', acc: ['screen', 'antenna', 'bolts'],    B: '#b0b7c3', S: '#7e8794', H: '#d9dee6', E: '#35e2ff', A: '#ff5c8a', C: '#1b2030' },
    { id: 'bubbles', name: 'Bubbles', vibe: 'bubbly',         shape: 'blob',   acc: ['bubbles'],                       B: '#b388ff', S: '#8a5fd9', H: '#d7c2ff', E: '#2c1a4d', A: '#d9b8ff', C: '#e9dcff' },
    // ---- v2 ----
    { id: 'pretty',  name: 'Pretty',  vibe: 'feeling pretty', shape: 'round',  acc: ['bow', 'lashes', 'blush'],        B: '#f7c6e0', S: '#d69ab8', H: '#fde4f0', E: '#4a2c3d', A: '#e63e8f', C: '#ffffff' },
    { id: 'dapper',  name: 'Dapper',  vibe: 'handsome',       shape: 'round',  acc: ['tophat', 'stache', 'monocle'],   B: '#e8d5b7', S: '#c2ae8e', H: '#f6ead3', E: '#3a2a1e', A: '#b5121b', C: '#2b2b33' },
    { id: 'bean',    name: 'Bean',    vibe: 'coffee addict',  shape: 'mug',    acc: ['mughandle', 'coffee', 'eyebags'], B: '#f1e6d8', S: '#c9b9a5', H: '#fff8ee', E: '#3b2416', A: '#8b5a2b', C: '#d9cbb8' },
    { id: 'lemon',   name: 'Lemon',   vibe: 'sour & zesty',   shape: 'lemon',  acc: ['zest'],                          B: '#f9e04b', S: '#d4b82a', H: '#fff4a8', E: '#4a3f0c', A: '#ffd166', C: '#ffffff' },
    { id: 'spud',    name: 'Spud',    vibe: 'potato',         shape: 'potato', acc: ['sprouts'],                       B: '#c9a26e', S: '#a3804f', H: '#e2c08f', E: '#3f2d14', A: '#8b5a2b', C: '#ffffff' },
    { id: 'toasty',  name: 'Toasty',  vibe: 'warm',           shape: 'toast',  acc: ['crust'],                         B: '#f3d7a3', S: '#d2b27a', H: '#fbe8c4', E: '#4a301a', A: '#ffd166', C: '#b06a2a' },
    { id: 'zen',     name: 'Zen',     vibe: 'monk',           shape: 'round',  acc: ['beads'],                         B: '#ffd8b1', S: '#e0b58a', H: '#ffe9d1', E: '#3a2a22', A: '#d84a2a', C: '#8d5b3a' },
    { id: 'cactus',  name: 'Cactus',  vibe: 'prickly',        shape: 'cactus', acc: ['spines', 'flower'],              B: '#5fb86b', S: '#3f8f49', H: '#8fd99a', E: '#1f3d22', A: '#ff6f91', C: '#ffffff' },
    { id: 'rocky',   name: 'Rocky',   vibe: 'stoic',          shape: 'rock',   acc: ['cracks'],                        B: '#9a9aa6', S: '#6f6f7a', H: '#c2c2cc', E: '#2a2a33', A: '#c2c2cc', C: '#ffffff' },
    { id: 'drip',    name: 'Drip',    vibe: 'emotional',      shape: 'drop',   acc: ['ripple'],                        B: '#6fc3ff', S: '#3f93d6', H: '#b9e4ff', E: '#163a5c', A: '#ffffff', C: '#a9dcff' },
    { id: 'nova',    name: 'Nova',    vibe: 'show-off',       shape: 'star',   acc: ['shine'],                         B: '#ffcf5c', S: '#e0a92e', H: '#fff0b3', E: '#4a3410', A: '#ff8a3d', C: '#ffffff' },
    { id: 'ninja',   name: 'Ninja',   vibe: 'sneaky',         shape: 'round',  acc: ['mask'],                          B: '#d8c9b8', S: '#b09c8a', H: '#efe4d6', E: '#1b1a2e', A: '#d62828', C: '#ffffff' },
    { id: 'captain', name: 'Captain', vibe: 'bold',           shape: 'round',  acc: ['pirate'],                        B: '#f0b38a', S: '#c98c62', H: '#ffd3b5', E: '#3a2416', A: '#ffd166', C: '#ffffff' },
    { id: 'sassy',   name: 'Sassy',   vibe: 'diva',           shape: 'round',  acc: ['shades', 'lips'],                B: '#c58cff', S: '#9b5fd9', H: '#e1c2ff', E: '#2c1a4d', A: '#ff3cac', C: '#ffffff' },
    { id: 'boo',     name: 'Boo',     vibe: 'shy',            shape: 'tall',   acc: ['boo', 'blush'],                  B: '#eef2f7', S: '#c7d0dd', H: '#ffffff', E: '#4a5566', A: '#b9c6d6', C: '#ffffff' },
    // ---- v3 critters: head, body, arms, feet ----
    { id: 'pengo',    name: 'Pengo',    vibe: 'penguin',  shape: 'critter', acc: ['belly', 'beak', 'blush'],                  B: '#2f3a52', S: '#1d2436', H: '#4b5878', E: '#111522', M: '#111522', A: '#ff9f1c', C: '#ffffff' },
    { id: 'bamboo',   name: 'Bamboo',   vibe: 'panda',    shape: 'critter', acc: ['roundEars', 'pandaEyes', 'nose'],          B: '#f7f5f0', S: '#d8d3c8', H: '#ffffff', E: '#ffffff', M: '#1b1a2e', A: '#4fc35a', C: '#23222b' },
    { id: 'ribbit',   name: 'Ribbit',   vibe: 'frog',     shape: 'critter', acc: ['frogBumps', 'bellyC', 'blush'],            B: '#6cc04a', S: '#4d9134', H: '#9ee07c', E: '#1f3b12', A: '#ff6f91', C: '#d7f0b0' },
    { id: 'whiskers', name: 'Whiskers', vibe: 'cat',      shape: 'critter', acc: ['catEars', 'stripes', 'whiskers', 'nose'],  B: '#f2b36b', S: '#c98a44', H: '#ffd59a', E: '#2b1d0f', A: '#ffffff', C: '#c9823c' },
    { id: 'clank',    name: 'Sir Clank', vibe: 'knight',  shape: 'critter', acc: ['sword', 'helmet', 'shield'],               B: '#ffd9b3', S: '#d9ae84', H: '#ffe9d1', E: '#2a2a33', A: '#d62828', C: '#9aa3b2' },
    { id: 'imp',      name: 'Imp',      vibe: 'little devil', shape: 'critter', acc: ['horns', 'devilTail', 'trident', 'blush'], B: '#e94f4f', S: '#b33535', H: '#ff8a80', E: '#2d0f0f', A: '#ffd166', C: '#7a1d1d' },
    { id: 'bjorn',    name: 'Bjorn',    vibe: 'viking',   shape: 'critter', acc: ['axe', 'vikingHelm', 'belly'],              B: '#f2c9a0', S: '#c99c70', H: '#ffe0c2', E: '#3a2614', A: '#8d99ae', C: '#f3f0e6' },
    { id: 'kit',      name: 'Kit',      vibe: 'fox',      shape: 'critter', acc: ['foxEars', 'belly', 'nose', 'blush'],       B: '#ff8c42', S: '#cc6a2a', H: '#ffb27a', E: '#2b1d0f', A: '#ffffff', C: '#e07a33' },
    { id: 'chef',     name: 'Chef',     vibe: 'cook',     shape: 'critter', acc: ['spoon', 'apron', 'toque', 'blush'],        B: '#ffd8b1', S: '#e0b58a', H: '#ffe9d1', E: '#3a2a22', A: '#8b5a2b', C: '#ffffff' },
    { id: 'hoot',     name: 'Hoot',     vibe: 'owl',      shape: 'critter', acc: ['owlTufts', 'wingsS', 'owlMask', 'bellyC', 'smallBeak'], B: '#9c6b3f', S: '#74502f', H: '#bb8a5e', E: '#2b1d0f', A: '#ffb703', C: '#e8d2b0' },
    { id: 'bun',      name: 'Bun',      vibe: 'bunny',    shape: 'critter', acc: ['bunEars', 'belly', 'nose', 'blush'],       B: '#f1e9e4', S: '#cfc3bb', H: '#ffffff', E: '#3b2a35', A: '#ffffff', C: '#e2d3cc' },
    { id: 'tako',     name: 'Tako',     vibe: 'octopus',  shape: 'round',   acc: ['tentacles', 'blush'],                      B: '#ff7eb6', S: '#d6558f', H: '#ffb3d6', E: '#3b1a2e', A: '#ff4d8d', C: '#ffffff' },
    { id: 'blub',     name: 'Blub',     vibe: 'whale',    shape: 'whale',   acc: ['spout', 'fin', 'blush'],                   B: '#5bb6ff', S: '#3a86d6', H: '#9ad6ff', E: '#1b2a4a', A: '#ffffff', C: '#c9e8ff' },
    { id: 'moo',      name: 'Moo',      vibe: 'cow',      shape: 'critter', acc: ['cowHorns', 'cowSpots', 'snout'],           B: '#f7f5f0', S: '#d8d3c8', H: '#ffffff', E: '#2a2a2a', A: '#e0b58a', C: '#2a2a2a' },
    { id: 'pup',      name: 'Pup',      vibe: 'dog',      shape: 'critter', acc: ['pupEars', 'belly', 'collar', 'nose', 'tongue'], B: '#d9a066', S: '#ad7a45', H: '#ecc392', E: '#2b1d0f', A: '#d62828', C: '#8b5a2b' }
  ];
  var BY_ID = {};
  CHARACTERS.forEach(function (c) { BY_ID[c.id] = c; });

  // ---- moods: eyes (L,R), mouth, body offset, overlay ----------------------------------
  function bounce(f) { return { ox: 0, oy: [0, -1, -2, -2, -1, 0, 0, 0, 0, 0, 0, 0][f] }; }
  function jitter(f) { return { ox: [0, 1, 0, -1][f % 4], oy: 0 }; }
  function still() { return { ox: 0, oy: 0 }; }
  function sparkles(g, f) {
    [[-4, 2], [16, 0], [-4, 10], [16, 9]].forEach(function (p, i) {
      var k = (f + i * 3) % 12;
      if (k < 4) g.put(p[0], p[1], ['.Y.', 'YYY', '.Y.']); else if (k < 6) g.put(p[0] + 1, p[1] + 1, ['Y']);
    });
  }
  var QMARK = ['.EE.', 'E..E', '...E', '..E.', '....', '..E.'];

  var MOOD = {
    happy:   { eyes: function () { return [EYES.happy, EYES.happy]; }, mouth: function () { return MOUTHS.smile; }, anim: bounce, overlay: sparkles },
    quiet:   { eyes: function (f) { var e = f >= 10 ? EYES.blink : EYES.dot; return [e, e]; }, mouth: function () { return MOUTHS.flat; }, anim: still },
    asleep:  { eyes: function () { return [EYES.closed, EYES.closed]; }, mouth: function () { return MOUTHS.small; },
      anim: function (f) { return { ox: 0, oy: f < 6 ? 0 : 1 }; },
      overlay: function (g, f) { for (var i = 0; i < 3; i++) { var k = (f + i * 4) % 12; if (k < 9) g.put(14 + i, 3 - (k >> 1), ['ZZZ', '.Z.', 'ZZZ']); } } },
    investigating: { eyes: function () { return [EYES.squint, EYES.wide]; }, mouth: function () { return MOUTHS.tiny; }, anim: still,
      overlay: function (g, f, a) { var sh = [0, 0, 1, 1, 2, 2, 1, 1, 0, 0, -1, -1][f]; var x = a.eyeR - 1 + sh, y = a.eyeY - 1;
        g.put(x, y, ['.KKK.', 'K...K', 'K...K', 'K...K', '.KKK.']); g.put(x + 4, y + 4, ['K.', '.K']); g.put(x + 5, y + 6, ['.K']); } },
    alert:   { eyes: function () { return [EYES.wide, EYES.wide]; }, mouth: function () { return MOUTHS.open; },
      anim: function (f) { return { ox: f < 4 ? (f % 2 ? 1 : -1) : 0, oy: 0 }; },
      overlay: function (g, f) { if (f % 4 < 3) g.put(14, -6, ['RR', 'RR', 'RR', '..', 'RR']); } },
    stressed: { eyes: function () { return [EYES.worryL, EYES.worryR]; }, mouth: function (f) { return f % 6 < 3 ? MOUTHS.wavy0 : MOUTHS.wavy1; }, anim: jitter,
      overlay: function (g, f) { g.put(14, 2 + (f % 6), ['.L', 'LL']); g.put(-2, 4 + ((f + 3) % 6), ['L.', 'LL']); } },
    pokerface: { eyes: function (f) { var e = f === 11 ? EYES.blink : EYES.half; return [e, e]; }, mouth: function () { return MOUTHS.flat; }, anim: still },
    memeface: { eyes: function () { return [EYES.squint, EYES.wide]; }, mouth: function () { return MOUTHS.smirk; },
      anim: function (f) { return { ox: f % 12 < 6 ? 0 : 1, oy: 0 }; },
      overlay: function (g, f, a) { g.put(a.eyeR, a.eyeY - (f % 6 < 3 ? 2 : 1), ['KKK']); } },
    wtf:     { eyes: function () { return [EYES.wide, EYES.half]; }, mouth: function () { return MOUTHS.pout; }, anim: still,
      overlay: function (g, f, a) { g.put(a.eyeR - 1, a.eyeY - 2, ['KKKK']); if (f % 8 < 5) g.put(15, -5, QMARK); } },
    angry:   { eyes: function () { return [EYES.angryL, EYES.angryR]; }, mouth: function () { return MOUTHS.frown; },
      anim: function (f) { return { ox: f % 2 ? 1 : 0, oy: 0 }; },
      overlay: function (g, f) { if (f % 4 < 3) g.put(13, -3, ['R.R', '.R.', 'R.R']); } },
    sad:     { eyes: function () { return [EYES.sadL, EYES.sadR]; }, mouth: function () { return MOUTHS.frown; },
      anim: function () { return { ox: 0, oy: 1 }; },
      overlay: function (g, f, a) { var len = 3 + ((f >> 1) % 3); g.put(a.eyeL, a.eyeY + 3, lines('L', len, 2)); g.put(a.eyeR + 1, a.eyeY + 3, lines('L', len, 2)); if (f % 4 < 2) { g.put(a.eyeL, a.eyeY + 3 + len, ['L']); g.put(a.eyeR + 2, a.eyeY + 3 + len, ['L']); } } },
    tantrum: { eyes: function () { return [EYES.wailL, EYES.wailR]; }, mouth: function () { return MOUTHS.wail; },
      anim: function (f) { return { ox: f % 2 ? 1 : -1, oy: f % 4 < 2 ? 0 : 1 }; },
      overlay: function (g, f, a) {
        g.put(a.eyeL, a.eyeY + 3, ['LL', 'LL']); g.put(a.eyeR + 1, a.eyeY + 3, ['LL', 'LL']);
        for (var i = 0; i < 3; i++) { var k = (i * 2 + (f % 6)) % 6; g.put(a.eyeL - 2 - k, a.eyeY + 1 - (k >> 1), ['L', 'L']); g.put(a.eyeR + 4 + k, a.eyeY + 1 - (k >> 1), ['L', 'L']); }
      } },
    doubtful: { eyes: function () { return [EYES.dot, EYES.browDot]; }, mouth: function () { return MOUTHS.slant; }, anim: still,
      overlay: function (g, f) { if (f % 6 < 4) g.put(15, -4, QMARK); } },
    lost:    { eyes: function (f) { var e = f % 12 < 6 ? EYES.sideL : EYES.sideR; return [e, e]; }, mouth: function () { return MOUTHS.o; },
      anim: function (f) { return { ox: [0, 1, 1, 0, -1, -1][f % 6], oy: 0 }; },
      overlay: function (g, f) { var p = [[14, -5], [16, -2], [-4, -2], [-2, -5]][(f >> 1) % 4]; g.put(p[0], p[1], QMARK); } },
    flabbergasted: { eyes: function () { return [EYES.wide, EYES.wide]; }, mouth: function () { return MOUTHS.gape; },
      anim: function (f) { return { ox: [0, 0, -1, 0, 0, 1][f % 6], oy: 0 }; },
      overlay: function (g, f, a) { g.put(a.eyeL, a.eyeY - 2, ['KKK']); g.put(a.eyeR, a.eyeY - 2, ['KKK']); if (f % 2) { g.put(-4, 2, ['EE']); g.put(-4, 5, ['EE']); g.put(16, 2, ['EE']); g.put(16, 5, ['EE']); } } },
    amazed:  { eyes: function () { return [EYES.star, EYES.star]; }, mouth: function () { return MOUTHS.o; },
      anim: function (f) { return { ox: 0, oy: f % 12 < 6 ? 0 : -1 }; }, overlay: sparkles },
    ecstatic: { eyes: function () { return [EYES.happy, EYES.happy]; }, mouth: function () { return MOUTHS.grin; },
      anim: function (f) { return { ox: 0, oy: [0, -2, -3, -3, -2, 0, 0, -2, -3, -3, -2, 0][f] }; },
      overlay: function (g, f) { var pts = [[-4, 1, 'Y'], [16, 3, 'P'], [-3, 8, 'A'], [17, 10, 'Y'], [-2, -3, 'P'], [15, -4, 'A']];
        pts.forEach(function (p, i) { var k = (f + i * 2) % 12; if (k < 6) g.put(p[0], p[1] + (k >> 1), [p[2]]); }); sparkles(g, f); } },
    insightful: { eyes: function () { return [EYES.squint, EYES.dot]; }, mouth: function () { return MOUTHS.tiny; }, anim: still,
      overlay: function (g, f) { if (f % 8 < 5) { g.put(5, -5, ['.YY.', 'YYYY', '.YY.', '.KK.']); g.put(3, -4, ['A']); g.put(10, -4, ['A']); g.put(6, -6, ['AA']); } else g.put(5, -5, ['.KK.', 'K..K', '.KK.', '.KK.']); } },
    secretive: { eyes: function (f) { var e = f % 8 < 4 ? EYES.sideL : EYES.sideR; return [e, e]; }, mouth: function () { return MOUTHS.tiny; }, anim: still,
      overlay: function (g, f, a) { g.put(a.mouthX + 2, a.mouthY - 1, ['S', 'S', 'S']); for (var i = 0; i < 3; i++) if ((f >> 1) % 4 > i) g.put(15 + i * 2, 1, ['E']); } },
    extrovert: { eyes: function () { return [EYES.happy, EYES.happy]; }, mouth: function () { return MOUTHS.grin; }, anim: bounce,
      overlay: function (g, f) { if (f % 4 < 2) { g.put(-3, 5, ['S..', '.SS']); g.put(14, 5, ['..S', 'SS.']); } else { g.put(-3, 6, ['...', 'SSS']); g.put(14, 6, ['...', 'SSS']); } g.put(-4, 0, f % 4 < 2 ? ['.Y.', 'YYY', '.Y.'] : ['...', '.Y.', '...']); } },
    introvert: { eyes: function () { return [EYES.down, EYES.down]; }, mouth: function () { return MOUTHS.small; },
      anim: function () { return { ox: 0, oy: 1 }; },
      overlay: function (g, f, a) { g.put(a.eyeL - 2, a.eyeY + 3, ['PP']); g.put(a.eyeR + 3, a.eyeY + 3, ['PP']); g.put(1, 10, ['S']); g.put(12, 10, ['S']); if (f % 6 < 3) g.put(15, 1, ['E']); } }
  };

  // ---- life stages ------------------------------------------------------------------------
  var STAGE = {
    baby: function (g, f, a) { g.put(a.mouthX + 1, a.mouthY - 1, ['.A.', 'AAA', '.A.']); g.put(a.offX + (a.w >> 1) - 1, a.offY - 2, ['.K', 'K.']); },
    toddler: function (g, f, a) { g.put(a.offX + (a.w >> 1) - 1, a.offY - 2, ['.K', 'K.']); g.put(a.offX + (a.w >> 1) - 2, a.mouthY + 3, ['WWWW']); g.put(a.offX + a.w, a.offY + a.h - 3, f % 6 < 3 ? ['AA', 'AA'] : ['.AA', '.AA']); },
    teen: function (g) { g.put(2, -1, ['KKKKKKKKKK']); g.put(-1, 3, ['KK', 'KK']); g.put(13, 3, ['KK', 'KK']); g.put(6, -3, ['..K', '.KK', 'KK.']); },
    adult: function () {},
    corporate: function (g, f) { g.put(5, 10, ['WAAAW', '..A..', '..A..', '..A..']); g.put(10, 10, ['WW', 'WA']); if (f % 8 < 4) g.put(-4, 9, ['WWW', 'WWW', '.W.']); else g.put(-4, 8, ['WWW', 'WWW', 'WWW', '.W.']); },
    settled: function (g, f) { g.put(14, 7, ['WW.', 'WWW', 'WW.']); if (f % 4 < 2) g.put(14, 5, ['H', '.']); g.put(-4, 6, ['.G.', 'GGG', '.O.', 'OOO']); },
    elder: function (g, f, a) { g.put(a.mouthX - 1, a.mouthY + 2, ['WWWWWWW', '.WWWWW.', '..WWW..']); g.put(2, 3, ['.KKK..KKK.', 'K...KK...K', 'K...KK...K', 'K...KK...K', '.KKK..KKK.']); g.put(16, 2, ['KK', '.K', '.K', '.K', '.K', '.K', '.K', '.K', '.K']); }
  };
  var STAGE_OFFSET = { elder: { ox: 0, oy: 1 } };

  // ---- activities -----------------------------------------------------------------------------
  var ACTIVITY = {
    none: {},
    eat: { mouth: function (f) { return f % 4 < 2 ? MOUTHS.chew0 : MOUTHS.chew1; },
      overlay: function (g, f, a, food) { var fd = FOOD_BY_ID[food || 'apple'] || FOODS[0], stage = fd.kind === 'drink' ? 0 : f < 4 ? 0 : f < 8 ? 1 : 2, rows = foodTokens(fd.id, stage, f), lift = fd.kind === 'drink' ? (f % 8 < 4 ? 0 : -1) : 0;
        for (var y = 0; y < 12; y++) for (var x = 0; x < 12; x++) if (rows[y][x]) g.put(12 + x, 4 + y + lift, [rows[y][x]]);
        g.put(11, 9 + lift, ['S', 'S']); } },
    learn: { overlay: function (g, f) { g.put(13, 8, ['WW.WW', 'WWWWW', 'WWWWW', 'EEEEE']); if (f % 6 < 3) g.put(14, 9, ['E.E']); else g.put(14, 10, ['E.E']); } },
    work: { overlay: function (g, f) { g.put(4, 10, ['EEEEEE', 'EWWWWE', 'EWWWWE', 'EEEEEE', '.SSSS.']); g.put(5 + (f % 2) * 2, 11, ['L']); } },
    play: { overlay: function (g, f) { var y = 6 + [0, -2, -4, -5, -4, -2, 0, 0, 0, 0, 0, 0][f]; g.put(15, y, ['.RR.', 'RWWR', 'RWWR', '.RR.']); } },
    argue: { eyes: function () { return [EYES.angryL, EYES.angryR]; }, mouth: function (f) { return f % 4 < 2 ? MOUTHS.shout : MOUTHS.open; },
      anim: function (f) { return { ox: f % 2 ? 1 : 0, oy: 0 }; },
      overlay: function (g, f) { var sym = f % 6 < 3 ? ['R.R.R', '.R.R.'] : ['.R.R.', 'R.R.R']; g.put(12, -6, ['.EEEEE.', 'EWWWWWE', 'EWWWWWE', 'EWWWWWE', '.EEEEE.', 'E......']); g.put(13, -4, sym); } }
  };

  // ---- pantry: 12×12 pixel foods with their own palettes -----------------------------------------
  // letters are per-food colours; '.' is empty. Drinks never get bitten; everything else has three bite stages.
  var FOODS = [
    { id: 'apple', name: 'Apple', kind: 'fruit', pal: { r: '#e63946', d: '#b5121b', h: '#ff8a80', s: '#6b4220', g: '#4fc35a' }, art: ['.....s......', '....sgg.....', '...ggg......', '..rrrrrrr...', '.rrhrrrrrr..', 'rrhhrrrrrrr.', 'rrhrrrrrrrr.', 'rrrrrrrrrrd.', 'rrrrrrrrrdd.', '.rrrrrrrdd..', '..rrrrddd...', '...ddddd....'] },
    { id: 'banana', name: 'Banana', kind: 'fruit', pal: { y: '#ffd93d', d: '#d9a92a', s: '#6b4220', h: '#fff2a8' }, art: ['..........s.', '.........yy.', '........yyy.', '.......yyyd.', '......yyyd..', '.....yyyd...', '....yyyd....', '...yyyd.....', '..yyyd......', '.hyyd.......', 'hhyd........', '.ss.........'] },
    { id: 'strawberry', name: 'Strawberry', kind: 'fruit', pal: { r: '#ff3b5c', d: '#c71d3a', g: '#4fc35a', e: '#3a7d2c', y: '#ffe9a8' }, art: ['.....ge.....', '...geggeg...', '....ggeg....', '..rrrrrrr...', '.rryrrryrr..', 'rrrrryrrrrr.', 'rryrrrrryr..', '.rrrryrrrr..', '.rryrrrryr..', '..rrrryrr...', '...rrrrr....', '....ddd.....'] },
    { id: 'watermelon', name: 'Watermelon', kind: 'fruit', pal: { r: '#ff5a7a', k: '#2a1a2e', w: '#f5f5f5', g: '#2f9e44', l: '#8fdc6a' }, art: ['............', '............', 'rrrrrrrrrrrr', 'rrkrrrkrrkrr', 'rrrrrrrrrrrr', '.rrkrrrkrrr.', '.rrrrrrrrrr.', '..rrkrrkrr..', '..wwwwwwww..', '...glglgl...', '....gggg....', '............'] },
    { id: 'grapes', name: 'Grapes', kind: 'fruit', pal: { p: '#8a4fd6', d: '#5e2fa8', h: '#b98cf0', s: '#6b4220', g: '#4fc35a' }, art: ['.....s......', '....sgg.....', '...pp.pp....', '..php.php...', '..pp.pp.pp..', '.php.php.pp.', '.pp.pp.pp...', '..php.php...', '..pp.pp.....', '...php......', '....pp......', '............'] },
    { id: 'carrot', name: 'Carrot', kind: 'veg', pal: { o: '#ff8c42', d: '#d96a1f', g: '#4fc35a', e: '#2f9e44' }, art: ['.........gg.', '........gge.', '.......ggeg.', '......oo.g..', '.....ooo....', '....oodo....', '...oodo.....', '..oodo......', '.oodo.......', '.odo........', 'od..........', '............'] },
    { id: 'coffee', name: 'Coffee', kind: 'drink', hot: true, pal: { w: '#fdfaf4', g: '#d9cfc1', b: '#6b4220', c: '#8b5a2b', k: '#3a2416' }, art: ['............', '............', '.wwwwwwwww..', '.wbbbbbbbwww', '.wbbbbbbbw.w', '.wbcbbbbbw.w', '.wbbbbbbbw.w', '.wwwwwwwww.w', '..wwwwwwwww.', '..wwwwwww...', '.ggggggggg..', '............'] },
    { id: 'tea', name: 'Green tea', kind: 'drink', hot: true, pal: { w: '#e8f3e0', t: '#8fbf5a', d: '#5f8f3a', g: '#c9d8bd' }, art: ['............', '............', '..wwwwwwww..', '..wttttttw..', '..wttttttw..', '..wtdttttw..', '..wttttttw..', '..wwwwwwww..', '...wwwwww...', '..gggggggg..', '............', '............'] },
    { id: 'boba', name: 'Boba tea', kind: 'drink', pal: { c: '#f3d9c4', k: '#3a2416', w: '#ffffff', s: '#ff6f91', l: '#e6c3a6' }, art: ['....s.......', '....s.......', '.wwwswwwww..', '.wcccccccw..', '.wcccccccw..', '.wcccccccw..', '.wcklcccck..', '.wckckckcw..', '.wkckckckw..', '.wckckckcw..', '..wwwwwww...', '............'] },
    { id: 'soda', name: 'Soda', kind: 'drink', pal: { r: '#e63946', w: '#f5f5f5', g: '#9aa3b2', d: '#b5121b' }, art: ['............', '...gggggg...', '...gwwwwg...', '..rrrrrrrr..', '..rrwwrrrr..', '..rrwrrrrr..', '..rrrrrrrr..', '..rrwwwwrr..', '..rrrrrrrr..', '..drrrrrrd..', '...gggggg...', '............'] },
    { id: 'juice', name: 'Juice box', kind: 'drink', pal: { o: '#ff9f1c', w: '#ffffff', g: '#4fc35a', d: '#d9822b', k: '#3a2416' }, art: ['.......w....', '.......w....', '..oooooooo..', '..oooooooo..', '..owwwwwwo..', '..owggwwwo..', '..owggwwwo..', '..owwwwwwo..', '..oooooooo..', '..oooooooo..', '..dddddddd..', '............'] },
    { id: 'cake', name: 'Cake slice', kind: 'sweet', pal: { p: '#ff8fb8', w: '#fff3f6', y: '#f6d17a', r: '#e63946', c: '#f0b7cf' }, art: ['......r.....', '.....rr.....', '....wwww....', '...wwwwww...', '..pppppppp..', '..yyyyyyyy..', '..pppppppp..', '..yyyyyyyy..', '..pppppppp..', '..yyyyyyyy..', '..cccccccc..', '............'] },
    { id: 'cupcake', name: 'Cupcake', kind: 'sweet', pal: { p: '#ff8fb8', w: '#fff3f6', b: '#d9822b', d: '#b5631a', r: '#e63946', s: '#ffd166' }, art: ['.....r......', '....www.....', '...wwwww....', '..wwwsww....', '.wwwwwwwww..', '.wswwwwsww..', '..bbbbbbbb..', '..bdbdbdbd..', '..bbbbbbbb..', '..bdbdbdbd..', '...bbbbbb...', '............'] },
    { id: 'donut', name: 'Donut', kind: 'sweet', pal: { p: '#ff8fb8', b: '#d9a066', d: '#b5631a', s: '#ffd166', g: '#4fc35a', c: '#4a9ee8' }, art: ['............', '...pppppp...', '..ppspppcp..', '.ppppggpppp.', '.pppbbbbppp.', 'pppbb..bbppp', 'ppcbb..bbspp', '.bbbbbbbbbb.', '.bbbbbbbbbb.', '..bbbbbbbb..', '...dddddd...', '............'] },
    { id: 'cookie', name: 'Cookie', kind: 'sweet', pal: { b: '#d9a066', d: '#b5631a', k: '#4a2c1a', h: '#f0c48a' }, art: ['............', '...bbbbbb...', '..bhbbbkbb..', '.bbbkbbbbbb.', '.bbbbbbbbkb.', 'bbkbbbhbbbbb', 'bbbbbbbbbkbb', '.bbbbkbbbbb.', '.bkbbbbbkbb.', '..bbbbbbbb..', '...dddddd...', '............'] },
    { id: 'icecream', name: 'Ice cream', kind: 'sweet', pal: { p: '#ff8fb8', w: '#fff3f6', m: '#b9e5c9', c: '#e9b949', d: '#c9951f', r: '#e63946' }, art: ['.....r......', '....pppp....', '...pppppp...', '...wwwwww...', '..wwwwwwww..', '...mmmmmm...', '..mmmmmmmm..', '...cdcdcd...', '...dcdcdc...', '....cdcd....', '.....dc.....', '......c.....'] },
    { id: 'popsicle', name: 'Popsicle', kind: 'sweet', pal: { b: '#4fc3f7', w: '#e8fbff', s: '#d9a066', p: '#ff8fb8' }, art: ['....bbbb....', '...bbbbbb...', '...bwbbbb...', '...bwbbbb...', '...bbbbbb...', '...pppppp...', '...pppppp...', '...pppppp...', '....pppp....', '.....ss.....', '.....ss.....', '.....ss.....'] },
    { id: 'lollipop', name: 'Lollipop', kind: 'sweet', pal: { r: '#ff3b5c', w: '#ffffff', y: '#ffd166', s: '#f5f5f5' }, art: ['....rrrr....', '...rwwrrr...', '..rwrrryrr..', '..rrryrrrr..', '..rryrrrrr..', '..rrrrrrrr..', '...rrrrrr...', '....rrrr....', '.....ss.....', '.....ss.....', '.....ss.....', '.....ss.....'] },
    { id: 'chocolate', name: 'Chocolate', kind: 'sweet', pal: { b: '#5a3a1e', d: '#3a2416', h: '#8b5a2b', f: '#c0c0c8' }, art: ['............', '.ffbbbbbbbb.', '.fbhbbhbbhb.', '.fbbbbbbbbb.', '.fdddddddd..', '.fbhbbhbbhb.', '.fbbbbbbbbb.', '.fdddddddd..', '.fbhbbhbbhb.', '.fbbbbbbbbb.', '.ffffffffff.', '............'] },
    { id: 'pretzel', name: 'Pretzel', kind: 'snack', pal: { b: '#c17f3e', d: '#8b5a2b', w: '#ffffff' }, art: ['............', '..bbb..bbb..', '.bddb..bddb.', '.bb.bbbb.bb.', '.bb.bbbb.bb.', '.bbbbwwbbbb.', '..bbbbbbbb..', '.bbbbwbbbbb.', '.bbbwbbbwbb.', '..bbbbbbbb..', '...dddddd...', '............'] },
    { id: 'fries', name: 'Fries', kind: 'snack', pal: { r: '#e63946', y: '#ffd166', d: '#e0a92e', w: '#ffffff' }, art: ['....y.y.y...', '..y.yyy.y...', '..yyydyyyy..', '..ydyyyyyd..', '..yyyyydyy..', '.rrrrrrrrrr.', '.rrwwwwwwrr.', '.rrrrrrrrrr.', '..rrrrrrrr..', '..rrrrrrrr..', '...rrrrrr...', '............'] },
    { id: 'pizza', name: 'Pizza slice', kind: 'meal', pal: { c: '#e9b949', y: '#f6d17a', r: '#e63946', t: '#c0392b', g: '#4fc35a', d: '#c9951f' }, art: ['cccccccccccc', 'cttttttttttc', 'cyyryyyyryyc', '.yyyyrgyyyy.', '.yryyyyyyry.', '..yyyryyyy..', '..yyyyyryy..', '...yryyyy...', '...yyyyry...', '....yyyy....', '.....yy.....', '.....d......'] },
    { id: 'burger', name: 'Burger', kind: 'meal', pal: { b: '#d9a066', d: '#b5631a', g: '#4fc35a', r: '#e63946', m: '#6b4220', y: '#ffd166', s: '#fff3e0' }, art: ['............', '...bbbbbb...', '..bbsbbsbb..', '.bbbbbbbbbb.', '.gggggggggg.', '..rrrrrrrr..', '.yyyyyyyyyy.', '.mmmmmmmmmm.', '.mmmmmmmmmm.', '.bbbbbbbbbb.', '..dddddddd..', '............'] },
    { id: 'hotdog', name: 'Hot dog', kind: 'meal', pal: { b: '#e0a060', d: '#b5631a', r: '#c0392b', y: '#ffd166', m: '#e63946' }, art: ['............', '............', '.bbbbbbbbbb.', 'bbbbbbbbbbbb', 'brrrrrrrrrrb', 'bryryryryryb', 'brrrrrrrrrrb', 'bbbbbbbbbbbb', '.dddddddddd.', '............', '............', '............'] },
    { id: 'taco', name: 'Taco', kind: 'meal', pal: { y: '#f6c85f', d: '#d9a92a', g: '#4fc35a', r: '#e63946', m: '#8b5a2b', c: '#ffd166' }, art: ['............', '............', '...gggggg...', '..grrggrrg..', '.yrmmgmmmry.', '.ycmmmmmmcy.', 'yymmrmmrmmyy', 'yyyymmmmyyyy', 'yyyyyyyyyyyy', '.yyyyyyyyyy.', '..dddddddd..', '............'] },
    { id: 'sandwich', name: 'Sandwich', kind: 'meal', pal: { b: '#f0c48a', d: '#d9a066', g: '#4fc35a', y: '#ffd166', p: '#ff9eb0', r: '#e63946' }, art: ['............', '...........b', '..........bb', '.........bbb', '........bgyb', '.......bgypb', '......bgypbb', '.....bgypbb.', '....bgypbb..', '...bgypbb...', '..bbbbbb....', '.dddddd.....'] },
    { id: 'sushi', name: 'Sushi', kind: 'meal', pal: { w: '#ffffff', k: '#1b1a2e', o: '#ff8c42', p: '#ff6f91', g: '#4fc35a' }, art: ['............', '..oooooo....', '.oopoopoo...', '.oooooooo...', '.wwwwwwww...', '.wwwwwwww...', '..wwwwww....', '.......kkkk.', '......kkggkk', '......kkppkk', '......kkggkk', '.......kkkk.'] },
    { id: 'onigiri', name: 'Rice ball', kind: 'meal', pal: { w: '#ffffff', g: '#f0f0f0', k: '#1b1a2e', e: '#2a3f30' }, art: ['.....ww.....', '....wwww....', '...wwwwww...', '..wwwwwwww..', '..wwwwwwww..', '.wwwwwwwwww.', '.wwwwwwwwww.', 'wwwwwwwwwwww', 'wwwwkkkkwwww', 'wwwwkekkwwww', 'wwwwkkkkwwww', '.gggggggggg.'] },
    { id: 'ramen', name: 'Ramen', kind: 'meal', hot: true, pal: { w: '#fff8ee', r: '#e63946', y: '#ffd166', b: '#f5e0b0', g: '#4fc35a', k: '#2a2a33', p: '#ff9eb0' }, art: ['............', '...k.k.k....', '....kkk.....', '.bbbyybgbbb.', '.bbybybybpb.', '.bbbbbbbbbb.', 'wwwwwwwwwwww', 'wrrrrrrrrrrw', 'wrrrrrrrrrrw', 'wwwwwwwwwwww', '.wwwwwwwwww.', '..wwwwwwww..'] },
    { id: 'croissant', name: 'Croissant', kind: 'snack', pal: { b: '#f0b24e', d: '#c98a2b', h: '#fbd27c' }, art: ['............', '............', '..b......b..', '.bbb....bbb.', '.bbbbbbbbbb.', 'bbhbbbbbbhbb', 'bbbbdbbdbbbb', '.bbbbbbbbbb.', '..bbdbbdbb..', '...dddddd...', '............', '............'] },
    { id: 'egg', name: 'Fried egg', kind: 'meal', pal: { w: '#ffffff', g: '#e8e8e0', y: '#ffb703', o: '#ff8c00' }, art: ['............', '...wwwww....', '..wwwwwww...', '.wwwwwwwww..', '.wwwyyyyww..', 'wwwyyoyyyww.', 'wwwyyyyyyww.', '.wwwyyyyww..', '.wwwwwwwww..', '..wwwwwww...', '...ggggg....', '............'] },
    { id: 'drumstick', name: 'Drumstick', kind: 'meal', pal: { b: '#c98a2b', d: '#a0661a', h: '#f0b24e', w: '#f5f0e6' }, art: ['..bbbb......', '.bbhhbb.....', '.bbbbbbb....', '.bbbbbbbb...', '..bbbbbbbb..', '...bbbbbbb..', '....bbbbbb..', '.....ddbbw..', '.......www..', '........www.', '.........ww.', '............'] },
    { id: 'pancakes', name: 'Pancakes', kind: 'meal', pal: { b: '#e0a060', d: '#c17f3e', s: '#8b5a2b', y: '#ffd166', w: '#fff3e0' }, art: ['............', '.....yy.....', '....ssss....', '..ssssssss..', '.bbbbbbbbbb.', '.dddddddddd.', '.bbbbbbbbbb.', '.dddddddddd.', '.bbbbbbbbbb.', '.dddddddddd.', '..wwwwwwww..', '............'] }
  ];
  var FOOD_BY_ID = {}; FOODS.forEach(function (fd) { FOOD_BY_ID[fd.id] = fd; });

  // returns the food as 12×12 tokens with bite stage 0..2 applied (drinks ignore stage); tokens are '#rrggbb' or null
  function foodTokens(id, stage, f) {
    var fd = FOOD_BY_ID[id] || FOODS[0], rows = fd.art, out = [];
    for (var y = 0; y < 12; y++) { var r = []; for (var x = 0; x < 12; x++) { var ch = rows[y][x]; var col = ch === '.' ? null : fd.pal[ch] || null;
      if (col && fd.kind !== 'drink' && stage > 0) { if (stage === 1 && (x - 9) * (x - 9) + (y - 2) * (y - 2) < 11) col = null; if (stage === 2 && ((x - 8) * (x - 8) + (y - 3) * (y - 3) < 30 || x > 6)) col = null; }
      r.push(col); } out.push(r); }
    if (fd.hot && f !== undefined && (f % 8) < 5) { var k = (f >> 1) % 2; out[0][3 + k] = out[0][3 + k] || '#d9d9e0'; out[1][7 - k] = out[1][7 - k] || '#d9d9e0'; out[0][9] = out[0][9] || (k ? '#d9d9e0' : null); }
    return out;
  }

  // ---- outfits: tokens T (hat colour), V (top colour), X (top shade), U (trim/white) ------------------
  var OUTFIT = {
    hat: {
      none: null,
      cap: function (g, f, a) { g.put(1, a.offY - 1, ['..TTTTTTTT......', '.TTTTTTTTTT.....', 'TTTTTTTTTTTTTTTT']); },
      beanie: function (g, f, a) { g.put(2, a.offY - 3, ['....UU....', '..TTTTTT..', '.TTTTTTTT.', 'TTUTTTTUTT']); },
      tophat: function (g, f, a) { g.put(2, a.offY - 6, ['..TTTTTT..', '..TTTTTT..', '..TTTTTT..', '..TUUUUT..', '..TTTTTT..', 'TTTTTTTTTT']); },
      party: function (g, f, a) { g.put(4, a.offY - 4, ['..Y..', '.TTT.', '.TUT.', 'TTTTT']); },
      crown: function (g, f, a) { g.put(3, a.offY - 3, ['T..T..T.', 'TT.TT.TT', 'TTTTTTTT']); g.put(4, a.offY - 2, ['R']); g.put(7, a.offY - 2, ['R']); },
      bow: function (g, f, a) { g.put(8, a.offY - 3, ['TT..TT', 'TTTTTT', '.TUUT.', 'TTTTTT', 'TT..TT']); },
      headphones: function (g, f, a) { g.put(2, a.offY - 1, ['TTTTTTTTTT']); g.put(-1, a.offY + 3, ['TT', 'TT']); g.put(13, a.offY + 3, ['TT', 'TT']); },
      beret: function (g, f, a) { g.put(1, a.offY - 2, ['......T......', '..TTTTTTTTT..', 'TTTTTTTTTTTTT']); },
      cowboy: function (g, f, a) { g.put(0, a.offY - 4, ['....TTTTTT....', '....TTTTTT....', '....TUUUUT....', 'TTTTTTTTTTTTTT', '.TT........TT.']); },
      wizard: function (g, f, a) { g.put(1, a.offY - 6, ['.....TT.....', '.....TT.....', '....TTTT....', '....TTYT....', '...TTTTTT...', '..TTTTTTTT..', 'TTTTTTTTTTTT']); },
      pirate: function (g, f, a) { g.put(0, a.offY - 4, ['....TTTTTT....', '..TTTTTTTTTT..', '.TTTTTWTTTTTT.', 'TTTTTWWWTTTTTT', '.TT..TWT..TT..']); },
      santa: function (g, f, a) { g.put(0, a.offY - 6, ['.......UU.....', '......TTU.....', '.....TTTT.....', '....TTTTT.....', '...TTTTTT.....', '..TTTTTTTT....', '.UUUUUUUUUUUU.']); },
      bucket: function (g, f, a) { g.put(0, a.offY - 3, ['...TTTTTTTT...', '...TUUUUUUT...', '.TTTTTTTTTTTT.']); },
      straw: function (g, f, a) { g.put(0, a.offY - 4, ['....YYYYYY....', '....YYYYYY....', '....YTTTTY....', 'YYYYYYYYYYYYYY']); },
      tiara: function (g, f, a) { g.put(1, a.offY - 3, ['.T...T...T.', 'TUT.TUT.TUT', 'TTTTTTTTTTT']); },
      flowers: function (g, f, a) { g.put(0, a.offY - 2, ['P..Y..P..Y..P.', 'GGGGGGGGGGGGGG']); },
      bandana: function (g, f, a) { g.put(0, a.offY, ['..TTTTTTTTTT..', '.TTTTTTTTTTTT.', '............TT', '.............T']); },
      ushanka: function (g, f, a) { g.put(0, a.offY - 3, ['..UUUUUUUUUU..', '.UTTTTTTTTTTU.', 'UUTTTTTTTTTTUU', 'UU..........UU', 'UU..........UU', 'U............U']); },
      sombrero: function (g, f, a) { g.put(0, a.offY - 4, ['.....TTTT.....', '.....TUUT.....', '.....TTTT.....', 'TTTTTTTTTTTTTT']); g.put(-1, a.offY, ['.TTTTTTTTTTTTT.']); },
      helmet: function (g, f, a) { g.put(0, a.offY - 3, ['....TTTTTT....', '..TTTTTTTTTT..', '.TTWTTTTTTWTT.', '.TTTTTTTTTTTT.']); },
      bunnyband: function (g, f, a) { g.put(2, a.offY - 5, ['TT....TT..', 'TP....TP..', 'TP....TP..', 'TT....TT..', 'TTTTTTTTTT']); },
      halo: function (g, f, a) { g.put(2, a.offY - 3 - (f % 8 < 4 ? 0 : 1), ['..TTTTTT..', '.T......T.', '..TTTTTT..']); },
      propeller: function (g, f, a) { g.put(1, a.offY - 5, [f % 4 < 2 ? '..UUUUUUU...' : '....UUU.....', '.....K......', '.....K......', '....TTTT....', '..TTTTTTTT..', '.TTTTTTTTTT.']); },
      chef: function (g, f, a) { g.put(2, a.offY - 6, ['.WWWWWWWW.', 'WWWWWWWWWW', 'WWWWWWWWWW', 'WWWWWWWWWW', '.WWWWWWWW.', '.TTTTTTTT.']); },
      graduate: function (g, f, a) { g.put(-1, a.offY - 3, ['KKKKKKKKKKKKKKKK', '.....KKKKKK..Y..', '....KKKKKKKK.Y..']); },
      antlers: function (g, f, a) { g.put(0, a.offY - 5, ['O.O......O.O', 'OO.O....O.OO', '.OO......OO.', '.O........O.', '.O........O.']); }
    },
    eyes: {
      none: null,
      glasses: function (g, f, a) { g.put(a.eyeL - 1, a.eyeY - 1, ['.KKK..KKK.', 'K...KK...K', 'K...KK...K', 'K...KK...K', '.KKK..KKK.']); },
      round: function (g, f, a) { g.put(a.eyeL - 1, a.eyeY - 1, ['.TTT..TTT.', 'T...TT...T', 'T...T.T..T', 'T...TT...T', '.TTT..TTT.']); },
      shades: function (g, f, a) { g.put(a.eyeL - 2, a.eyeY - 1, ['KKKKKKKKKKKK', 'KKKKK..KKKKK', '.KKK....KKK.']); },
      monocle: function (g, f, a) { g.put(a.eyeR - 1, a.eyeY - 1, ['.TTT.', 'T...T', 'T...T', 'T...T', '.TTT.', '....T']); },
      goggles: function (g, f, a) { g.put(a.eyeL - 2, a.eyeY - 2, ['TTTTTTTTTTTT', 'TUUUUTTUUUUT', 'TU...TT...UT', 'TUUUUTTUUUUT', 'TTTTTTTTTTTT']); },
      eyepatch: function (g, f, a) { g.put(a.offX, a.eyeY - 1, lines('K', 1, a.w)); g.put(a.eyeR - 1, a.eyeY - 1, ['KKKKK', 'KKKKK', 'KKKKK', '.KKK.']); },
      threeD: function (g, f, a) { g.put(a.eyeL - 2, a.eyeY - 1, ['KKKKKKKKKKKK', 'KRRRRKKLLLLK', 'KRRRRKKLLLLK', '.KKKK..KKKK.']); },
      visor: function (g, f, a) { g.put(0, a.eyeY - 1, ['TTTTTTTTTTTTTT', 'TUUUUUUUUUUUUT', '.TTTTTTTTTTTT.']); },
      hearts: function (g, f, a) { g.put(a.eyeL - 1, a.eyeY - 1, ['PP.PP.PP.PP', 'PPPPP.PPPPP', '.PPP...PPP.', '..P.....P..']); },
      supermask: function (g, f, a) { g.put(0, a.eyeY - 1, ['.TTTTTTTTTTTT.', 'TTT..TTTT..TTT', '.TTT..TT..TTT.']); },
      nerd: function (g, f, a) { g.put(a.eyeL - 1, a.eyeY - 1, ['.KKK..KKK.', 'K...KK...K', 'K...KK...K', 'K...KK...K', '.KKK..KKK.']); g.put(a.eyeL + 3, a.eyeY, ['WW']); },
      scouter: function (g, f, a) { g.put(a.eyeR - 1, a.eyeY - 1, ['TTTTT', 'TLLLT', 'TTTTT']); g.put(a.eyeR + 4, a.eyeY - 1, ['T', 'T', 'T']); }
    },
    top: {
      none: null,
      tee: function (g, f, a) { band(g, a, 2); g.put(a.mouthX + 1, a.mouthY + 3, ['UUU']); },
      dress: function (g, f, a) { band(g, a, 2); var y = a.mouthY + 4; g.put(a.offX - 1, y, ['V']); g.put(a.offX + a.w, y, ['V']); g.put(a.offX - 2, y + 1, ['VV']); g.put(a.offX + a.w, y + 1, ['VV']); g.put(a.offX - 2, y + 2, ['VVV']); g.put(a.offX + a.w - 1, y + 2, ['VVV']); g.put(a.mouthX + 1, a.mouthY + 2, ['U.U']); },
      hoodie: function (g, f, a) { band(g, a, 2); g.put(0, a.offY - 1, ['...VVVVVVVV...', '..VV......VV..', '.V..........V.', 'V............V', 'V............V']); g.put(a.mouthX + 1, a.mouthY + 4, ['V.V']); },
      suit: function (g, f, a) { band(g, a, 2, 'K'); g.put(a.mouthX + 1, a.mouthY + 2, ['U.U', 'UVU', '.V.', '.V.']); },
      scarf: function (g, f, a) { g.put(0, a.mouthY + 2, ['.VVVVVVVVVVVV.', '..VVV.........', '..VV..........']); },
      overalls: function (g, f, a) { band(g, a, 3); g.put(a.eyeL, a.mouthY - 1, ['V', 'V', 'V', 'V', 'V']); g.put(a.eyeR + 2, a.mouthY - 1, ['V', 'V', 'V', 'V', 'V']); g.put(a.mouthX + 1, a.mouthY + 3, ['UUU']); },
      sweater: function (g, f, a) { band(g, a, 2); g.put(a.mouthX - 1, a.mouthY + 3, ['U.U.U.U']); g.put(a.offX, a.mouthY + 2, lines('U', 1, a.w)); },
      jacket: function (g, f, a) { band(g, a, 2); g.put(a.mouthX + 2, a.mouthY + 2, ['U', 'U', 'U', 'U', 'U']); g.put(a.mouthX + 1, a.mouthY + 1, ['V.V']); },
      kimono: function (g, f, a) { band(g, a, 1); g.recolor(a.mouthY + 4, 'U'); g.put(a.mouthX + 1, a.mouthY + 1, ['U.U', '.U.']); },
      labcoat: function (g, f, a) { band(g, a, 2, 'W'); g.put(a.mouthX + 2, a.mouthY + 2, ['K', 'K', 'K', 'K']); g.put(a.mouthX - 1, a.mouthY + 4, ['KK']); g.put(a.mouthX + 4, a.mouthY + 4, ['KK']); },
      vest: function (g, f, a) { band(g, a, 2); g.put(a.mouthX + 1, a.mouthY + 2, ['UUU', 'UUU', 'UUU', 'UUU']); g.put(a.mouthX + 2, a.mouthY + 2, ['K', '.', 'K']); },
      raincoat: function (g, f, a) { band(g, a, 2, 'Y'); g.put(0, a.offY - 1, ['...YYYYYYYY...', '..YY......YY..', '.Y..........Y.', 'Y............Y']); g.put(a.mouthX + 2, a.mouthY + 2, ['K', 'K', 'K', 'K']); },
      spacesuit: function (g, f, a) { band(g, a, 2, 'W'); g.recolor(a.mouthY + 2, 'U'); g.put(a.mouthX + 1, a.mouthY + 3, ['R.L', 'TTT']); },
      jersey: function (g, f, a) { band(g, a, 2); g.put(a.mouthX + 1, a.mouthY + 3, ['UUU', '..U', '.U.', '.U.']); g.recolor(a.mouthY + 2, 'U'); },
      tuxedo: function (g, f, a) { band(g, a, 2, 'K'); g.put(a.mouthX + 1, a.mouthY + 2, ['UUU', '.U.', '.R.', '.U.']); },
      apron: function (g, f, a) { band(g, a, 2); g.put(a.mouthX, a.mouthY + 3, ['WWWWW', 'WWWWW', 'WWWWW']); g.put(a.mouthX + 1, a.mouthY + 4, ['V.V']); },
      stripes: function (g, f, a) { band(g, a, 2); g.recolor(a.mouthY + 3, 'U'); g.recolor(a.mouthY + 5, 'U'); },
      dungarees: function (g, f, a) { band(g, a, 3); g.put(a.eyeL, a.mouthY - 1, ['V', 'V', 'V', 'V', 'V']); g.put(a.eyeR + 2, a.mouthY - 1, ['V', 'V', 'V', 'V', 'V']); g.put(a.mouthX + 1, a.mouthY + 3, ['UUU', 'U.U']); },
      armor: function (g, f, a) { band(g, a, 2, 'U'); g.recolor(a.mouthY + 4, 'T'); g.put(a.mouthX + 2, a.mouthY + 2, ['T', 'T']); },
      bikini: function (g, f, a) { g.recolor(a.mouthY + 2, 'V'); g.recolor(a.mouthY + 3, 'V'); g.put(a.mouthX + 2, a.mouthY + 1, ['U']); }
    },
    back: {
      none: null,
      backpack: function (g, f, a) { g.put(-3, a.mouthY, ['TTT', 'TTT', 'TUT', 'TTT', 'TTT']); g.put(14, a.mouthY, ['TTT', 'TTT', 'TUT', 'TTT', 'TTT']); },
      cape: function (g, f, a) { var sw = f % 6 < 3 ? 0 : 1; g.put(-1, a.mouthY - 1, lines('V', 7, 16)); g.put(-2 - sw, a.mouthY + 6, lines('V', 2, 18)); g.put(-3 - sw, a.mouthY + 8, lines('X', 1, 20)); },
      butterfly: function (g, f, a) { var dy = f % 6 < 3 ? 1 : 2; g.put(-5, dy, ['.PPP.', 'PPYPP', 'PPPPP', '.PYP.', '..PP.', '.PPP.', 'PPYPP', '.PPP.']); g.put(14, dy, ['.PPP.', 'PPYPP', 'PPPPP', '.PYP.', '.PP..', '.PPP.', 'PPYPP', '.PPP.']); },
      jetpack: function (g, f, a) { g.put(-3, a.mouthY, ['TTT', 'TUT', 'TTT', 'TTT', '.U.', f % 2 ? '.R.' : '.Y.', f % 2 ? '.Y.' : '...']); g.put(14, a.mouthY, ['TTT', 'TUT', 'TTT', 'TTT', '.U.', f % 2 ? '.Y.' : '.R.', f % 2 ? '...' : '.Y.']); },
      guitar: function (g, f, a) { g.put(9, 1, ['.......KK', '......KK.', '.....KK..', '....KK...', '...OO....', '..OOOO...', '.OOOOOO..', '.OOKOOO..', '..OOOO...']); },
      balloon: function (g, f, a) { var by = f % 8 < 4 ? 0 : -1; g.put(14, -6 + by, ['..RR..', '.RRRR.', '.RWRR.', '.RRRR.', '..RR..', '...K..']); g.put(17, 0 + by, ['K', 'K', 'K', 'K', 'K', 'K']); },
      wings: function (g, f, a) { var dy = f % 6 < 3 ? 3 : 2; g.put(-4, dy, ['...W', '..WW', '.WWW', 'WWWW', '.WWW', '..WW']); g.put(14, dy, ['W...', 'WW..', 'WWW.', 'WWWW', 'WWW.', 'WW..']); },
      batwings: function (g, f, a) { var dy = f % 6 < 3 ? 3 : 2; g.put(-4, dy, ['K...', 'KK..', 'KKK.', '.KKK', '.KK.', 'K...']); g.put(14, dy, ['...K', '..KK', '.KKK', 'KKK.', '.KK.', '...K']); },
      scarf2: function (g, f, a) { var sw = f % 4 < 2 ? 0 : 1; g.put(13 + sw, a.mouthY + 2, ['TTTTT', '.TTTT']); }
    },
    hand: {
      none: null,
      sword: function (g, f, a) { g.put(13, 1, ['....W', '...WW', '..WW.', '.WW..', 'KK...', '.K...']); },
      wand: function (g, f, a) { g.put(13, 2, [f % 4 < 2 ? '...YY' : '..Y.Y', '...YY', '..K..', '.K...', 'K....']); },
      umbrella: function (g, f, a) { g.put(10, -6, ['..TTTTTT..', '.TTUTTUTT.', 'TTTTTTTTTT', '....K.....', '....K.....', '....K.....', '....K.....', '....KK....']); },
      book: function (g, f, a) { g.put(13, a.mouthY, ['WW.WW', 'WWWWW', 'WWWWW', 'TTTTT']); },
      phone: function (g, f, a) { g.put(14, a.mouthY - 1, ['TTT', 'TLT', 'TLT', 'TLT', 'TTT']); },
      lantern: function (g, f, a) { g.put(14, a.mouthY - 2, ['.K.', 'KKK', 'KYK', 'KYK', 'KKK']); },
      flag: function (g, f, a) { var w2 = f % 4 < 2 ? 'KVVVVVV' : 'KVVVVV.'; g.put(13, -4, ['K......', w2, 'KVVVVVV', w2, 'K......', 'K......', 'K......', 'K......']); },
      rod: function (g, f, a) { g.put(13, -3, ['.......K', '......K.', '.....K..', '....K...', '...K....', '..K.....', '.K......']); g.put(20, -2, ['K', 'K', 'K', 'K', 'K', 'L']); },
      mic: function (g, f, a) { g.put(14, a.mouthY - 2, ['.TT', 'TTT', '.TT', '.K.', '.K.', '.K.']); },
      balloon: function (g, f, a) { g.put(14, -6, ['..RR..', '.RRRR.', '.RWRR.', '.RRRR.', '..RR..', '...K..', '...K..', '...K..', '...K..']); },
      magnifier: function (g, f, a) { g.put(13, 2, ['.KKK.', 'K...K', 'K...K', 'K...K', '.KKK.', '....K', '.....']); g.put(18, 7, ['K', '.']); },
      coffee: function (g, f, a) { g.put(14, a.mouthY - 2, ['.W.W', 'WWWW', 'OOOW', 'WWWW', '.WW.']); },
      hammer: function (g, f, a) { g.put(13, 0, ['...KKK', '...KKK', '...KKK', '....O.', '....O.', '....O.', '....O.']); },
      shield: function (g, f, a) { g.put(-3, 7, ['.TT.', 'TUUT', 'TUUT', '.TT.']); }
    },
    face: {
      none: null,
      blush: function (g, f, a) { g.put(a.eyeL - 2, a.eyeY + 3, ['PP']); g.put(a.eyeR + 3, a.eyeY + 3, ['PP']); },
      mustache: function (g, f, a) { g.put(a.mouthX - 1, a.mouthY - 1, ['TT..TT', 'TTTTTT']); },
      beard: function (g, f, a) { g.put(a.mouthX - 2, a.mouthY + 2, ['TTTTTTTTT', '.TTTTTTT.', '..TTTTT..']); },
      freckles: function (g, f, a) { g.put(a.eyeL - 2, a.eyeY + 3, ['O.O']); g.put(a.eyeR + 2, a.eyeY + 3, ['O.O']); },
      bandage: function (g, f, a) { g.put(a.eyeR + 2, a.eyeY + 3, ['WWW', 'WKW', 'WWW']); },
      medmask: function (g, f, a) { g.put(a.mouthX - 2, a.mouthY - 1, ['WWWWWWWWW', 'WWWWWWWWW', '.WWWWWWW.']); },
      scar: function (g, f, a) { g.put(a.eyeR + 2, a.eyeY - 1, ['K.', 'K.', '.K']); },
      star: function (g, f, a) { g.put(a.eyeL - 3, a.eyeY + 2, ['.Y.', 'YYY', '.Y.']); },
      monobrow: function (g, f, a) { g.put(a.eyeL, a.eyeY - 2, ['KKKKKKKK']); },
      tears: function (g, f, a) { g.put(a.eyeL, a.eyeY + 3, ['L', 'L']); g.put(a.eyeR + 2, a.eyeY + 3, ['L', 'L']); },
      lipstick: function (g, f, a) { g.put(a.mouthX + 1, a.mouthY, ['RRR']); }
    },
    feet: {
      none: null,
      sneakers: function (g, f, a) { var y0 = a.feetY; g.recolor(y0, 'T', 'SB'); g.recolor(y0 + 1, 'W', 'SB'); },
      boots: function (g, f, a) { var y0 = a.feetY; g.recolor(y0 - 1, 'K', 'SB'); g.recolor(y0, 'K', 'SB'); g.recolor(y0 + 1, 'K', 'SB'); },
      socks: function (g, f, a) { var y0 = a.feetY; g.recolor(y0, 'W', 'SB'); g.recolor(y0 + 1, 'T', 'SB'); },
      sandals: function (g, f, a) { var y0 = a.feetY; g.recolor(y0 + 1, 'O', 'SB'); },
      flippers: function (g, f, a) { var y0 = a.feetY; g.recolor(y0, 'G', 'SB'); g.recolor(y0 + 1, 'G', 'SB'); g.put(a.offX + 1, y0 + 1, ['GG']); g.put(a.offX + a.w - 3, y0 + 1, ['GG']); },
      skates: function (g, f, a) { var y0 = a.feetY; g.recolor(y0, 'W', 'SB'); g.recolor(y0 + 1, 'K', 'SB'); g.put(a.offX + 2, y0 + 2, ['R.R']); g.put(a.offX + a.w - 5, y0 + 2, ['R.R']); }
    }
  };
  var OUTFIT_PRESETS = {
    none: { hat: 'none', eyes: 'none', top: 'none', back: 'none', hand: 'none', face: 'none', feet: 'none' },
    detective: { hat: 'cap', eyes: 'monocle', top: 'jacket', hand: 'magnifier', face: 'mustache', feet: 'boots', hatColor: '#6b4a3a', topColor: '#8b6a4a', trimColor: '#f1e9e4' },
    pirate: { hat: 'pirate', eyes: 'eyepatch', top: 'stripes', hand: 'sword', face: 'scar', feet: 'boots', hatColor: '#1b1a2e', topColor: '#e63946', trimColor: '#ffffff' },
    wizard: { hat: 'wizard', eyes: 'round', top: 'kimono', hand: 'wand', face: 'beard', hatColor: '#4361ee', topColor: '#4361ee', trimColor: '#ffd166' },
    astronaut: { hat: 'helmet', eyes: 'visor', top: 'spacesuit', back: 'jetpack', feet: 'boots', hatColor: '#f1e9e4', topColor: '#ffffff', trimColor: '#9aa3b2' },
    chef: { hat: 'chef', top: 'apron', hand: 'coffee', face: 'mustache', hatColor: '#ffffff', topColor: '#e63946', trimColor: '#ffffff' },
    punk: { hat: 'bandana', eyes: 'shades', top: 'vest', back: 'guitar', face: 'star', feet: 'sneakers', hatColor: '#e63946', topColor: '#1b1a2e', trimColor: '#ffffff' },
    royal: { hat: 'crown', eyes: 'monocle', top: 'tuxedo', back: 'cape', hatColor: '#ffd166', topColor: '#7b2cbf', trimColor: '#ffffff' },
    beach: { hat: 'straw', eyes: 'shades', top: 'bikini', hand: 'umbrella', feet: 'flippers', hatColor: '#4a9ee8', topColor: '#ff6f91', trimColor: '#ffffff' },
    knight: { hat: 'helmet', top: 'armor', hand: 'sword', back: 'cape', feet: 'boots', hatColor: '#9aa3b2', topColor: '#d62828', trimColor: '#c0c0c8' },
    scientist: { eyes: 'nerd', top: 'labcoat', hand: 'book', face: 'freckles', hatColor: '#4361ee', topColor: '#ffffff', trimColor: '#ffffff' },
    superhero: { eyes: 'supermask', top: 'jersey', back: 'cape', feet: 'boots', hatColor: '#e63946', topColor: '#4361ee', trimColor: '#ffd166' },
    fairy: { hat: 'flowers', top: 'dress', back: 'butterfly', hand: 'wand', face: 'blush', hatColor: '#ff6f91', topColor: '#b388ff', trimColor: '#ffffff' },
    gamer: { hat: 'headphones', eyes: 'threeD', top: 'hoodie', hand: 'phone', feet: 'socks', hatColor: '#1b1a2e', topColor: '#2ec4b6', trimColor: '#ffffff' },
    winter: { hat: 'ushanka', top: 'sweater', back: 'scarf2', face: 'blush', feet: 'boots', hatColor: '#8b5a2b', topColor: '#e63946', trimColor: '#ffffff' },
    graduate: { hat: 'graduate', eyes: 'glasses', top: 'suit', hand: 'book', hatColor: '#1b1a2e', topColor: '#1b1a2e', trimColor: '#ffffff' },
    rockstar: { hat: 'bandana', eyes: 'hearts', top: 'jacket', hand: 'mic', back: 'guitar', feet: 'sneakers', hatColor: '#7b2cbf', topColor: '#1b1a2e', trimColor: '#ff3cac' },
    fisher: { hat: 'bucket', top: 'raincoat', hand: 'rod', feet: 'boots', hatColor: '#2f5d4f', topColor: '#ffd166', trimColor: '#ffffff' },
    reindeer: { hat: 'antlers', top: 'sweater', face: 'blush', hatColor: '#8b5a2b', topColor: '#e63946', trimColor: '#4fc35a' },
    skater: { hat: 'cap', eyes: 'shades', top: 'tee', feet: 'skates', hand: 'phone', hatColor: '#ff6f91', topColor: '#ffd166', trimColor: '#1b1a2e' }
  };
  function band(g, a, from, tok) { g.band(a.mouthY + from, tok || 'V'); }

  // badge: a red counter bubble at the top right (tasks, notifications)
  var DIGITS = { 0: ['WWW', 'W.W', 'W.W', 'W.W', 'WWW'], 1: ['.W.', 'WW.', '.W.', '.W.', 'WWW'], 2: ['WWW', '..W', 'WWW', 'W..', 'WWW'], 3: ['WWW', '..W', 'WWW', '..W', 'WWW'], 4: ['W.W', 'W.W', 'WWW', '..W', '..W'], 5: ['WWW', 'W..', 'WWW', '..W', 'WWW'], 6: ['WWW', 'W..', 'WWW', 'W.W', 'WWW'], 7: ['WWW', '..W', '..W', '..W', '..W'], 8: ['WWW', 'W.W', 'WWW', 'W.W', 'WWW'], 9: ['WWW', 'W.W', 'WWW', '..W', 'WWW'] };
  function drawBadge(g, n, f) {
    var str = String(Math.min(99, Math.max(0, n | 0))), w = str.length * 4 + 1, x0 = 19 - w, y0 = -7;
    if (n > 3 && f % 6 >= 5) return; // blink when overloaded
    for (var r = 0; r < 7; r++) { var row = ''; for (var c = 0; c < w; c++) row += ((r === 0 || r === 6) && (c === 0 || c === w - 1)) ? '.' : 'R'; g.put(x0, y0 + r, [row]); }
    for (var i = 0; i < str.length; i++) g.put(x0 + 1 + i * 4, y0 + 1, DIGITS[str[i]]);
    g.put(x0 + 1, y0 + 7, ['R']);
  }

  // ---- grid builder --------------------------------------------------------------------------------
  function makeGrid() { var g = []; for (var y = 0; y < H; y++) { var r = []; for (var x = 0; x < W; x++) r.push(null); g.push(r); } return g; }
  function painter(grid, ox, oy) {
    return { put: function (dx, dy, rows) {
      for (var r = 0; r < rows.length; r++) for (var c = 0; c < rows[r].length; c++) {
        var t = rows[r][c]; if (t === '.') continue;
        var x = BX + ox + dx + c, y = BY + oy + dy + r;
        if (x >= 0 && y >= 0 && x < W && y < H) grid[y][x] = t;
      }
    }, recolor: function (dy, tok, from) {
      var y = BY + oy + dy; if (y < 0 || y >= H) return;
      for (var x = 0; x < W; x++) { var t = grid[y][x]; if (t && (from ? from.indexOf(t) >= 0 : (t === 'V' || t === 'X' || t === 'B' || t === 'S' || t === 'H'))) grid[y][x] = tok; }
    }, band: function (fromDy, tok) {
      for (var y = BY + oy + fromDy; y < H; y++) { if (y < 0) continue; for (var x = 0; x < W; x++) { var t = grid[y][x]; if (t === 'B' || t === 'H') grid[y][x] = tok; else if (t === 'S') grid[y][x] = tok === 'K' ? 'K' : 'X'; } }
    } };
  }
  function scaledShape(shape, s) {
    if (s === 1) return shape;
    var w = Math.round(14 * s), h = Math.round(shape.length * s), out = [];
    for (var y = 0; y < h; y++) { var row = ''; for (var x = 0; x < w; x++) row += shape[Math.floor(y * shape.length / h)][Math.floor(x * 14 / w)]; out.push(row); }
    return out;
  }

  function shiftEye(rows, lx, ly) {
    // move a small pupil (one or two pixels) toward (lx, ly); bigger patterns are left alone
    var pts = []; for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) if (rows[i][j] === 'E') pts.push([i, j]);
    if (!pts.length || pts.length > 2) return rows;
    var okx = pts.every(function (p) { return p[1] + lx >= 0 && p[1] + lx < 3; }), oky = pts.every(function (p) { return p[0] + ly >= 0 && p[0] + ly < 3; });
    if (!okx) lx = 0; if (!oky) ly = 0; if (!lx && !ly) return rows;
    var out = rows.map(function (r) { return r.split(''); });
    pts.forEach(function (p) { out[p[0]][p[1]] = '.'; }); pts.forEach(function (p) { out[p[0] + ly][p[1] + lx] = 'E'; });
    return out.map(function (r) { return r.join(''); });
  }

  var NUB_SHAPES = { round: 1, square: 1, lemon: 1, potato: 1, toast: 1, rock: 1, heart: 1, mug: 1 };
  function buildTokens(ch, mood, f, stage, activity, look, walk, outfit, badge, food, outline) {
    f = ((f % FRAMES) + FRAMES) % FRAMES;
    var M = MOOD[mood] || MOOD.quiet, ST = STAGE[stage] ? stage : 'adult', ACT = ACTIVITY[activity] || ACTIVITY.none;
    var s = STAGE_SCALE[ST], shape = scaledShape(SHAPES[ch.shape], s);
    var w = shape[0].length, h = shape.length, full = SHAPES[ch.shape].length;
    var an = ANCHORS[w], offX = (14 - w) >> 1, offY = full - h;
    var a = { w: w, h: h, offX: offX, offY: offY, eyeL: offX + an.eyeL, eyeR: offX + an.eyeR, eyeY: offY + an.eyeY, mouthX: offX + an.mouthX, mouthY: offY + an.mouthY, stage: ST };
    var mv = (ACT.anim || M.anim)(f), so = STAGE_OFFSET[ST] || { ox: 0, oy: 0 };
    var grid = makeGrid(), g = painter(grid, mv.ox + so.ox, mv.oy + so.oy + (walk ? (f % 2 ? -1 : 0) : 0));
    var grown = s === 1;
    var layers = { back: [], mid: [], face: [], front: [] };
    ch.acc.forEach(function (n) { var x = ACC[n]; if (!x) return; if (!grown && x.layer !== 'face') return; layers[x.layer].push(x); });

    if (outfit && OUTFIT.back[outfit.back]) OUTFIT.back[outfit.back](g, f, a);
    layers.back.forEach(function (x) { x.draw(g, f, a); });
    var feet = ch.shape === 'critter' && s === 1;
    var isBody = function (x, y) { if (feet && walk && y === h - 1 && ((f % 4 < 2 && x < 7) || (f % 4 >= 2 && x >= 7))) return false; return y >= 0 && y < h && x >= 0 && x < w && shape[y][x] === '#'; };
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (!isBody(x, y)) continue;
      var t = 'B';
      if (!isBody(x, y + 1) || !isBody(x + 1, y)) t = 'S';
      else if (y < 4 && (!isBody(x - 1, y) || !isBody(x, y - 1))) t = 'H';
      g.put(offX + x, offY + y, [t]);
    }
    // little feet and arm nubs for the blob-bodied cast
    if (NUB_SHAPES[ch.shape] && s === 1) {
      var fy = offY + h, lf = walk && f % 4 < 2, rf = walk && f % 4 >= 2;
      if (!lf) g.put(offX + 3, fy, ['SS']); if (!rf) g.put(offX + 9, fy, ['SS']);
      g.put(offX - 1, offY + Math.min(h - 5, 7), ['S', 'S']); g.put(offX + w, offY + Math.min(h - 5, 7), ['S', 'S']);
    }
    layers.mid.forEach(function (x) { x.draw(g, f, a); });

    var eyes = (ACT.eyes || M.eyes)(f);
    if (look && mood !== 'asleep') eyes = [shiftEye(eyes[0], look.x, look.y), shiftEye(eyes[1], look.x, look.y)];
    g.put(a.eyeL, a.eyeY, eyes[0]); g.put(a.eyeR, a.eyeY, eyes[1]);
    g.put(a.mouthX, a.mouthY, (ACT.mouth || M.mouth)(f));
    layers.face.forEach(function (x) { x.draw(g, f, a); });
    layers.front.forEach(function (x) { x.draw(g, f, a); });
    STAGE[ST](g, f, a);
    if (outfit) { a.feetY = ch.shape === 'critter' ? offY + h - 2 : offY + h; var top = OUTFIT.top[outfit.top], hat = OUTFIT.hat[outfit.hat], eyew = OUTFIT.eyes[outfit.eyes], feetO = OUTFIT.feet[outfit.feet], faceO = OUTFIT.face[outfit.face], handO = OUTFIT.hand[outfit.hand];
      if (top) top(g, f, a); if (feetO && s === 1) feetO(g, f, a); if (faceO) faceO(g, f, a); if (eyew) eyew(g, f, a); if (hat) hat(g, f, a); if (handO) handO(g, f, a); }
    if (M.overlay) M.overlay(g, f, a);
    if (ACT.overlay) ACT.overlay(g, f, a, food);
    if (badge > 0) drawBadge(g, badge, f);
    if (outline) {
      var ox2 = BX + mv.ox + so.ox, oy2 = BY + mv.oy + so.oy, marks = [];
      for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
        if (grid[yy][xx]) continue;
        if ((yy > 0 && grid[yy - 1][xx]) || (yy < H - 1 && grid[yy + 1][xx]) || (xx > 0 && grid[yy][xx - 1]) || (xx < W - 1 && grid[yy][xx + 1])) marks.push([yy, xx]);
      }
      marks.forEach(function (m) { grid[m[0]][m[1]] = 'O'; });
    }
    return grid;
  }

  function mix(hex, hex2, t) {
    var a = parseInt(hex.slice(1), 16), b = parseInt(hex2.slice(1), 16), o = '#';
    for (var i = 16; i >= 0; i -= 8) { var v = Math.round(((a >> i) & 255) * (1 - t) + ((b >> i) & 255) * t); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o;
  }
  var greyCache = {};
  function palette(ch, stage) {
    if (stage !== 'elder') return ch;
    if (!greyCache[ch.id]) greyCache[ch.id] = { B: mix(ch.B, '#9a9aa2', 0.45), S: mix(ch.S, '#7a7a84', 0.45), H: mix(ch.H, '#c4c4cc', 0.45), E: ch.E, A: ch.A, C: ch.C, M: ch.M };
    return greyCache[ch.id];
  }
  function resolve(pal, t) { if (t.charAt(0) === '#') return t; if (t === 'M') return pal.M || pal.E; if (t === 'Z') return pal.A; if (t === 'O') return pal.O || (pal.O = mix(pal.B, '#14121f', 0.72)); return pal[t] || GLOBAL[t] || null; }

  // Public: 24×24 array of colour strings (or null).
  function grid(characterId, mood, f, opts) {
    opts = opts || {};
    var ch = typeof characterId === 'string' ? BY_ID[characterId] : characterId;
    if (!ch) throw new Error('PixelPals: unknown character "' + characterId + '"');
    var stage = STAGES.indexOf(opts.stage) >= 0 ? opts.stage : 'adult';
    var pal = palette(ch, stage);
    var look = opts.look && (opts.look.x || opts.look.y) ? { x: Math.max(-1, Math.min(1, opts.look.x | 0)), y: Math.max(-1, Math.min(1, opts.look.y | 0)) } : null;
    var o = opts.outfit || null, oc = o ? { T: o.hatColor || '#4361ee', V: o.topColor || '#e63946', X: mix(o.topColor || '#e63946', '#000000', 0.3), U: o.trimColor || '#ffffff' } : null;
    return buildTokens(ch, MOODS.indexOf(mood) >= 0 ? mood : 'quiet', f || 0, stage, opts.activity || 'none', look, !!opts.walk, o, opts.badge | 0, opts.food, opts.outline !== false)
      .map(function (row) { return row.map(function (t) { return t ? ((oc && oc[t]) || resolve(pal, t)) : null; }); });
  }

  function foodGrid(id, stage, f, outline) {
    var rows = foodTokens(id, stage | 0, f), Wf = 14, Hf = 14, g = [];
    for (var y = 0; y < Hf; y++) { var r = []; for (var x = 0; x < Wf; x++) r.push((y > 0 && y < 13 && x > 0 && x < 13) ? rows[y - 1][x - 1] : null); g.push(r); }
    if (outline !== false) { var marks = []; for (var yy = 0; yy < Hf; yy++) for (var xx = 0; xx < Wf; xx++) { if (g[yy][xx]) continue; if ((yy > 0 && g[yy - 1][xx]) || (yy < Hf - 1 && g[yy + 1][xx]) || (xx > 0 && g[yy][xx - 1]) || (xx < Wf - 1 && g[yy][xx + 1])) marks.push([yy, xx]); } marks.forEach(function (m) { g[m[0]][m[1]] = '#2a2440'; }); }
    return g;
  }

  // ---- canvas rendering ----------------------------------------------------------------------------------
  function paint(ctx, g, scale, offX, offY) {
    offX = offX || 0; offY = offY || 0;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) { var c = g[y][x]; if (!c) continue; ctx.fillStyle = c; ctx.fillRect(offX + x * scale, offY + y * scale, scale, scale); }
  }
  function makeCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // one shared clock for every mounted pal
  var live = [], clock = null, tickN = 0;
  function startClock() { if (!clock) clock = setInterval(function () { tickN++; for (var i = 0; i < live.length; i++) live[i]._tick(); }, FRAME_MS); }
  var io = (typeof IntersectionObserver !== 'undefined') ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { var p = e.target._pal; if (p) p._visible = e.isIntersecting; });
  }) : null;

  function parseOutfit(str) { if (!str) return null; var o = {}; str.split(/[;,]\s*/).forEach(function (kv) { var p = kv.split(/[:=]/); if (p.length === 2) o[p[0].trim()] = p[1].trim(); }); return o; }
  function animOf(mood, act, f) { var A = ACTIVITY[act]; var M = MOOD[mood] || MOOD.quiet; return ((A && A.anim) || M.anim)(f).oy; }

  function mount(el, opts) {
    opts = opts || {};
    var at = function (k) { return el.getAttribute('data-' + k); };
    var state = { character: opts.character || at('pixelpal') || 'mochi', mood: opts.mood || at('mood') || 'quiet',
      stage: opts.stage || at('stage') || 'adult', activity: opts.activity || at('activity') || 'none',
      scale: Number(opts.scale || at('scale') || 4), frame: 0, playing: !opts.static, look: null, walk: false, flip: false, outfit: opts.outfit || parseOutfit(at('outfit')), badge: Number(opts.badge || at('badge') || 0), food: opts.food || at('food') || 'apple', outline: opts.outline !== false && at('outline') !== 'off' };
    var canvas = makeCanvas(W * state.scale, H * state.scale);
    canvas.style.imageRendering = 'pixelated'; canvas.style.display = 'block'; canvas.setAttribute('role', 'img');
    el.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      if (state.flip) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      // squash & stretch: stretch while rising, squash on landing and on every walking step
      var oy = animOf(state.mood, state.activity, state.frame), prev = animOf(state.mood, state.activity, (state.frame + FRAMES - 1) % FRAMES), sx = 1, sy = 1;
      if (oy < prev) { sy = 1 + 0.04 * (prev - oy); sx = 1 - 0.03 * (prev - oy); }
      else if (oy === 0 && prev < 0) { sy = 0.9; sx = 1.1; }
      if (state.walk) { if (state.frame % 2) { sy *= 0.94; sx *= 1.05; } else { sy *= 1.03; sx *= 0.98; } }
      if (sx !== 1 || sy !== 1) { ctx.translate(canvas.width / 2, canvas.height); ctx.scale(sx, sy); ctx.translate(-canvas.width / 2, -canvas.height); }
      paint(ctx, grid(state.character, state.mood, state.frame, state), state.scale);
      ctx.restore();
      var ch = BY_ID[state.character];
      canvas.setAttribute('aria-label', (ch ? ch.name : state.character) + ', ' + state.stage + ', ' + state.mood + (state.activity !== 'none' ? ', ' + state.activity : ''));
    }
    var pal = {
      el: el, canvas: canvas, _visible: true,
      _tick: function () { if (!state.playing || !pal._visible) return; state.frame = (state.frame + 1) % FRAMES; draw(); },
      get character() { return state.character; }, get mood() { return state.mood; }, get stage() { return state.stage; }, get activity() { return state.activity; },
      setMood: function (m) { state.mood = m; state.frame = 0; draw(); return pal; },
      setCharacter: function (id) { state.character = id; state.frame = 0; draw(); return pal; },
      setStage: function (s) { state.stage = s; state.frame = 0; draw(); return pal; },
      setActivity: function (x) { state.activity = x || 'none'; state.frame = 0; draw(); return pal; },
      setScale: function (s) { state.scale = s; canvas.width = W * s; canvas.height = H * s; draw(); return pal; },
      setLook: function (x, y) { var nl = (x === null || x === undefined) ? null : { x: x, y: y }; var same = (!nl && !state.look) || (nl && state.look && nl.x === state.look.x && nl.y === state.look.y); state.look = nl; if (!same) draw(); return pal; },
      setWalk: function (w) { state.walk = !!w; return pal; },
      setOutfit: function (o) { state.outfit = o ? { hat: o.hat || 'none', eyes: o.eyes || 'none', top: o.top || 'none', back: o.back || 'none', hand: o.hand || 'none', face: o.face || 'none', feet: o.feet || 'none', hatColor: o.hatColor, topColor: o.topColor, trimColor: o.trimColor } : null; draw(); return pal; },
      setBadge: function (n) { state.badge = n | 0; draw(); return pal; },
      setFood: function (id) { state.food = id || 'apple'; draw(); return pal; },
      get food() { return state.food; },
      get outfit() { return state.outfit; }, get badge() { return state.badge; },
      setFlip: function (fl) { if (state.flip !== !!fl) { state.flip = !!fl; draw(); } return pal; },
      get look() { return state.look; }, get flip() { return state.flip; }, get walk() { return state.walk; },
      redraw: draw,
      play: function () { state.playing = true; return pal; }, pause: function () { state.playing = false; return pal; },
      destroy: function () { var i = live.indexOf(pal); if (i >= 0) live.splice(i, 1); if (io) io.unobserve(canvas); if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }
    };
    canvas._pal = pal;
    draw();
    live.push(pal);
    if (io) io.observe(canvas);
    startClock();
    return pal;
  }

  function foodCanvas(id, scale, stage, f) {
    scale = scale || 4; var g = foodGrid(id, stage, f), c = makeCanvas(14 * scale, 14 * scale), ctx = c.getContext('2d');
    for (var y = 0; y < 14; y++) for (var x = 0; x < 14; x++) { var col = g[y][x]; if (!col) continue; ctx.fillStyle = col; ctx.fillRect(x * scale, y * scale, scale, scale); }
    c.style.imageRendering = 'pixelated'; return c;
  }
  function toDataURL(id, mood, frame, scale, opts) {
    scale = scale || 4; var c = makeCanvas(W * scale, H * scale);
    paint(c.getContext('2d'), grid(id, mood, frame || 0, opts), scale); return c.toDataURL('image/png');
  }
  function spriteSheet(id, mood, scale, opts) {
    scale = scale || 4; var c = makeCanvas(W * scale * FRAMES, H * scale), ctx = c.getContext('2d');
    for (var f = 0; f < FRAMES; f++) paint(ctx, grid(id, mood, f, opts), scale, f * W * scale, 0);
    return c;
  }
  function autoMount(rootEl) {
    var nodes = (rootEl || document).querySelectorAll('[data-pixelpal]:not([data-pixelpal-ready])'), out = [];
    for (var i = 0; i < nodes.length; i++) { nodes[i].setAttribute('data-pixelpal-ready', '1'); out.push(mount(nodes[i])); }
    return out;
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { autoMount(); });
    else setTimeout(function () { autoMount(); }, 0);
  }

  // ---- interaction ------------------------------------------------------------------------------------
  // Click reaction chosen from the pal's needs: {food, energy, bond, skill, fun} 0..100.
  function reactionFor(n) {
    if (!n) return 'happy';
    if (n.food < 35) return 'angry';          // hungry
    if (n.energy < 35) return 'pokerface';    // tired
    if (n.bond < 30) return 'doubtful';       // doesn't know you yet
    if (n.skill < 20) return 'wtf';           // hasn't learned anything
    var great = ['food', 'energy', 'bond', 'fun'].every(function (k) { return n[k] > 70; });
    return great ? 'ecstatic' : 'happy';
  }
  var SPEED = { baby: 55, toddler: 85, teen: 175, adult: 140, corporate: 120, settled: 100, elder: 45 };
  function ladder(fr) { return fr < 15 ? 'happy' : fr < 40 ? 'quiet' : fr < 60 ? 'doubtful' : fr < 80 ? 'angry' : 'sad'; }
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  // Shared pointer handling for one pal: single click → needs reaction, double click → tickle,
  // 4+ rapid clicks → annoyed, press-and-hold → petting, hover → eyes follow the cursor, drag (optional).
  function bindPointer(pal, o) {
    var c = pal.canvas, clicks = 0, clickTimer = null, holdTimer = null, down = null, dragging = false, petting = false;
    c.style.cursor = 'pointer'; c.style.touchAction = 'none';
    function pt(e) { var r = c.getBoundingClientRect(); return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2, r: r }; }
    function lookAt(e) { if (o.noLook) return; var p = pt(e); pal.setLook(Math.abs(p.x) > p.r.width * 0.12 ? (p.x > 0 ? 1 : -1) : 0, Math.abs(p.y) > p.r.height * 0.12 ? (p.y > 0 ? 1 : -1) : 0); }
    c.addEventListener('pointerenter', lookAt);
    c.addEventListener('pointermove', function (e) { lookAt(e); if (down && !dragging && o.onDragStart && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { dragging = true; clearTimeout(holdTimer); o.onDragStart(e); } if (dragging && o.onDrag) o.onDrag(e); });
    c.addEventListener('pointerleave', function () { if (!o.noLook) pal.setLook(null); });
    c.addEventListener('pointerdown', function (e) { e.preventDefault(); c.setPointerCapture && c.setPointerCapture(e.pointerId); down = { x: e.clientX, y: e.clientY };
      holdTimer = setTimeout(function () { petting = true; o.on('pet'); }, 450); });
    c.addEventListener('pointerup', function (e) {
      clearTimeout(holdTimer);
      if (dragging) { dragging = false; down = null; o.onDrop && o.onDrop(e); return; }
      if (petting) { petting = false; down = null; o.on('petEnd'); return; }
      down = null; clicks++;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(function () { var n = clicks; clicks = 0; o.on(n >= 4 ? 'annoyed' : n >= 2 ? 'tickle' : 'click'); }, 260);
    });
    c.addEventListener('pointercancel', function () { clearTimeout(holdTimer); down = null; dragging = false; petting = false; });
  }

  // interact(pal, {needs, onEvent, revertMs}) — reactions for a pal that stays put.
  function interact(pal, opts) {
    opts = opts || {};
    var base = { mood: pal.mood, activity: pal.activity }, until = 0, timer = null, emit = opts.onEvent || function () {};
    function restore() { pal.setMood(base.mood).setActivity(base.activity); until = 0; }
    function react(mood, act, ms) { clearTimeout(timer); pal.setMood(mood).setActivity(act || 'none'); until = now() + (ms || opts.revertMs || 1800); timer = setTimeout(restore, ms || opts.revertMs || 1800); }
    bindPointer(pal, { on: function (ev) {
      var n = opts.needs ? opts.needs() : null;
      if (ev === 'click') react(reactionFor(n));
      else if (ev === 'tickle') react('ecstatic', 'none', 2200);
      else if (ev === 'annoyed') react('angry', 'none', 2600);
      else if (ev === 'pet') react('happy', 'none', 60000);
      else if (ev === 'petEnd') react('amazed', 'none', 1500);
      emit(ev, { needs: n, mood: pal.mood });
    } });
    return { pal: pal, react: react,
      setBase: function (mood, act) { base = { mood: mood, activity: act || 'none' }; if (now() >= until) restore(); },
      get reacting() { return now() < until; } };
  }

  // playground(container, opts) — the pal roams inside a box, chases the cursor, fetches balls, can be carried,
  // thrown, spun, fed from a snack tray, steered with the keyboard, dozes off when ignored, and meets friends.
  // opts: character, mood, stage, activity, scale, needs(), onEvent(type, data), fullPage, noticeRadius,
  //       snacks (default true in a box), keyboard (default true in a box), wander (default true), idleSleepMs.
  function playground(container, opts) {
    opts = opts || {};
    var full = !!opts.fullPage, scale = opts.scale || 5, size = W * scale, sizeH = H * scale;
    if (full) { container = document.createElement('div'); container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:' + (opts.zIndex || 9999) + ';overflow:hidden'; document.body.appendChild(container); }
    else { if (getComputedStyle(container).position === 'static') container.style.position = 'relative'; container.style.overflow = 'hidden'; container.style.touchAction = 'none'; if (!container.hasAttribute('tabindex')) container.tabIndex = 0; container.style.outline = 'none'; }
    var holder = document.createElement('div'); holder.style.cssText = 'position:absolute;left:0;top:0;will-change:transform;pointer-events:auto'; container.appendChild(holder);
    var pal = mount(holder, { character: opts.character, mood: opts.mood || 'quiet', stage: opts.stage, activity: opts.activity, scale: scale, outfit: opts.outfit, badge: opts.badge }); pal._owned = true;
    var floor = full || !!opts.floor, floorPad = opts.floorOffset || 10, tasks = 0, overloadAt = 0, nagAt = 0;
    function floorY() { return box().h - sizeH - floorPad; }
    function overloaded() { return tasks > 3; }
    var emit = opts.onEvent || function () {};
    var box = function () { return full ? { w: window.innerWidth, h: window.innerHeight } : { w: container.clientWidth, h: container.clientHeight }; };
    var b = box(), pos = { x: Math.max(0, b.w / 2 - size / 2), y: Math.max(0, ((full || opts.floor) ? b.h - sizeH - (opts.floorOffset || 10) : b.h / 2 - sizeH / 2)) };
    var cursor = null, ball = null, ballEl = null, carried = false, frustration = 0, cried = false, raged = false, chasing = false, wander = null, wanderAt = now() + 2500;
    var base = { mood: opts.mood || 'quiet', activity: opts.activity || 'none' }, reactUntil = 0, reactTimer = null, playUntil = 0, last = now(), alive = true;
    var noticeR = opts.noticeRadius || (full ? 240 : Infinity), catchR = size * 0.55, farR = Math.max(110, size * 1.6);
    var vel = null, trail = [], keys = {}, jump = null, hop = 0, lastTouch = now(), dozing = false, idleMs = opts.idleSleepMs || 25000, friends = [];

    function place() { holder.style.transform = 'translate(' + Math.round(pos.x) + 'px,' + Math.round(pos.y - (jump ? jump.h : 0)) + 'px)'; }
    function center() { return { x: pos.x + size / 2, y: pos.y + sizeH / 2 }; }
    function clampPos(p) { var bb = box(); p.x = Math.max(0, Math.min(bb.w - size, p.x)); p.y = Math.max(0, Math.min(bb.h - sizeH, p.y)); }
    function rel(e) { if (full) return { x: e.clientX, y: e.clientY }; var r = container.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function touch() { lastTouch = now(); if (dozing) { dozing = false; react('alert', 'none', 900); emit('wake'); } }
    function react(mood, act, ms) { clearTimeout(reactTimer); pal.setMood(mood).setActivity(act || 'none'); reactUntil = now() + ms; reactTimer = setTimeout(function () { reactUntil = 0; }, ms); }
    function setMood(m, act) { if (now() < reactUntil) return; if (pal.mood !== m) pal.setMood(m); var a = act || 'none'; if (pal.activity !== a) pal.setActivity(a); }
    function needs() { return opts.needs ? opts.needs() : null; }

    var moveTarget = full ? window : container;
    moveTarget.addEventListener('pointermove', function (e) { cursor = rel(e); if (!full) touch(); });
    (full ? document.documentElement : container).addEventListener('pointerleave', function () { cursor = null; });

    // ball toss on the floor
    if (!full) container.addEventListener('pointerdown', function (e) {
      if (e.target !== container || carried) return;
      container.focus(); touch();
      var p = rel(e); if (ballEl) ballEl.remove();
      ballEl = document.createElement('div'); ballEl.style.cssText = 'position:absolute;width:' + (scale * 3) + 'px;height:' + (scale * 3) + 'px;border-radius:50%;background:#ff4d4d;box-shadow:inset -2px -2px 0 #b32424;pointer-events:none;left:0;top:0';
      ballEl.style.transform = 'translate(' + (p.x - scale * 1.5) + 'px,' + (p.y - scale * 1.5) + 'px)'; container.appendChild(ballEl);
      ball = { x: p.x, y: p.y }; emit('toss', ball);
    });

    // snack tray: drag a snack onto the pal to feed it
    var SNACKS = Array.isArray(opts.snacks) ? opts.snacks : ['apple', 'coffee', 'cake', 'pizza', 'ramen', 'boba'];
    if (!full && opts.snacks !== false) {
      var tray = document.createElement('div'); tray.style.cssText = 'position:absolute;left:8px;bottom:8px;display:flex;gap:4px;padding:4px 6px;border-radius:8px;background:rgba(0,0,0,.1)';
      SNACKS.forEach(function (name) {
        var fd = FOOD_BY_ID[name]; if (!fd) return;
        var el = document.createElement('div'); el.title = 'Drag the ' + fd.name.toLowerCase() + ' to the pal'; el.setAttribute('aria-label', fd.name);
        var fs = Math.max(2, Math.round(scale * 0.6)); el.style.cssText = 'cursor:grab;touch-action:none;line-height:0'; el.appendChild(foodCanvas(name, fs));
        var ghost = null;
        el.addEventListener('pointerdown', function (e) {
          e.preventDefault(); e.stopPropagation(); el.setPointerCapture && el.setPointerCapture(e.pointerId); touch();
          ghost = foodCanvas(name, fs); ghost.style.position = 'absolute'; ghost.style.left = '0'; ghost.style.top = '0'; ghost.style.pointerEvents = 'none'; ghost.style.zIndex = '2'; container.appendChild(ghost);
          move(e);
        });
        function move(e) { if (!ghost) return; var p = rel(e); ghost.style.transform = 'translate(' + (p.x - fs * 7) + 'px,' + (p.y - fs * 7) + 'px)'; var c = center(); pal.setLook(p.x > c.x + size * .15 ? 1 : p.x < c.x - size * .15 ? -1 : 0, p.y > c.y + size * .15 ? 1 : p.y < c.y - size * .15 ? -1 : 0); setMood('amazed'); }
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', function (e) {
          if (!ghost) return; var p = rel(e), c = center(); ghost.remove(); ghost = null;
          if (Math.hypot(p.x - c.x, p.y - c.y) < size * 0.7) { pal.setFood(name); playUntil = now() + 2200; react(fd.kind === 'drink' ? 'amazed' : fd.kind === 'sweet' ? 'ecstatic' : 'happy', 'eat', 2200); emit('feed', { snack: name, kind: fd.kind }); }
          else { setMood(base.mood, base.activity); emit('dropFood', { snack: name }); }
        });
        el.addEventListener('pointercancel', function () { if (ghost) ghost.remove(); ghost = null; });
        tray.appendChild(el);
      });
      container.appendChild(tray);
    }

    // keyboard: arrows move, space jumps
    if (!full && opts.keyboard !== false) {
      container.addEventListener('keydown', function (e) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].indexOf(e.key) < 0) return;
        e.preventDefault(); touch(); keys[e.key] = true;
        if (e.key === ' ' && !jump) { jump = { t0: now(), h: 0 }; react('happy', 'none', 500); emit('jump'); }
      });
      container.addEventListener('keyup', function (e) { keys[e.key] = false; });
      container.addEventListener('blur', function () { keys = {}; });
    }

    // spin it with the wheel
    pal.canvas.addEventListener('wheel', function (e) { e.preventDefault(); touch(); var n = 0, spin = setInterval(function () { pal.setFlip(!pal.flip); if (++n >= 8) { clearInterval(spin); pal.setFlip(false); } }, 70); react('lost', 'none', 1600); emit('spin'); }, { passive: false });

    // right-click: a photo pose
    pal.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); touch(); react(['amazed', 'extrovert', 'memeface', 'pokerface'][Math.floor(Math.random() * 4)], 'none', 1800); emit('pose'); });

    bindPointer(pal, { noLook: true,
      on: function (ev) {
        touch(); var n = needs();
        if (ev === 'click') react(reactionFor(n), 'none', 1800);
        else if (ev === 'tickle') react('ecstatic', 'none', 2200);
        else if (ev === 'annoyed') react('angry', 'none', 2600);
        else if (ev === 'pet') react('happy', 'none', 60000);
        else if (ev === 'petEnd') react('amazed', 'none', 1500);
        emit(ev, { needs: n, mood: pal.mood });
      },
      onDragStart: function () { touch(); carried = true; vel = null; trail = []; ball = null; if (ballEl) ballEl.remove(); react('flabbergasted', 'none', 60000); emit('pickup'); },
      onDrag: function (e) { var p = rel(e); pos.x = p.x - size / 2; pos.y = p.y - sizeH / 2; place(); trail.push({ x: p.x, y: p.y, t: now() }); if (trail.length > 6) trail.shift(); },
      onDrop: function () {
        carried = false; clampPos(pos); place();
        var a = trail[0], z = trail[trail.length - 1], v = null;
        if (a && z && z.t > a.t) { var dt = (z.t - a.t) / 1000; v = { x: (z.x - a.x) / dt, y: (z.y - a.y) / dt }; }
        var speed = v ? Math.hypot(v.x, v.y) : 0;
        if (speed > 350) { vel = { x: v.x, y: v.y, hard: speed > 900 }; react('flabbergasted', 'none', 60000); emit('throw', { speed: Math.round(speed) }); }
        else if (floor && pos.y < floorY() - 2) { vel = { x: 0, y: 0, hard: false, fall: true }; react('alert', 'none', 60000); emit('drop'); }
        else { react('lost', 'none', 1500); frustration = Math.max(0, frustration - 20); emit('drop'); }
      }
    });

    // friends: other pals that wander the box and sometimes play, argue or greet
    function addFriend(id, fopts) {
      fopts = fopts || {};
      var h = document.createElement('div'); h.style.cssText = 'position:absolute;left:0;top:0;will-change:transform;pointer-events:none'; container.appendChild(h);
      var bb = box(), fp = mount(h, { character: id, mood: 'quiet', stage: fopts.stage || pal.stage, scale: scale, outfit: fopts.outfit }); fp._owned = true;
      if (fopts.label) { var lb = document.createElement('div'); lb.textContent = fopts.label; lb.style.cssText = 'position:absolute;left:50%;top:100%;transform:translateX(-50%);font:600 10px/1.2 system-ui,sans-serif;white-space:nowrap;padding:1px 5px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff'; h.appendChild(lb); }
      var fr = { pal: fp, el: h, pos: { x: fopts.fromLeft === false ? bb.w - size : 0, y: floor ? floorY() : Math.random() * Math.max(1, bb.h - size) }, goal: null, nextAt: now() + 600, busyUntil: 0, mode: fopts.mode || 'free', leaveAt: fopts.leaveAfterMs ? now() + fopts.leaveAfterMs : 0 };
      friends.push(fr); return fr;
    }
    function removeFriend(fr) { var i = friends.indexOf(fr); if (i >= 0) friends.splice(i, 1); fr.pal.destroy(); fr.el.remove(); }
    function meet(fr, forced) {
      var kind = forced || (Math.random() < 0.45 ? 'play' : Math.random() < 0.5 ? 'argue' : 'greet'), ms = kind === 'greet' ? 1600 : 2800, t = now();
      var mine = kind === 'play' ? ['happy', 'play'] : kind === 'argue' ? ['angry', 'argue'] : ['extrovert', 'none'];
      playUntil = t + ms; fr.busyUntil = t + ms; react(mine[0], mine[1], ms); fr.pal.setMood(mine[0]).setActivity(mine[1]);
      fr.pal.setFlip(fr.pos.x > pos.x); pal.setFlip(pos.x > fr.pos.x);
      emit('meet', { kind: kind, friend: fr.pal.character });
      setTimeout(function () { if (!alive) return; fr.pal.setMood('quiet').setActivity('none'); fr.goal = null; fr.nextAt = now() + 7000; if (fr.mode === 'visit') { fr.leaveAt = now() + 300; } }, ms);
    }
    function friendsMeet(t) {
      for (var i = 0; i < friends.length; i++) for (var j = i + 1; j < friends.length; j++) {
        var A = friends[i], B = friends[j]; if (t < A.busyUntil || t < B.busyUntil || A.leaveAt || B.leaveAt || A.pairAt > t || B.pairAt > t) continue;
        if (Math.hypot(A.pos.x - B.pos.x, A.pos.y - B.pos.y) < size * 1.1) {
          var kind = Math.random() < 0.5 ? 'play' : Math.random() < 0.4 ? 'argue' : 'greet', ms = kind === 'greet' ? 1600 : 2600, mood = kind === 'play' ? ['happy', 'play'] : kind === 'argue' ? ['angry', 'argue'] : ['extrovert', 'none'];
          A.busyUntil = B.busyUntil = t + ms; A.pairAt = B.pairAt = t + 12000 + Math.random() * 8000;
          [A, B].forEach(function (fr) { fr.pal.setMood(mood[0]).setActivity(mood[1]); fr.goal = null; setTimeout(function () { if (alive) fr.pal.setMood('quiet').setActivity('none'); }, ms); });
          A.pal.setFlip(B.pos.x < A.pos.x); B.pal.setFlip(A.pos.x < B.pos.x);
          emit('friendsMeet', { kind: kind, a: A.pal.character, b: B.pal.character });
        }
      }
    }
    function stepFriends(dt, t) {
      var bb = box(), c = center(); friendsMeet(t);
      friends.slice().forEach(function (fr) {
        var fc = { x: fr.pos.x + size / 2, y: fr.pos.y + size / 2 };
        if (fr.leaveAt && t > fr.leaveAt) { fr.goal = { x: fr.pos.x < bb.w / 2 ? -size : bb.w + size, y: fr.pos.y }; if (fr.pos.x < -size + 2 || fr.pos.x > bb.w - 2) { removeFriend(fr); emit('friendLeft', { friend: fr.pal.character }); return; } }
        else if (t < fr.busyUntil) { fr.pal.setWalk(false); return; }
        else if (fr.mode === 'visit' && !fr.goal) fr.goal = { x: pos.x + (fc.x < c.x ? -size * 0.9 : size * 0.9), y: pos.y };
        if (floor) fr.pos.y = floorY();
        else if (!fr.goal && t > fr.nextAt) { fr.goal = Math.random() < 0.5 ? { x: pos.x + (Math.random() < .5 ? -1 : 1) * size * 0.95, y: pos.y } : { x: Math.random() * (bb.w - size), y: floor ? floorY() : Math.random() * (bb.h - size) }; }
        var moving = false;
        if (fr.goal) {
          var dx = fr.goal.x - fr.pos.x, dy = fr.goal.y - fr.pos.y, d = Math.hypot(dx, dy), sp = (SPEED[fr.pal.stage] || 120) * 0.6;
          if (d > 4) { var st = Math.min(d, sp * dt); fr.pos.x += dx / d * st; fr.pos.y += dy / d * st; moving = true; fr.pal.setFlip(dx < 0); fr.pal.setLook(dx > size * .15 ? 1 : dx < -size * .15 ? -1 : 0, 0); }
          else { fr.goal = null; fr.nextAt = t + 2500 + Math.random() * 3000; fr.pal.setLook(null); }
          if (!fr.leaveAt) { fr.pos.x = Math.max(0, Math.min(bb.w - size, fr.pos.x)); fr.pos.y = Math.max(0, Math.min(bb.h - size, fr.pos.y)); }
        }
        fr.pal.setWalk(moving);
        fr.el.style.transform = 'translate(' + Math.round(fr.pos.x) + 'px,' + Math.round(fr.pos.y) + 'px)';
        var near = Math.hypot(fc.x - c.x, fc.y - c.y) < size * 1.15;
        if (near && !carried && t > fr.busyUntil && t > playUntil && t > fr.nextAt - 6500 && !fr.leaveAt) meet(fr, fr.mode === 'visit' ? fr.visitKind : null);
      });
    }

    function step() {
      if (!alive) return;
      var t = now(), dt = Math.min(0.1, (t - last) / 1000); last = t;
      var bb = box(), c = center(), target = null, kind = null;
      stepFriends(dt, t);
      if (carried) { requestAnimationFrame(step); return; }

      // thrown: slide, bounce, slow down
      if (vel) {
        if (floor) {
          vel.y += 2200 * dt; pos.x += vel.x * dt; pos.y += vel.y * dt;
          if (pos.x < 0 || pos.x > bb.w - size) { vel.x = -vel.x * 0.6; emit('bounce'); }
          if (pos.y < 0) { pos.y = 0; vel.y = Math.abs(vel.y) * 0.4; }
          var fy = floorY(), onFloor = false;
          if (pos.y >= fy) { pos.y = fy; onFloor = true; if (vel.y > 120) { vel.y = -vel.y * 0.45; emit('bounce'); } else vel.y = 0; }
          if (onFloor) vel.x *= Math.pow(0.05, dt);
          clampPos(pos); if (!vel.fall) pal.setFlip(!pal.flip); place();
          if (onFloor && Math.abs(vel.x) < 25 && Math.abs(vel.y) < 1) { var hardF = vel.hard, fell = vel.fall; vel = null; pal.setFlip(false); react(fell ? 'lost' : hardF ? 'angry' : 'lost', 'none', hardF ? 2400 : 1200); if (hardF) frustration = Math.min(100, frustration + 25); emit('landed', { hard: !!hardF }); }
          requestAnimationFrame(step); return;
        }
        pos.x += vel.x * dt; pos.y += vel.y * dt;
        if (pos.x < 0 || pos.x > bb.w - size) { vel.x = -vel.x * 0.7; emit('bounce'); }
        if (pos.y < 0 || pos.y > bb.h - size) { vel.y = -vel.y * 0.7; emit('bounce'); }
        clampPos(pos); vel.x *= Math.pow(0.12, dt); vel.y *= Math.pow(0.12, dt);
        pal.setFlip(!pal.flip); place();
        if (Math.hypot(vel.x, vel.y) < 25) { var hard = vel.hard; vel = null; pal.setFlip(false); react(hard ? 'angry' : 'lost', 'none', hard ? 2400 : 1400); if (hard) frustration = Math.min(100, frustration + 25); emit('landed', { hard: hard }); }
        requestAnimationFrame(step); return;
      }
      if (floor) pos.y = floorY();
      if (jump) { var jt = (t - jump.t0) / 420; if (jt >= 1) { jump = null; } else jump.h = Math.sin(jt * Math.PI) * size * 0.8; place(); }

      // keyboard steering overrides chasing
      var kx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), ky = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
      if (kx || ky) { var ks = (SPEED[pal.stage] || 140) * 1.1; pos.x += kx * ks * dt; pos.y += ky * ks * dt; clampPos(pos); place(); pal.setWalk(true); if (kx) pal.setFlip(kx < 0); pal.setLook(kx, ky); setMood('happy'); requestAnimationFrame(step); return; }

      if (ball) { target = ball; kind = 'ball'; }
      else if (cursor && !dozing && Math.hypot(cursor.x - c.x, cursor.y - c.y) <= noticeR) { target = cursor; kind = 'cursor'; }
      else if (wander) { target = wander; kind = 'wander'; }
      var lookTarget = target;
      if (target && floor) target = { x: target.x, y: c.y };
      if (lookTarget) { var ddx = lookTarget.x - c.x, ddy = lookTarget.y - c.y; pal.setLook(Math.abs(ddx) > size * 0.15 ? (ddx > 0 ? 1 : -1) : 0, Math.abs(ddy) > size * 0.15 ? (ddy > 0 ? 1 : -1) : 0); }
      else pal.setLook(null);

      var speed = (SPEED[pal.stage] || 140) * (kind === 'wander' ? 0.45 : 1), moving = false;
      if (target && t > playUntil) {
        var d = Math.hypot(target.x - c.x, target.y - c.y);
        if (d > (kind === 'wander' ? 6 : catchR)) {
          var stepLen = Math.min(d, speed * dt);
          pos.x += (target.x - c.x) / d * stepLen; pos.y += (target.y - c.y) / d * stepLen; moving = true;
          pal.setFlip(target.x < c.x);
        } else if (kind === 'ball') { ball = null; if (ballEl) { ballEl.remove(); ballEl = null; } playUntil = t + 2000; react('happy', 'play', 2000); emit('fetch'); }
        else if (kind === 'wander') wander = null;
        clampPos(pos);
      }
      pal.setWalk(moving);
      if (moving && !jump) { hop = (hop + dt * 14) % (Math.PI * 2); holder.style.transform = 'translate(' + Math.round(pos.x) + 'px,' + Math.round(pos.y - Math.abs(Math.sin(hop)) * size * 0.08) + 'px)'; }
      else if (jump) place(); else if (hop) { hop = 0; place(); }

      // too many tasks: stressed → angry → panic, with a nag every so often
      if (overloaded() && t > playUntil && now() >= reactUntil && !dozing) {
        if (t > overloadAt) { overloadAt = t + 2600; setMood(['stressed', 'angry', 'alert'][Math.floor(Math.random() * 3)], 'none'); }
        if (t > nagAt) { nagAt = t + 20000; emit('nag', { tasks: tasks }); }
        requestAnimationFrame(step); return;
      }

      // doze off when ignored
      if (!full && !dozing && t - lastTouch > idleMs && t > playUntil && now() >= reactUntil) { dozing = true; emit('doze'); }
      if (dozing) { setMood('asleep'); requestAnimationFrame(step); return; }

      // frustration arc: cursor out of reach → quiet → doubtful → angry → sad (crying) → tantrum; catching up resets it
      if (kind === 'cursor') {
        var dc = Math.hypot(target.x - c.x, target.y - c.y);
        if (dc > farR) { frustration = Math.min(100, frustration + 11 * dt); chasing = true; }
        else if (dc <= catchR) {
          if (chasing) { chasing = false; var hard2 = frustration >= 35; react(hard2 ? 'ecstatic' : 'happy', 'none', hard2 ? 2000 : 1200); emit('catch', { frustration: Math.round(frustration) }); }
          frustration = Math.max(0, frustration - 45 * dt);
        }
        if (frustration < 80) cried = false; if (frustration < 95) raged = false;
        if (frustration >= 80 && !cried) { cried = true; emit('cry', { frustration: Math.round(frustration) }); }
        if (frustration >= 95 && !raged) { raged = true; emit('tantrum', { frustration: 100 }); }
        if (t >= playUntil) setMood(frustration < 15 ? (moving ? 'happy' : base.mood) : frustration >= 95 ? 'tantrum' : ladder(frustration), 'none');
      } else {
        frustration = Math.max(0, frustration - 6 * dt);
        if (t >= playUntil) setMood(frustration >= 95 ? 'tantrum' : frustration >= 40 ? ladder(frustration) : base.mood, kind === 'ball' ? 'none' : base.activity);
        if (!target && t > wanderAt && opts.wander !== false) { wander = { x: size / 2 + Math.random() * Math.max(1, bb.w - size), y: floor ? c.y : size / 2 + Math.random() * Math.max(1, bb.h - size) }; wanderAt = t + 4000 + Math.random() * 5000; }
      }
      requestAnimationFrame(step);
    }
    place(); requestAnimationFrame(step);

    return { pal: pal, container: container, react: react,
      get frustration() { return Math.round(frustration); }, get position() { return { x: pos.x, y: pos.y }; }, get dozing() { return dozing; }, get friends() { return friends.slice(); },
      setBase: function (mood, act) { base = { mood: mood, activity: act || 'none' }; if (now() >= reactUntil && !dozing) { pal.setMood(mood).setActivity(act || 'none'); } },
      toss: function (x, y) { ball = { x: x, y: y }; },
      wake: touch,
      setTasks: function (n) { var was = tasks; tasks = n | 0; pal.setBadge(tasks); if (was > 3 && tasks <= 3) react(tasks === 0 ? 'ecstatic' : 'happy', 'none', 2000); else if (was <= 3 && tasks > 3) { react('flabbergasted', 'none', 1500); overloadAt = 0; nagAt = now() + 1500; } return this; },
      get tasks() { return tasks; }, get overloaded() { return overloaded(); },
      setOutfit: function (o) { pal.setOutfit(o); return this; },
      show: function (v) { holder.style.display = v === false ? 'none' : ''; return this; },
      addFriend: addFriend, removeFriend: removeFriend,
      visit: function (id, kind) { var fr = addFriend(id, { mode: 'visit', fromLeft: pos.x > box().w / 2 }); fr.visitKind = kind || null; return fr; },
      destroy: function () { alive = false; friends.slice().forEach(removeFriend); pal.destroy(); if (ballEl) ballEl.remove(); holder.remove(); if (full) container.remove(); } };
  }
  function roam(opts) { opts = opts || {}; opts.fullPage = true; return playground(null, opts); }

  // watchCursor({radius}) — every mounted pal within radius of the pointer turns its eyes toward it.
  var watching = false;
  function watchCursor(opts) {
    if (watching || typeof window === 'undefined') return; watching = true;
    var radius = (opts && opts.radius) || 180, mx = null, my = null, pending = false;
    window.addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; if (!pending) { pending = true; setTimeout(apply, 90); } });
    function apply() { pending = false; if (mx === null) return;
      for (var i = 0; i < live.length; i++) { var p = live[i]; if (!p._visible || p._owned) continue;
        var r = p.canvas.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = mx - cx, dy = my - cy;
        if (Math.abs(dx) > radius || Math.abs(dy) > radius) { if (p.look) p.setLook(null); continue; }
        p.setLook(Math.abs(dx) > r.width * 0.15 ? (dx > 0 ? 1 : -1) : 0, Math.abs(dy) > r.height * 0.15 ? (dy > 0 ? 1 : -1) : 0);
      } }
  }

  return { version: '3.3.0', foods: FOODS, foodGrid: foodGrid, foodCanvas: foodCanvas, outfits: { hat: Object.keys(OUTFIT.hat), eyes: Object.keys(OUTFIT.eyes), top: Object.keys(OUTFIT.top), back: Object.keys(OUTFIT.back), hand: Object.keys(OUTFIT.hand), face: Object.keys(OUTFIT.face), feet: Object.keys(OUTFIT.feet) }, presets: OUTFIT_PRESETS, interact: interact, playground: playground, roam: roam, watchCursor: watchCursor, reactionFor: reactionFor, characters: CHARACTERS, moods: MOODS, stages: STAGES, activities: ACTIVITIES,
    size: W, frames: FRAMES, frameMs: FRAME_MS, grid: grid, mount: mount, autoMount: autoMount, toDataURL: toDataURL, spriteSheet: spriteSheet };
});
