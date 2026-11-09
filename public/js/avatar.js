/**
 * AvatarKit : rendu SVG partagé entre le serveur (require) et le navigateur (window.AvatarKit).
 * - renderAvatar(config, { expression, size, background, viewBox }) : personnage style « clay 3D » en pose selfie
 * - renderBlob({ color, face, size })                                 : boule d'émotion façon maquette
 * - SCHEMA / GROUPS / DEFAULT_CONFIG / normalizeConfig / randomConfig : builder d'avatar
 * - EXPRESSIONS / EMOTIONS                                            : expressions runtime et émotions décoratives du test
 *
 * Les configurations enregistrées restent valables : toute clé absente prend la valeur par défaut,
 * qui reproduit le dessin d'origine, et l'ancienne clé `accessory` est convertie (voir normalizeConfig).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.AvatarKit = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ======================================================================
     Palettes et schéma du builder
     ====================================================================== */
  const SKIN_TONES = ['#FDE3D0', '#F6CDB0', '#E7B48E', '#D9A077', '#C9906B', '#B07A55', '#A06B48', '#8A5A3C', '#70492F', '#4E3222'];
  const HAIR_COLORS = ['#1F1A17', '#4A3222', '#7A4F2B', '#B06A3C', '#D9A552', '#F1D28A', '#8E8E93', '#F2F2F2', '#C94A6A', '#4F7BD9', '#7B5CC9', '#3FA66B', '#F28CB8', '#FF8A3D'];
  const EYE_COLORS = ['#3B2A1A', '#5A8FD6', '#4F8A5B', '#7A7F86', '#8B6B3E', '#1E8C8A', '#8F5FBF', '#2C2C2C'];
  const JACKET_COLORS = ['#F2C96B', '#F07A6E', '#6EC1F5', '#7CD39A', '#C9B6F2', '#F28CB8', '#2E3440', '#F4F4F6', '#D97A3B', '#5E6B8A', '#3B5BA5', '#1E7F6E', '#8C2F39', '#E9D8A6'];
  const ACCENT_COLORS = ['#FFFFFF', '#1C1D22', '#F2C96B', '#F07A6E', '#6EC1F5', '#7CD39A', '#F28CB8', '#C9B6F2'];
  const HAT_COLORS = ['#3A66C4', '#2E3440', '#D64545', '#F2C96B', '#7CD39A', '#F28CB8', '#F4F4F6', '#8C5A3C', '#6F2E5B', '#1E7F6E'];
  const NECK_COLORS = ['#D64545', '#2E3440', '#3B5BA5', '#F2C96B', '#7CD39A', '#F28CB8', '#F4F4F6', '#6F2E5B'];
  const BG_COLORS = ['#DCE8F2', '#FBE7D9', '#E3F3E6', '#EEE6FB', '#FDE6EE', '#F3F4F6', '#FFF1C2', '#CFE9F0', '#2B3A55'];

  /** Onglets du builder, dans l'ordre d'affichage. */
  const GROUPS = [
    { key: 'face', label: 'Visage' }, { key: 'hair', label: 'Cheveux' }, { key: 'eyes', label: 'Regard' },
    { key: 'outfit', label: 'Tenue' }, { key: 'extras', label: 'Accessoires' }, { key: 'bg', label: 'Fond' },
  ];

  /**
   * type : 'choice' (vignettes), 'color' (pastilles, hexa libre) ou 'tint' (choix nommé affiché en pastille).
   * zoom : cadrage des vignettes ('face' ou 'head'), sinon le personnage entier.
   * rare : jamais tiré par « Aléatoire ».
   */
  const SCHEMA = [
    { key: 'faceShape', label: 'Forme du visage', group: 'face', type: 'choice', zoom: 'head',
      options: [{ v: 'oval', l: 'Ovale' }, { v: 'round', l: 'Rond' }, { v: 'square', l: 'Carré' }, { v: 'heart', l: 'Cœur' }, { v: 'long', l: 'Allongé' }] },
    { key: 'skin', label: 'Teint', group: 'face', type: 'color', options: SKIN_TONES },
    { key: 'body', label: 'Morphologie', group: 'face', type: 'choice',
      options: [{ v: 'slim', l: 'Fine' }, { v: 'medium', l: 'Moyenne' }, { v: 'broad', l: 'Large' }] },
    { key: 'nose', label: 'Nez', group: 'face', type: 'choice', zoom: 'face',
      options: [{ v: 'small', l: 'Petit' }, { v: 'medium', l: 'Moyen' }, { v: 'long', l: 'Long' }, { v: 'button', l: 'Rond' }, { v: 'wide', l: 'Large' }] },
    { key: 'lips', label: 'Lèvres', group: 'face', type: 'tint',
      options: [{ v: 'none', l: 'Naturelles', c: null }, { v: 'nude', l: 'Nude', c: '#C98A74' }, { v: 'rose', l: 'Rose', c: '#E07A8E' }, { v: 'coral', l: 'Corail', c: '#F2735A' },
                { v: 'red', l: 'Rouge', c: '#D33A4B' }, { v: 'berry', l: 'Framboise', c: '#9B2D5A' }, { v: 'plum', l: 'Prune', c: '#6F2E5B' }] },
    { key: 'details', label: 'Détails', group: 'face', type: 'choice', zoom: 'face',
      options: [{ v: 'none', l: 'Aucun' }, { v: 'freckles', l: 'Taches de rousseur' }, { v: 'beautymark', l: 'Grain de beauté' }, { v: 'blush', l: 'Joues rosées' }, { v: 'nosering', l: 'Piercing' }] },
    { key: 'facialHair', label: 'Pilosité', group: 'face', type: 'choice', zoom: 'head',
      options: [{ v: 'none', l: 'Aucune' }, { v: 'stubble', l: 'Barbe de 3 jours' }, { v: 'mustache', l: 'Moustache' }, { v: 'handlebar', l: 'Moustache en guidon' },
                { v: 'goatee', l: 'Bouc' }, { v: 'soulpatch', l: 'Mouche' }, { v: 'chinstrap', l: 'Collier' }, { v: 'beard', l: 'Barbe' }, { v: 'fullbeard', l: 'Barbe longue' }] },

    { key: 'hair', label: 'Coiffure', group: 'hair', type: 'choice', zoom: 'head',
      options: [{ v: 'short', l: 'Courte' }, { v: 'sidepart', l: 'Raie sur le côté' }, { v: 'wavy', l: 'Ondulée' }, { v: 'curly', l: 'Bouclée' }, { v: 'buzz', l: 'Rasée' },
                { v: 'bald', l: 'Chauve' }, { v: 'pixie', l: 'Pixie' }, { v: 'bangs', l: 'Frange' }, { v: 'spiky', l: 'Hérissée' }, { v: 'mohawk', l: 'Crête' },
                { v: 'bob', l: 'Carré' }, { v: 'long', l: 'Longue' }, { v: 'longbangs', l: 'Longue avec frange' }, { v: 'ponytail', l: 'Queue de cheval' },
                { v: 'bun', l: 'Chignon' }, { v: 'doublebun', l: 'Deux chignons' }, { v: 'braids', l: 'Tresses' }, { v: 'locs', l: 'Locks' }, { v: 'afro', l: 'Afro' }] },
    { key: 'hairColor', label: 'Couleur des cheveux', group: 'hair', type: 'color', options: HAIR_COLORS },

    { key: 'eyes', label: 'Yeux', group: 'eyes', type: 'choice', zoom: 'face',
      options: [{ v: 'round', l: 'Ronds' }, { v: 'almond', l: 'En amande' }, { v: 'narrow', l: 'Fins' }, { v: 'wide', l: 'Grands' },
                { v: 'upturned', l: 'Relevés' }, { v: 'droopy', l: 'Tombants' }, { v: 'hooded', l: 'Paupières lourdes' }] },
    { key: 'eyeColor', label: 'Couleur des yeux', group: 'eyes', type: 'color', options: EYE_COLORS },
    { key: 'lashes', label: 'Cils', group: 'eyes', type: 'choice', zoom: 'face',
      options: [{ v: 'none', l: 'Discrets' }, { v: 'long', l: 'Longs' }] },
    { key: 'brows', label: 'Sourcils', group: 'eyes', type: 'choice', zoom: 'face',
      options: [{ v: 'straight', l: 'Droits' }, { v: 'arched', l: 'Arqués' }, { v: 'thick', l: 'Épais' }, { v: 'thin', l: 'Fins' },
                { v: 'rounded', l: 'Arrondis' }, { v: 'angled', l: 'Relevés' }, { v: 'bushy', l: 'Broussailleux' }] },
    { key: 'glasses', label: 'Lunettes', group: 'eyes', type: 'choice', zoom: 'face',
      options: [{ v: 'none', l: 'Aucune' }, { v: 'round', l: 'Rondes' }, { v: 'thin', l: 'Fines' }, { v: 'square', l: 'Carrées' }, { v: 'halfrim', l: 'Demi-monture' },
                { v: 'cateye', l: 'Papillon' }, { v: 'aviator', l: 'Aviateur' }, { v: 'sunglasses', l: 'Solaires' }] },
    { key: 'glassesColor', label: 'Monture', group: 'eyes', type: 'tint',
      options: [{ v: 'auto', l: 'Assortie', c: null }, { v: 'black', l: 'Noire', c: '#2B2B2B' }, { v: 'tortoise', l: 'Écaille', c: '#7A4A22' }, { v: 'gold', l: 'Dorée', c: '#C9A24A' },
                { v: 'silver', l: 'Argentée', c: '#A9ADB5' }, { v: 'red', l: 'Rouge', c: '#C83C3C' }, { v: 'blue', l: 'Bleue', c: '#3E6FC9' }, { v: 'pink', l: 'Rose', c: '#E07AA6' }, { v: 'white', l: 'Blanche', c: '#F4F4F6' }] },

    { key: 'jacket', label: 'Vêtement', group: 'outfit', type: 'choice',
      options: [{ v: 'puffer', l: 'Doudoune' }, { v: 'hoodie', l: 'Sweat à capuche' }, { v: 'blazer', l: 'Blazer' }, { v: 'tee', l: 'T-shirt' }, { v: 'shirt', l: 'Chemise' },
                { v: 'polo', l: 'Polo' }, { v: 'turtleneck', l: 'Col roulé' }, { v: 'vneck', l: 'Pull col V' }, { v: 'cardigan', l: 'Cardigan' }, { v: 'denim', l: 'Veste en jean' }] },
    { key: 'jacketColor', label: 'Couleur du vêtement', group: 'outfit', type: 'color', options: JACKET_COLORS },
    { key: 'accent', label: 'Couleur secondaire', group: 'outfit', type: 'color', options: ACCENT_COLORS },
    { key: 'pattern', label: 'Motif', group: 'outfit', type: 'choice',
      options: [{ v: 'none', l: 'Uni' }, { v: 'stripes', l: 'Rayures' }, { v: 'dots', l: 'Pois' }, { v: 'checks', l: 'Carreaux' }] },

    { key: 'hat', label: 'Tête', group: 'extras', type: 'choice', zoom: 'head',
      options: [{ v: 'none', l: 'Rien' }, { v: 'cap', l: 'Casquette' }, { v: 'beanie', l: 'Bonnet' }, { v: 'beret', l: 'Béret' }, { v: 'bucket', l: 'Bob' },
                { v: 'headband', l: 'Bandeau' }, { v: 'headphones', l: 'Casque audio' }, { v: 'hijab', l: 'Hijab', rare: true }] },
    { key: 'hatColor', label: 'Couleur', group: 'extras', type: 'color', options: HAT_COLORS },
    { key: 'earrings', label: 'Boucles d\'oreilles', group: 'extras', type: 'choice', zoom: 'face',
      options: [{ v: 'none', l: 'Aucune' }, { v: 'studs', l: 'Puces' }, { v: 'hoops', l: 'Créoles' }, { v: 'drops', l: 'Pendantes' }] },
    { key: 'neck', label: 'Cou', group: 'extras', type: 'choice',
      options: [{ v: 'none', l: 'Rien' }, { v: 'scarf', l: 'Écharpe' }, { v: 'necklace', l: 'Collier' }, { v: 'chain', l: 'Chaîne' },
                { v: 'tie', l: 'Cravate' }, { v: 'bowtie', l: 'Nœud papillon' }, { v: 'lanyard', l: 'Badge' }] },
    { key: 'neckColor', label: 'Couleur', group: 'extras', type: 'color', options: NECK_COLORS },

    { key: 'background', label: 'Fond', group: 'bg', type: 'choice',
      options: [{ v: 'city', l: 'Ville' }, { v: 'office', l: 'Bureau' }, { v: 'park', l: 'Parc' }, { v: 'beach', l: 'Plage' },
                { v: 'mountains', l: 'Montagne' }, { v: 'night', l: 'Nuit' }, { v: 'blobs', l: 'Bulles' }, { v: 'plain', l: 'Uni' }] },
    { key: 'backgroundColor', label: 'Couleur du fond', group: 'bg', type: 'color', options: BG_COLORS },
  ];

  /** Personnage des maquettes : cheveux noirs, doudoune jaune, ville floutée. */
  const DEFAULT_CONFIG = {
    faceShape: 'oval', skin: '#F6CDB0', body: 'medium', nose: 'medium', lips: 'none', details: 'none', facialHair: 'none',
    hair: 'short', hairColor: '#1F1A17',
    eyes: 'round', eyeColor: '#3B2A1A', lashes: 'none', brows: 'straight', glasses: 'none', glassesColor: 'auto',
    jacket: 'puffer', jacketColor: '#F2C96B', accent: '#FFFFFF', pattern: 'none',
    hat: 'none', hatColor: '#3A66C4', earrings: 'none', neck: 'none', neckColor: '#D64545',
    background: 'city', backgroundColor: '#DCE8F2',
  };

  const HEX_RE = /^#[0-9a-f]{6}$/i;

  /** L'ancien champ unique `accessory` se répartit entre tête, oreilles et cou. */
  function migrateLegacy(src, out) {
    if (!('accessory' in src) || 'hat' in src || 'earrings' in src || 'neck' in src) return;
    const a = src.accessory;
    if (a === 'earrings') out.earrings = 'studs';
    else if (a === 'cap') out.hat = 'cap';
    else if (a === 'headphones') { out.hat = 'headphones'; out.hatColor = '#2E3440'; }
    else if (a === 'scarf') out.neck = 'scarf';
  }

  function normalizeConfig(input) {
    const src = (input && typeof input === 'object') ? input : {};
    const out = {};
    for (const field of SCHEMA) {
      const v = src[field.key];
      if (field.type === 'color') out[field.key] = (typeof v === 'string' && HEX_RE.test(v)) ? v.toUpperCase() : DEFAULT_CONFIG[field.key];
      else out[field.key] = field.options.some((o) => o.v === v) ? v : DEFAULT_CONFIG[field.key];
    }
    migrateLegacy(src, out);
    return out;
  }

  /**
   * Tirage au sort d'un personnage complet. Les options « rien » sortent une fois sur deux,
   * pour ne pas empiler tous les accessoires à chaque fois.
   * @param {Object} [base]    configuration de départ (les clés hors de `only` sont conservées)
   * @param {string[]} [only]  clés à tirer ; toutes par défaut
   */
  function randomConfig(base, only) {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const out = { ...(base ? normalizeConfig(base) : {}) };
    for (const field of SCHEMA) {
      if (only && !only.includes(field.key)) continue;
      if (field.type === 'color') { out[field.key] = pick(field.options); continue; }
      const options = field.options.filter((o) => !o.rare);
      const off = options.find((o) => o.v === 'none' || o.v === 'auto');
      out[field.key] = off && Math.random() < 0.5 ? off.v : pick(options).v;
    }
    return normalizeConfig(out);
  }

  /* ======================================================================
     Couleurs
     ====================================================================== */
  function hexToRgb(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  function mix(hex, target, t) {
    const a = hexToRgb(hex); const b = hexToRgb(target);
    return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
  }
  const lighten = (h, t) => mix(h, '#FFFFFF', t);
  const darken = (h, t) => mix(h, '#000000', t);
  function luminance(hex) { const [r, g, b] = hexToRgb(hex); return (r * 299 + g * 587 + b * 114) / 1000; }
  /** Nuance dérivée d'une couleur, sauf pour la teinte d'origine dont on garde la nuance dessinée à la main. */
  function shade(color, legacyColor, legacyShade, t, light) {
    if (color === legacyColor) return legacyShade;
    return light ? lighten(color, t) : darken(color, t);
  }
  /** Couleur associée à une option nommée (lèvres, monture), ou null pour « naturel / assorti ». */
  function optionColor(fieldKey, value) {
    const field = SCHEMA.find((f) => f.key === fieldKey);
    const opt = field && field.options.find((o) => o.v === value);
    return opt ? opt.c || null : null;
  }

  /* ======================================================================
     Expressions (runtime, jamais stockées) et émotions décoratives
     ====================================================================== */
  const EXPRESSIONS = {
    neutral:  { browIn: 0,   browOut: 0,  eyes: 'open',   mouth: 'smile',   pupil: 0 },
    joy:      { browIn: -3,  browOut: -2, eyes: 'happy',  mouth: 'grin',    pupil: 0, cheeks: true },
    surprise: { browIn: -10, browOut: -8, eyes: 'wide',   mouth: 'o',       pupil: 0 },
    stress:   { browIn: -7,  browOut: 3,  eyes: 'open',   mouth: 'wavy',    pupil: 0, sweat: true },
    fear:     { browIn: -9,  browOut: 2,  eyes: 'wide',   mouth: 'grimace', pupil: 0 },
    proud:    { browIn: 3,   browOut: -4, eyes: 'squint', mouth: 'smirk',   pupil: 0 },
    thinking: { browIn: 0,   browOut: 0,  browRightIn: -8, browRightOut: -6, eyes: 'open', mouth: 'flat', pupil: 6 },
    doubt:    { browIn: -5,  browOut: 2,  eyes: 'open',   mouth: 'pout',    pupil: -5 },
    sad:      { browIn: -7,  browOut: 4,  eyes: 'half',   mouth: 'frown',   pupil: 0 },
    wink:     { browIn: -2,  browOut: -2, eyes: 'wink',   mouth: 'smirk',   pupil: 0, cheeks: true },
  };
  const EXPRESSION_LABELS = {
    neutral: 'Neutre', joy: 'Joie', surprise: 'Surprise', stress: 'Stress', fear: 'Peur', proud: 'Fierté',
    thinking: 'Réflexion', doubt: 'Doute', sad: 'Tristesse', wink: 'Clin d\'œil',
  };

  /** Émotions affichées pendant le test (décoratives : ne révèlent jamais la dimension mesurée). */
  const EMOTIONS = [
    { key: 'joie', label: 'Joie', color: '#F6C644', expression: 'joy', face: 'happy' },
    { key: 'curiosite', label: 'Curiosité', color: '#6EC1F5', expression: 'thinking', face: 'focused' },
    { key: 'stress', label: 'Stress', color: '#7CD39A', expression: 'stress', face: 'worried' },
    { key: 'peur', label: 'Peur', color: '#C9B6F2', expression: 'fear', face: 'worried' },
    { key: 'surprise', label: 'Surprise', color: '#F4A261', expression: 'surprise', face: 'surprised' },
    { key: 'serenite', label: 'Sérénité', color: '#5EC8E0', expression: 'neutral', face: 'calm' },
    { key: 'fierte', label: 'Fierté', color: '#F28CB8', expression: 'proud', face: 'determined' },
    { key: 'doute', label: 'Doute', color: '#8A8FE0', expression: 'doubt', face: 'sleepy' },
    { key: 'nostalgie', label: 'Nostalgie', color: '#9BB8D4', expression: 'sad', face: 'sleepy' },
    { key: 'malice', label: 'Malice', color: '#F07A6E', expression: 'wink', face: 'happy' },
  ];

  /* ======================================================================
     Rendu de l'avatar
     ====================================================================== */
  let counter = 0;
  function uid() { counter = (counter + 1) % 1e6; return 'av' + counter.toString(36) + Math.random().toString(36).slice(2, 6); }

  const EYE_STYLES = {
    round: { rx: 11, ry: 11 }, almond: { rx: 12, ry: 8 }, narrow: { rx: 12.5, ry: 6 }, wide: { rx: 12, ry: 13 },
    upturned: { rx: 12, ry: 8.5, rot: 10 }, droopy: { rx: 12, ry: 8.5, rot: -10 }, hooded: { rx: 12, ry: 8, lid: 4.5 },
  };
  const BROW_STYLES = {
    straight: { w: 6.5, arch: 1 }, arched: { w: 6, arch: 7 }, thick: { w: 9, arch: 2 }, thin: { w: 4, arch: 3 },
    rounded: { w: 7, arch: 5 }, angled: { w: 7, arch: 0, tilt: -5 }, bushy: { w: 11, arch: 2 },
  };
  const BODY_SCALE = { slim: 0.9, medium: 1, broad: 1.13 };

  const HEAD = { cx: 200, cy: 150, rx: 62, ry: 72 };
  const EYE_Y = 152, EYE_LX = 178, EYE_RX = 222, BROW_Y = 128;

  /** Contour de la tête selon sa forme : ellipse d'origine pour l'ovale, tracés pour les autres. */
  const FACE_SHAPES = {
    oval: { ear: 61, hair: 1 },
    round: { ear: 66, hair: 1.09, ellipse: { rx: 67, ry: 69 } },
    long: { ear: 56, hair: 0.93, hairY: 1.09, ellipse: { rx: 57, ry: 78 } },
    square: { ear: 61, hair: 1, d: 'M 200 80 C 238 80 260 100 260 130 L 260 172 C 260 206 234 222 200 222 C 166 222 140 206 140 172 L 140 130 C 140 100 162 80 200 80 Z' },
    heart: { ear: 58, hair: 1.06, d: 'M 200 80 C 242 78 266 104 264 136 C 262 168 236 200 212 218 Q 200 228 188 218 C 164 200 138 168 136 136 C 134 104 158 78 200 80 Z' },
  };

  /** Élément SVG du contour de la tête, avec les attributs donnés (préfixés d'une espace). */
  function headShape(c, attrs, transform) {
    const shape = FACE_SHAPES[c.faceShape] || FACE_SHAPES.oval;
    const tr = transform ? ` transform="${transform}"` : '';
    if (shape.d) return `<path d="${shape.d}"${attrs}${tr}/>`;
    const e = shape.ellipse || HEAD;
    return `<ellipse cx="${HEAD.cx}" cy="${HEAD.cy}" rx="${e.rx}" ry="${e.ry}"${attrs}${tr}/>`;
  }
  const earOffset = (c) => (FACE_SHAPES[c.faceShape] || FACE_SHAPES.oval).ear;
  /** La chevelure suit la largeur du visage, et sa hauteur pour le visage allongé ; l'ovale d'origine reste tel quel. */
  function fitHair(c, svg) {
    const shape = FACE_SHAPES[c.faceShape] || FACE_SHAPES.oval;
    const ky = shape.hairY || 1;
    if (!svg || (shape.hair === 1 && ky === 1)) return svg;
    return `<g transform="translate(200 160) scale(${shape.hair} ${ky}) translate(-200 -160)">${svg}</g>`;
  }

  function defs(id, c) {
    let s = `<defs>
<radialGradient id="${id}-skin" cx="38%" cy="28%" r="78%"><stop offset="0" stop-color="${lighten(c.skin, 0.14)}"/><stop offset="0.55" stop-color="${c.skin}"/><stop offset="1" stop-color="${darken(c.skin, 0.22)}"/></radialGradient>
<radialGradient id="${id}-hair" cx="40%" cy="25%" r="80%"><stop offset="0" stop-color="${lighten(c.hairColor, 0.22)}"/><stop offset="0.5" stop-color="${c.hairColor}"/><stop offset="1" stop-color="${darken(c.hairColor, 0.3)}"/></radialGradient>
<radialGradient id="${id}-jacket" cx="40%" cy="20%" r="85%"><stop offset="0" stop-color="${lighten(c.jacketColor, 0.2)}"/><stop offset="0.55" stop-color="${c.jacketColor}"/><stop offset="1" stop-color="${darken(c.jacketColor, 0.25)}"/></radialGradient>
<linearGradient id="${id}-band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(c.jacketColor, 0.3)}"/><stop offset="0.5" stop-color="${c.jacketColor}"/><stop offset="1" stop-color="${darken(c.jacketColor, 0.22)}"/></linearGradient>
<linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.backgroundColor}"/><stop offset="1" stop-color="${lighten(c.backgroundColor, 0.55)}"/></linearGradient>
<filter id="${id}-blur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3.5"/></filter>
<filter id="${id}-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>`;
    if (c.pattern !== 'none') {
      const ink = luminance(c.jacketColor) > 150 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.26)';
      const motif = c.pattern === 'stripes' ? `<rect width="22" height="9" fill="${ink}"/>`
        : c.pattern === 'dots' ? `<circle cx="11" cy="11" r="3.6" fill="${ink}"/>`
          : `<rect width="11" height="11" fill="${ink}"/><rect x="11" y="11" width="11" height="11" fill="${ink}"/>`;
      s += `\n<pattern id="${id}-pat" width="22" height="22" patternUnits="userSpaceOnUse">${motif}</pattern>`;
    }
    return s + '\n</defs>';
  }

  /* ----------  Fonds  ---------- */
  function background(id, c) {
    const bg = c.backgroundColor;
    const tone = (t) => mix(bg, '#6F7B8A', t);
    if (c.background === 'plain') {
      return `<rect width="400" height="400" fill="${bg}"/><ellipse cx="200" cy="110" rx="180" ry="120" fill="#fff" opacity="0.35" filter="url(#${id}-soft)"/>`;
    }
    if (c.background === 'office') {
      return `<rect width="400" height="400" fill="${lighten(bg, 0.25)}"/>
<g filter="url(#${id}-blur)">
<rect x="30" y="40" width="130" height="150" rx="8" fill="#fff" opacity="0.8"/><rect x="240" y="40" width="130" height="150" rx="8" fill="#fff" opacity="0.8"/>
<rect x="30" y="40" width="130" height="150" rx="8" fill="${lighten(bg, 0.1)}" opacity="0.5"/><rect x="240" y="40" width="130" height="150" rx="8" fill="${lighten(bg, 0.1)}" opacity="0.5"/>
<rect x="0" y="250" width="400" height="150" fill="${tone(0.25)}" opacity="0.55"/>
<rect x="0" y="246" width="400" height="8" fill="${tone(0.45)}" opacity="0.5"/>
<circle cx="52" cy="232" r="26" fill="#7CB58A" opacity="0.8"/><circle cx="36" cy="248" r="18" fill="#5E9E6C" opacity="0.8"/><circle cx="70" cy="252" r="16" fill="#8FC69A" opacity="0.8"/>
<rect x="46" y="262" width="14" height="30" rx="3" fill="#C98D5A" opacity="0.8"/>
</g>`;
    }
    if (c.background === 'park') {
      return `<rect width="400" height="400" fill="url(#${id}-sky)"/>
<g filter="url(#${id}-blur)">
<circle cx="330" cy="70" r="34" fill="#FFF3C4" opacity="0.9"/>
<ellipse cx="80" cy="300" rx="220" ry="90" fill="#9FD3A2" opacity="0.9"/><ellipse cx="340" cy="320" rx="220" ry="100" fill="#7FC27F" opacity="0.9"/>
<circle cx="60" cy="190" r="44" fill="#6FAF72"/><rect x="54" y="200" width="12" height="50" rx="4" fill="#8C6A4A"/>
<circle cx="340" cy="170" r="52" fill="#78B77A"/><rect x="333" y="190" width="14" height="60" rx="4" fill="#8C6A4A"/>
<circle cx="120" cy="210" r="30" fill="#8AC78C"/>
</g>`;
    }
    if (c.background === 'beach') {
      return `<rect width="400" height="400" fill="url(#${id}-sky)"/>
<g filter="url(#${id}-blur)">
<circle cx="86" cy="76" r="36" fill="#FFF0B8" opacity="0.95"/>
<rect x="0" y="214" width="400" height="110" fill="#5FB6D8" opacity="0.9"/>
<path d="M 0 232 Q 40 224 80 232 T 160 232 T 240 232 T 320 232 T 400 232" stroke="#FFFFFF" stroke-width="4" fill="none" opacity="0.55"/>
<path d="M 0 262 Q 50 254 100 262 T 200 262 T 300 262 T 400 262" stroke="#FFFFFF" stroke-width="3" fill="none" opacity="0.35"/>
<ellipse cx="200" cy="400" rx="320" ry="110" fill="#F2DCA8"/>
<ellipse cx="200" cy="396" rx="300" ry="86" fill="#FFF3D6" opacity="0.5"/>
<path d="M 332 150 L 326 290" stroke="#8C6A4A" stroke-width="6" stroke-linecap="round"/><path d="M 330 150 q -40 -30 -56 2 q 30 -6 56 -2 M 330 150 q 40 -28 60 4 q -30 -8 -60 -4 M 330 150 q -14 -40 -42 -40 q 26 12 42 40 M 330 150 q 16 -40 44 -36 q -26 10 -44 36" fill="#4F9A5C"/>
</g>`;
    }
    if (c.background === 'mountains') {
      return `<rect width="400" height="400" fill="url(#${id}-sky)"/>
<g filter="url(#${id}-blur)">
<circle cx="310" cy="84" r="30" fill="#FFF0B8" opacity="0.9"/>
<path d="M -20 300 L 70 150 L 130 230 L 200 110 L 270 220 L 330 160 L 420 300 Z" fill="${tone(0.35)}" opacity="0.9"/>
<path d="M 180 144 L 200 110 L 220 144 Q 200 136 180 144 Z M 56 174 L 70 150 L 84 174 Q 70 168 56 174 Z" fill="#FFFFFF" opacity="0.9"/>
<path d="M -20 340 L 60 230 L 130 300 L 210 210 L 300 310 L 360 250 L 420 340 Z" fill="${tone(0.55)}" opacity="0.9"/>
<rect x="0" y="300" width="400" height="100" fill="#7FBF84"/>
<ellipse cx="90" cy="330" rx="130" ry="40" fill="#9FD3A2" opacity="0.8"/>
</g>`;
    }
    if (c.background === 'night') {
      const sky = luminance(bg) > 120 ? darken(bg, 0.72) : bg;
      let stars = '';
      for (let i = 0; i < 26; i++) {
        const x = (i * 97 + 31) % 400; const y = (i * 53 + 17) % 230;
        stars += `<circle cx="${x}" cy="${y}" r="${1 + (i % 3) * 0.6}" fill="#FFFFFF" opacity="${0.5 + (i % 4) * 0.12}"/>`;
      }
      return `<rect width="400" height="400" fill="${sky}"/><rect width="400" height="400" fill="url(#${id}-sky)" opacity="0.12"/>
${stars}<circle cx="318" cy="78" r="30" fill="#FFF6D6"/><circle cx="332" cy="68" r="28" fill="${sky}" opacity="0.92"/>
<g filter="url(#${id}-blur)">
<path d="M 0 400 L 0 286 L 44 286 L 44 236 L 86 236 L 86 268 L 128 268 L 128 206 L 166 206 L 166 258 L 218 258 L 218 226 L 254 226 L 254 272 L 302 272 L 302 232 L 346 232 L 346 262 L 400 262 L 400 400 Z" fill="${lighten(sky, 0.1)}"/>
<rect x="60" y="250" width="8" height="10" fill="#FFE08A" opacity="0.8"/><rect x="140" y="222" width="8" height="10" fill="#FFE08A" opacity="0.8"/><rect x="230" y="240" width="8" height="10" fill="#FFE08A" opacity="0.8"/><rect x="316" y="246" width="8" height="10" fill="#FFE08A" opacity="0.8"/>
</g>`;
    }
    if (c.background === 'blobs') {
      return `<rect width="400" height="400" fill="${lighten(bg, 0.2)}"/>
<g filter="url(#${id}-soft)">
<circle cx="80" cy="110" r="96" fill="${mix(bg, '#F6C644', 0.55)}" opacity="0.85"/>
<circle cx="330" cy="90" r="80" fill="${mix(bg, '#F07A6E', 0.5)}" opacity="0.8"/>
<circle cx="340" cy="330" r="110" fill="${mix(bg, '#7CD39A', 0.5)}" opacity="0.8"/>
<circle cx="60" cy="340" r="90" fill="${mix(bg, '#6EC1F5', 0.55)}" opacity="0.85"/>
</g>`;
    }
    // city (défaut)
    const buildings = [
      [0, 118, 54, 0.35], [48, 76, 44, 0.5], [86, 150, 66, 0.28], [146, 56, 50, 0.45],
      [190, 104, 74, 0.32], [258, 36, 56, 0.52], [308, 128, 52, 0.3], [354, 84, 60, 0.42],
    ];
    let b = '';
    for (const [x, y, w, t] of buildings) {
      b += `<rect x="${x}" y="${y}" width="${w}" height="${400 - y}" fill="${tone(t)}"/>`;
      for (let wy = y + 14; wy < 330; wy += 22) {
        for (let wx = x + 8; wx < x + w - 10; wx += 16) {
          b += `<rect x="${wx}" y="${wy}" width="8" height="11" fill="#FFF7DF" opacity="${((wx * 7 + wy * 3) % 5 === 0) ? 0.85 : 0.35}"/>`;
        }
      }
    }
    return `<rect width="400" height="400" fill="url(#${id}-sky)"/>
<g filter="url(#${id}-blur)" opacity="0.95">${b}
<rect x="0" y="332" width="400" height="68" fill="${tone(0.5)}" opacity="0.9"/>
<circle cx="128" cy="300" r="7" fill="#F26B6B"/><circle cx="262" cy="292" r="7" fill="#6BCB77"/><circle cx="346" cy="306" r="6" fill="#FFD166"/><circle cx="56" cy="312" r="6" fill="#FFD166"/>
</g>`;
  }

  /* ----------  Corps / vêtement  ---------- */
  function arm(id, c, x, angle) {
    const jk = c.jacketColor;
    const puffer = c.jacket === 'puffer';
    let s = `<g transform="translate(${x} 300) rotate(${angle})">`;
    s += `<rect x="-44" y="-26" width="88" height="200" rx="44" fill="url(#${id}-band)"/>`;
    if (puffer) {
      for (const y of [30, 88, 146]) {
        s += `<rect x="-44" y="${y}" width="88" height="58" rx="29" fill="url(#${id}-band)" stroke="${darken(jk, 0.2)}" stroke-opacity="0.35" stroke-width="1.5"/>`;
      }
    } else {
      s += `<rect x="-44" y="-26" width="88" height="200" rx="44" fill="${darken(jk, 0.3)}" opacity="0.1"/>`;
    }
    s += '</g>';
    return s;
  }

  /** Vêtements sur lesquels le motif s'applique (pas sur les matelassages ni le jean). */
  const PATTERNED = ['tee', 'hoodie', 'shirt', 'polo', 'turtleneck', 'vneck'];

  function torso(id, c) {
    const jk = c.jacketColor;
    const ac = c.accent;
    let s = '';
    const sx = BODY_SCALE[c.body];
    s += `<g transform="translate(200 0) scale(${sx} 1) translate(-200 0)">`;
    s += arm(id, c, 118, 29) + arm(id, c, 282, -29);
    s += `<rect x="96" y="256" width="208" height="220" rx="66" fill="url(#${id}-jacket)"/>`;
    if (c.pattern !== 'none' && PATTERNED.includes(c.jacket)) s += `<rect x="96" y="256" width="208" height="220" rx="66" fill="url(#${id}-pat)"/>`;
    if (c.jacket === 'puffer') {
      for (const [x, y, w, h] of [[104, 266, 192, 48], [96, 308, 208, 50], [92, 352, 216, 52], [92, 398, 216, 52]]) {
        s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="url(#${id}-band)" stroke="${darken(jk, 0.2)}" stroke-opacity="0.35" stroke-width="1.5"/>`;
      }
    } else if (c.jacket === 'hoodie') {
      s += `<path d="M 130 330 Q 200 350 270 330 L 270 390 Q 200 410 130 390 Z" fill="${darken(jk, 0.12)}" opacity="0.6"/>`;
      s += `<path d="M 196 262 L 192 320 M 204 262 L 208 320" stroke="${lighten(jk, 0.5)}" stroke-width="4" stroke-linecap="round"/>`;
    } else if (c.jacket === 'blazer') {
      s += `<path d="M 168 256 L 200 330 L 232 256 Z" fill="${ac}"/>`;
      s += `<path d="M 168 256 L 200 330 L 200 480 L 100 480 L 100 300 Z" fill="${darken(jk, 0.1)}" opacity="0.35"/>`;
      s += `<path d="M 232 256 L 200 330 L 200 480 L 300 480 L 300 300 Z" fill="${darken(jk, 0.1)}" opacity="0.2"/>`;
      s += `<path d="M 170 258 L 200 328 L 230 258" fill="none" stroke="${darken(jk, 0.3)}" stroke-width="2" opacity="0.6"/>`;
      s += `<circle cx="200" cy="350" r="4" fill="${darken(jk, 0.45)}"/><circle cx="200" cy="378" r="4" fill="${darken(jk, 0.45)}"/>`;
    } else if (c.jacket === 'shirt') {
      s += `<rect x="190" y="262" width="20" height="214" fill="${lighten(jk, 0.12)}" opacity="0.6"/>`;
      s += `<path d="M 200 262 L 200 476" stroke="${darken(jk, 0.25)}" stroke-width="2" opacity="0.6"/>`;
      for (const y of [294, 334, 374, 414]) s += `<circle cx="200" cy="${y}" r="3.6" fill="${ac}" stroke="${darken(jk, 0.35)}" stroke-width="0.8"/>`;
      s += `<path d="M 232 300 L 268 300 L 268 334 Q 268 340 262 340 L 238 340 Q 232 340 232 334 Z" fill="none" stroke="${darken(jk, 0.3)}" stroke-width="1.6" opacity="0.7"/>`;
    } else if (c.jacket === 'polo') {
      s += `<path d="M 200 266 L 200 324" stroke="${darken(jk, 0.3)}" stroke-width="2" opacity="0.6"/>`;
      s += `<circle cx="200" cy="296" r="3.4" fill="${ac}" stroke="${darken(jk, 0.35)}" stroke-width="0.8"/><circle cx="200" cy="314" r="3.4" fill="${ac}" stroke="${darken(jk, 0.35)}" stroke-width="0.8"/>`;
    } else if (c.jacket === 'turtleneck') {
      s += `<path d="M 120 300 Q 200 290 280 300 M 118 340 Q 200 330 282 340 M 118 380 Q 200 370 282 380 M 120 420 Q 200 410 280 420" stroke="${darken(jk, 0.25)}" stroke-width="1.5" fill="none" opacity="0.35"/>`;
    } else if (c.jacket === 'vneck') {
      s += `<path d="M 166 256 L 200 304 L 234 256 Z" fill="${ac}"/>`;
      s += `<path d="M 166 256 L 200 304 L 234 256" fill="none" stroke="${darken(jk, 0.3)}" stroke-width="6" stroke-linejoin="round"/>`;
    } else if (c.jacket === 'cardigan') {
      s += `<rect x="176" y="256" width="48" height="220" fill="${ac}"/>`;
      s += `<path d="M 176 256 L 176 476 M 224 256 L 224 476" stroke="${darken(jk, 0.3)}" stroke-width="5"/>`;
      for (const y of [332, 372, 412]) s += `<circle cx="184" cy="${y}" r="3.4" fill="${darken(jk, 0.45)}"/>`;
    } else if (c.jacket === 'denim') {
      const thread = '#F2D27A';
      s += `<path d="M 104 262 L 104 470 M 296 262 L 296 470 M 200 262 L 200 470" stroke="${thread}" stroke-width="1.6" stroke-dasharray="3 3" opacity="0.8"/>`;
      for (const x of [116, 230]) {
        s += `<path d="M ${x} 302 L ${x + 54} 302 L ${x + 54} 346 Q ${x + 54} 352 ${x + 48} 352 L ${x + 6} 352 Q ${x} 352 ${x} 346 Z" fill="${darken(jk, 0.08)}" stroke="${thread}" stroke-width="1.4" stroke-dasharray="3 3" opacity="0.9"/>`;
        s += `<path d="M ${x} 302 L ${x + 54} 302 L ${x + 48} 316 L ${x + 6} 316 Z" fill="${darken(jk, 0.16)}"/>`;
      }
      for (const y of [296, 336, 376, 416]) s += `<circle cx="200" cy="${y}" r="4" fill="#C9CBD3" stroke="#8E919B" stroke-width="1"/>`;
    } else { // tee
      s += `<ellipse cx="200" cy="262" rx="36" ry="14" fill="${darken(jk, 0.25)}" opacity="0.5"/>`;
    }
    s += '</g>';
    return s;
  }

  function collarBack(id, c) {
    const sx = BODY_SCALE[c.body];
    const jk = c.jacketColor;
    let inner = '';
    if (c.jacket === 'puffer') inner = `<rect x="150" y="212" width="100" height="72" rx="32" fill="url(#${id}-band)" stroke="${darken(jk, 0.2)}" stroke-opacity="0.4" stroke-width="1.5"/>`;
    else if (c.jacket === 'hoodie') inner = `<path d="M 122 300 C 100 200 150 110 200 100 C 250 110 300 200 278 300 Z" fill="url(#${id}-jacket)"/><path d="M 138 290 C 124 210 160 130 200 122 C 240 130 276 210 262 290 Z" fill="${darken(jk, 0.35)}" opacity="0.55"/>`;
    else if (c.jacket === 'blazer') inner = `<path d="M 160 232 L 200 250 L 240 232 L 240 262 L 200 280 L 160 262 Z" fill="${c.accent}"/>`;
    else if (c.jacket === 'shirt' || c.jacket === 'denim' || c.jacket === 'polo') inner = `<path d="M 154 236 L 200 258 L 246 236 L 246 262 L 200 282 L 154 262 Z" fill="${darken(jk, 0.1)}"/>`;
    return inner ? `<g transform="translate(200 0) scale(${sx} 1) translate(-200 0)">${inner}</g>` : '';
  }

  function neck(c) {
    return `<path d="M 178 196 L 178 252 Q 200 266 222 252 L 222 196 Z" fill="${darken(c.skin, 0.14)}"/>`;
  }

  function collarFront(id, c) {
    const sx = BODY_SCALE[c.body];
    const jk = c.jacketColor;
    let s = `<ellipse cx="200" cy="254" rx="60" ry="14" fill="#000" opacity="0.16" filter="url(#${id}-soft)"/>`;
    if (c.jacket === 'puffer') {
      s += `<path d="M 150 250 L 150 256 Q 150 284 178 284 L 222 284 Q 250 284 250 256 L 250 250 Q 200 270 150 250 Z" fill="url(#${id}-band)"/>`;
      s += `<line x1="200" y1="250" x2="200" y2="470" stroke="${darken(jk, 0.35)}" stroke-width="2.5" stroke-opacity="0.55"/>`;
      s += `<rect x="195" y="254" width="10" height="16" rx="3" fill="#C9CBD3" stroke="#8E919B" stroke-width="1"/>`;
    } else if (c.jacket === 'hoodie') {
      s += `<path d="M 160 248 Q 200 290 240 248 L 240 258 Q 200 300 160 258 Z" fill="${darken(jk, 0.18)}"/>`;
    } else if (c.jacket === 'shirt' || c.jacket === 'denim') {
      s += `<path d="M 158 240 L 200 266 L 242 240 L 252 256 L 200 292 L 148 256 Z" fill="${c.jacket === 'denim' ? darken(jk, 0.12) : lighten(jk, 0.08)}"/>`;
      s += `<path d="M 158 240 L 200 266 L 242 240" fill="none" stroke="${darken(jk, 0.3)}" stroke-width="1.5" opacity="0.6"/>`;
    } else if (c.jacket === 'polo') {
      s += `<path d="M 164 242 L 200 272 L 236 242 L 244 256 L 200 292 L 156 256 Z" fill="${darken(jk, 0.1)}"/>`;
    } else if (c.jacket === 'turtleneck') {
      s += `<path d="M 168 200 L 168 252 Q 200 272 232 252 L 232 200 Q 200 212 168 200 Z" fill="url(#${id}-band)"/>`;
      s += `<path d="M 176 206 L 176 252 M 184 210 L 184 256 M 192 212 L 192 258 M 200 213 L 200 259 M 208 212 L 208 258 M 216 210 L 216 256 M 224 206 L 224 252" stroke="${darken(jk, 0.25)}" stroke-width="1.4" opacity="0.35"/>`;
    }
    return `<g transform="translate(200 0) scale(${sx} 1) translate(-200 0)">${s}</g>`;
  }

  /* ----------  Cou : écharpe, collier, cravate…  ---------- */
  function neckwear(c) {
    const nc = c.neckColor;
    switch (c.neck) {
      case 'scarf': {
        const dark = shade(nc, '#D64545', '#C23B3B', 0.12);
        const line = shade(nc, '#D64545', '#B53535', 0.2);
        return `<rect x="148" y="214" width="104" height="48" rx="22" fill="${nc}"/><rect x="148" y="214" width="104" height="48" rx="22" fill="#fff" opacity="0.12"/><rect x="212" y="246" width="32" height="64" rx="14" fill="${dark}"/><path d="M 160 232 Q 200 246 240 232" stroke="${line}" stroke-width="3" fill="none" opacity="0.6"/>`;
      }
      case 'necklace':
        return `<path d="M 174 250 Q 200 290 226 250" stroke="#E2B84A" stroke-width="2.2" fill="none"/><circle cx="200" cy="288" r="5.5" fill="${nc}" stroke="#E2B84A" stroke-width="1.6"/>`;
      case 'chain':
        return `<path d="M 172 250 Q 200 292 228 250" stroke="${darken(nc, 0.3)}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M 172 250 Q 200 292 228 250" stroke="${lighten(nc, 0.5)}" stroke-width="2" fill="none" stroke-dasharray="4 4"/>`;
      case 'tie':
        return `<path d="M 188 252 Q 200 247 212 252 L 208 266 Q 200 262 192 266 Z" fill="${darken(nc, 0.15)}"/><path d="M 193 266 L 207 266 L 213 342 L 200 360 L 187 342 Z" fill="${nc}"/><path d="M 200 266 L 203 342" stroke="#fff" stroke-width="2" opacity="0.18"/>`;
      case 'bowtie':
        return `<path d="M 200 262 L 176 250 Q 170 262 176 274 Z M 200 262 L 224 250 Q 230 262 224 274 Z" fill="${nc}"/><rect x="194" y="255" width="12" height="14" rx="3" fill="${darken(nc, 0.25)}"/>`;
      case 'lanyard':
        return `<path d="M 166 258 L 192 336 M 234 258 L 208 336" stroke="${nc}" stroke-width="6" stroke-linecap="round"/><rect x="180" y="330" width="40" height="48" rx="5" fill="#FFFFFF" stroke="#C9CBD3" stroke-width="1.5"/><rect x="186" y="338" width="28" height="18" rx="3" fill="#E6E8ED"/><path d="M 188 362 L 212 362 M 188 369 L 206 369" stroke="#9B9DA6" stroke-width="2" stroke-linecap="round"/>`;
      default: return '';
    }
  }

  /* ----------  Tête, cheveux, visage  ---------- */
  const CASQUE = 'M 138 150 C 130 94 154 54 194 52 C 232 48 268 70 267 116 C 267 132 265 142 262 150 C 262 130 256 116 246 112 C 236 108 226 117 216 119 C 204 121 196 110 184 106 C 168 100 150 112 140 136 Z';
  const SKULLCAP = 'M 140 142 C 141 98 164 78 200 78 C 236 78 259 98 260 142 C 254 112 232 96 200 96 C 168 96 146 112 140 142 Z';
  const SKULLCAP_SOFT = 'M 140 142 C 141 98 164 78 200 78 C 236 78 259 98 260 142 C 254 112 232 100 200 100 C 168 100 146 112 140 142 Z';
  const FRINGE = 'M 138 150 C 130 94 154 54 194 52 C 232 48 268 70 267 116 L 266 150 L 258 150 L 258 124 Q 200 112 142 124 L 142 150 Z';
  const LONG_BACK = 'M 134 160 C 126 92 160 60 200 60 C 240 60 274 92 266 160 L 280 300 C 282 322 118 322 120 300 Z';
  const SHINE = '<path d="M 172 66 C 192 56 226 58 248 78" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.2"/>';

  function hairBack(id, c) {
    if (c.hat === 'hijab') return '';
    const h = c.hair;
    const fill = `url(#${id}-hair)`;
    if (h === 'long' || h === 'longbangs') return `<path d="${LONG_BACK}" fill="${fill}"/>`;
    if (h === 'afro') return `<circle cx="200" cy="132" r="100" fill="${fill}"/>`;
    if (h === 'ponytail') return `<path d="M 250 118 C 300 134 306 222 288 292 C 282 308 262 304 266 286 C 280 232 272 176 244 142 Z" fill="${fill}"/>`;
    if (h === 'bun') return `<circle cx="200" cy="66" r="23" fill="${fill}"/><ellipse cx="192" cy="58" rx="8" ry="4" fill="#fff" opacity="0.25"/>`;
    if (h === 'doublebun') return `<circle cx="148" cy="76" r="22" fill="${fill}"/><circle cx="252" cy="76" r="22" fill="${fill}"/><ellipse cx="141" cy="68" rx="7" ry="3.5" fill="#fff" opacity="0.25"/><ellipse cx="245" cy="68" rx="7" ry="3.5" fill="#fff" opacity="0.25"/>`;
    if (h === 'bob') return `<path d="M 126 160 C 122 90 160 56 200 56 C 240 56 278 90 274 160 L 278 214 Q 278 230 262 230 L 138 230 Q 122 230 122 214 Z" fill="${fill}"/>`;
    if (h === 'braids') {
      let s = '';
      for (const side of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
          const cx = 200 + side * (52 + (i % 2 ? 3 : -3) + i * 0.6);
          s += `<ellipse cx="${cx.toFixed(1)}" cy="${156 + i * 22}" rx="9" ry="12.5" fill="${fill}" stroke="${darken(c.hairColor, 0.25)}" stroke-width="0.8"/>`;
        }
        s += `<circle cx="${(200 + side * 55).toFixed(1)}" cy="300" r="4.5" fill="${c.neckColor}"/>`;
      }
      return s;
    }
    if (h === 'locs') {
      let s = '';
      const strands = [[130, 112, 262], [143, 108, 284], [156, 110, 272], [244, 110, 272], [257, 108, 284], [270, 112, 262], [168, 122, 238], [232, 122, 238]];
      for (const [x, y0, y1] of strands) {
        s += `<rect x="${x - 7}" y="${y0}" width="14" height="${y1 - y0}" rx="7" fill="${fill}"/><path d="M ${x} ${y0 + 20} L ${x} ${y1 - 14}" stroke="${darken(c.hairColor, 0.3)}" stroke-width="1.5" stroke-dasharray="6 7" opacity="0.6"/>`;
      }
      return s;
    }
    return '';
  }

  function hairFront(id, c) {
    if (c.hat === 'hijab') return '';
    const h = c.hair;
    const fill = `url(#${id}-hair)`;
    const part = (d) => `<path d="${d}" stroke="${darken(c.skin, 0.1)}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>`;
    if (h === 'bald') return `<ellipse cx="184" cy="92" rx="22" ry="10" fill="#fff" opacity="0.3" filter="url(#${id}-soft)"/>`;
    if (h === 'buzz') return `<path d="${SKULLCAP}" fill="${fill}" opacity="0.9"/>`;
    if (h === 'afro') return `<path d="M 140 142 C 141 96 164 76 200 76 C 236 76 259 96 260 142 C 254 112 232 100 200 100 C 168 100 146 112 140 142 Z" fill="${fill}"/>`;
    if (h === 'wavy') {
      return `<path d="M 138 150 C 134 100 148 70 168 66 C 178 56 194 58 200 66 C 208 56 226 58 234 68 C 256 72 266 100 262 150 C 262 134 252 120 240 114 C 228 108 216 116 206 112 C 196 108 184 112 176 108 C 160 102 146 114 140 136 Z" fill="${fill}"/>`;
    }
    if (h === 'curly') {
      let s = `<path d="${SKULLCAP_SOFT}" fill="${fill}"/>`;
      const pts = [];
      for (let a = 195; a <= 345; a += 15) {
        const r = Math.PI * a / 180;
        pts.push([200 + 72 * Math.cos(r), 150 + 78 * Math.sin(r), 15]);
      }
      for (let a = 205; a <= 335; a += 26) {
        const r = Math.PI * a / 180;
        pts.push([200 + 56 * Math.cos(r), 150 + 62 * Math.sin(r), 14]);
      }
      for (const [x, y, r] of pts) s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${fill}"/>`;
      return s;
    }
    if (h === 'bangs' || h === 'longbangs') return `<path d="${FRINGE}" fill="${fill}"/>${SHINE}`;
    if (h === 'pixie') {
      return `<path d="M 138 150 C 130 94 154 54 194 52 C 232 48 268 70 267 116 C 267 132 265 142 262 150 C 260 124 250 112 238 110 C 222 108 206 118 196 134 Q 180 142 168 130 C 156 120 146 128 140 146 Z" fill="${fill}"/>${SHINE}`;
    }
    if (h === 'spiky') {
      return `<path d="${SKULLCAP}" fill="${fill}"/><path d="M 142 126 L 148 86 L 160 112 L 168 66 L 180 104 L 190 54 L 202 100 L 214 56 L 224 102 L 238 70 L 244 110 L 254 88 L 258 128 Z" fill="${fill}"/>`;
    }
    if (h === 'mohawk') {
      return `<path d="${SKULLCAP}" fill="${fill}" opacity="0.45"/><path d="M 184 92 L 182 42 L 192 66 L 200 24 L 208 66 L 218 42 L 216 92 Q 200 86 184 92 Z" fill="${fill}"/><path d="M 180 96 C 188 88 212 88 220 96 L 216 112 C 208 106 192 106 184 112 Z" fill="${fill}"/>`;
    }
    if (h === 'sidepart') {
      return `<path d="${CASQUE}" fill="${fill}"/><path d="M 182 58 C 210 44 250 50 266 92 C 262 78 250 68 236 66 C 220 64 206 72 190 72 Z" fill="${fill}"/>${part('M 176 62 Q 180 88 186 108')}`;
    }
    if (h === 'braids' || h === 'doublebun') return `<path d="${CASQUE}" fill="${fill}"/>${part('M 200 56 L 200 108')}`;
    if (h === 'locs') {
      return `<path d="${CASQUE}" fill="${fill}"/><path d="M 160 72 Q 170 90 166 112 M 184 60 Q 190 84 188 108 M 212 58 Q 214 84 214 110 M 238 70 Q 244 92 246 112" stroke="${darken(c.hairColor, 0.3)}" stroke-width="2" fill="none" opacity="0.5"/>`;
    }
    // short, long, bun, ponytail, bob : casque court avec mèche balayée
    return `<path d="${CASQUE}" fill="${fill}"/>${SHINE}`;
  }

  function browColorOf(c) {
    return luminance(c.hairColor) > 170 ? darken(c.hairColor, 0.45) : darken(c.hairColor, 0.1);
  }

  function brow(cx, side, c, ex) {
    const dir = side === 'L' ? 1 : -1;
    const inX = cx + 16 * dir;
    const outX = cx - 16 * dir;
    let inDy = ex.browIn;
    let outDy = ex.browOut;
    if (side === 'R' && ex.browRightIn != null) { inDy = ex.browRightIn; outDy = ex.browRightOut; }
    const st = BROW_STYLES[c.brows];
    outDy += st.tilt || 0;
    const midX = (inX + outX) / 2;
    const midY = BROW_Y + (inDy + outDy) / 2 - st.arch;
    return `<path d="M ${inX} ${BROW_Y + inDy} Q ${midX} ${midY} ${outX} ${BROW_Y + outDy}" stroke="${browColorOf(c)}" stroke-width="${st.w}" stroke-linecap="round" fill="none"/>`;
  }

  /** Trois cils au coin externe de l'œil. */
  function lashes(cx, cy, side, rx, ry) {
    const dir = side === 'L' ? -1 : 1;
    const x0 = cx + dir * rx;
    return `<path d="M ${x0} ${cy - ry + 3} l ${dir * 5} -4 M ${x0 - dir * 3} ${cy - ry} l ${dir * 4} -5 M ${x0 - dir * 7} ${cy - ry - 1} l ${dir * 2} -6" stroke="#2B2420" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  }

  function eye(id, cx, cy, side, c, ex) {
    const st = EYE_STYLES[c.eyes];
    const dark = '#2B2420';
    let state = ex.eyes;
    if (state === 'wink') state = side === 'L' ? 'closed' : 'open';
    const rot = st.rot ? (side === 'L' ? st.rot : -st.rot) : 0;
    const wrap = (inner) => (rot ? `<g transform="rotate(${rot} ${cx} ${cy})">${inner}</g>` : inner);
    const extra = c.lashes === 'long' ? lashes(cx, cy, side, st.rx, st.ry) : '';
    if (state === 'happy') return wrap(`<path d="M ${cx - 10} ${cy + 3} Q ${cx} ${cy - 10} ${cx + 10} ${cy + 3}" stroke="${dark}" stroke-width="3.5" fill="none" stroke-linecap="round"/>${extra}`);
    if (state === 'closed') return wrap(`<path d="M ${cx - 10} ${cy - 1} Q ${cx} ${cy + 8} ${cx + 10} ${cy - 1}" stroke="${dark}" stroke-width="3.5" fill="none" stroke-linecap="round"/>${extra}`);
    let rx = st.rx; let ry = st.ry;
    if (state === 'wide') { rx *= 1.22; ry *= 1.32; }
    if (state === 'squint') { ry *= 0.55; }
    if (state === 'half') { ry *= 0.7; }
    const px = cx + ex.pupil;
    const py = cy + (state === 'half' ? 1 : 0);
    const clip = `${id}-eye${side}`;
    const irisR = Math.min(6, ry + 1.5);
    const lidW = st.lid || ((state === 'half' || state === 'squint') ? 3.2 : 2);
    return wrap(`<clipPath id="${clip}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath>
<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#FFFFFF"/>
<g clip-path="url(#${clip})"><circle cx="${px}" cy="${py}" r="${irisR}" fill="${c.eyeColor}"/><circle cx="${px}" cy="${py}" r="${Math.max(2, irisR * 0.5)}" fill="#1A1512"/><circle cx="${px - 2}" cy="${py - 2}" r="1.7" fill="#FFFFFF"/></g>
<path d="M ${cx - rx} ${cy - 1} Q ${cx} ${cy - ry - 3} ${cx + rx} ${cy - 1}" stroke="${dark}" stroke-width="${lidW}" fill="none" stroke-linecap="round" opacity="0.85"/>${extra}`);
  }

  function nose(c) {
    const ink = darken(c.skin, 0.35);
    const stroke = `stroke="${ink}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.55"`;
    switch (c.nose) {
      case 'small': return `<path d="M 198 166 Q 194 176 200 178" ${stroke}/>`;
      case 'long': return `<path d="M 197 158 Q 190 178 201 182" ${stroke}/>`;
      case 'button': return `<path d="M 197 164 Q 193 174 198 177" ${stroke}/><ellipse cx="200" cy="179" rx="5.5" ry="3.8" fill="${darken(c.skin, 0.2)}" opacity="0.5"/>`;
      case 'wide': return `<path d="M 197 162 Q 190 176 196 180 M 188 179 Q 192 184 200 182 M 212 179 Q 208 184 200 182" ${stroke}/>`;
      default: return `<path d="M 197 162 Q 191 176 200 179" ${stroke}/>`;
    }
  }

  function mouth(c, ex) {
    const lipstick = optionColor('lips', c.lips);
    const lip = lipstick || mix(c.skin, '#7A3B45', 0.65);
    const stroke = `stroke="${lip}" stroke-width="${lipstick ? 4.5 : 3.5}" fill="none" stroke-linecap="round"`;
    const rim = lipstick ? ` stroke="${lipstick}" stroke-width="3" stroke-linejoin="round"` : '';
    switch (ex.mouth) {
      case 'grin': return `<path d="M 181 188 Q 200 217 219 188 Q 200 194 181 188 Z" fill="#5A2A2E"${rim}/><path d="M 185 189.5 Q 200 196 215 189.5 L 214 193 Q 200 199.5 186 193 Z" fill="#FFFFFF"/>`;
      case 'o': return `<ellipse cx="200" cy="196" rx="7" ry="9.5" fill="#5A2A2E"${rim}/><ellipse cx="200" cy="191.5" rx="4.5" ry="2.5" fill="#FFFFFF" opacity="0.9"/>`;
      case 'flat': return `<path d="M 190 194 L 210 194" ${stroke}/>`;
      case 'wavy': return `<path d="M 186 195 Q 193 188 200 195 Q 207 202 214 195" ${stroke}/>`;
      case 'frown': return `<path d="M 186 199 Q 200 188 214 199" ${stroke}/>`;
      case 'smirk': return `<path d="M 186 194 Q 200 203 218 188" ${stroke}/>`;
      case 'grimace': return `<rect x="181" y="188" width="38" height="13" rx="6.5" fill="#5A2A2E"${rim}/><rect x="185" y="190.5" width="30" height="4.5" rx="2" fill="#FFFFFF"/><path d="M 191 190 V 200 M 200 190 V 200 M 209 190 V 200" stroke="#5A2A2E" stroke-width="1.2"/>`;
      case 'pout': return `<path d="M 192 196 Q 200 191 208 196" ${stroke}/>`;
      default: return `<path d="M 186 191 Q 200 203 214 191" ${stroke}/>`;
    }
  }

  function details(c) {
    switch (c.details) {
      case 'freckles': {
        const ink = darken(c.skin, 0.38);
        const dots = [[160, 174], [167, 180], [173, 171], [178, 178], [164, 185], [222, 178], [227, 171], [233, 180], [240, 174], [236, 185]];
        return `<g fill="${ink}" opacity="0.5">${dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7"/>`).join('')}</g>`;
      }
      case 'beautymark': return `<circle cx="216" cy="203" r="2.4" fill="#3B2A24"/>`;
      case 'blush': return `<ellipse cx="164" cy="177" rx="11" ry="6" fill="#F08A8A" opacity="0.32"/><ellipse cx="236" cy="177" rx="11" ry="6" fill="#F08A8A" opacity="0.32"/>`;
      case 'nosering': return `<circle cx="207" cy="178" r="4" fill="none" stroke="#D9B45B" stroke-width="1.8"/>`;
      default: return '';
    }
  }

  function face(id, c, ex) {
    let s = '';
    s += brow(EYE_LX, 'L', c, ex) + brow(EYE_RX, 'R', c, ex);
    s += eye(id, EYE_LX, EYE_Y, 'L', c, ex) + eye(id, EYE_RX, EYE_Y, 'R', c, ex);
    s += nose(c);
    if (ex.cheeks) s += `<ellipse cx="164" cy="177" rx="10" ry="5.5" fill="#F08A8A" opacity="0.35"/><ellipse cx="236" cy="177" rx="10" ry="5.5" fill="#F08A8A" opacity="0.35"/>`;
    s += details(c);
    s += mouth(c, ex);
    if (ex.sweat) s += `<path d="M 266 112 q 7 11 0 18 q -7 -7 0 -18 z" fill="#8FD0F7"/>`;
    return s;
  }

  function facialHair(id, c) {
    const fill = `url(#${id}-hair)`;
    const oval = c.faceShape === 'oval';
    const mustache = `<path d="M 180 184 Q 200 174 220 184 Q 210 188.5 200 185.5 Q 190 188.5 180 184 Z" fill="${fill}"/>`;
    const headClip = `<clipPath id="${id}-head">${headShape(c, '')}</clipPath>`;
    // Joues et menton : sous la courbe qui passe à 207 au centre, jusque sous la tête.
    const jawClip = `<clipPath id="${id}-jaw"><path d="M 136 150 C 142 198 164 207 200 207 C 236 207 258 198 264 150 L 320 150 L 320 330 L 80 330 L 80 150 Z"/></clipPath>`;
    // Barbe : le tracé d'origine pour l'ovale, sinon le contour de la tête élargi vers le bas.
    const beard = oval
      ? `<path d="M 136 150 C 132 232 168 246 200 246 C 232 246 268 232 264 150 C 258 198 236 207 200 207 C 164 207 142 198 136 150 Z" fill="${fill}"/>`
      : `${jawClip}<g clip-path="url(#${id}-jaw)">${headShape(c, ` fill="${fill}"`, 'translate(200 150) scale(1.04 1.3) translate(-200 -150)')}</g>`;
    switch (c.facialHair) {
      case 'stubble': return `${headClip}<path clip-path="url(#${id}-head)" d="M 136 165 C 142 226 170 240 200 240 C 230 240 258 226 264 165 C 254 200 232 208 200 208 C 168 208 146 200 136 165 Z" fill="${c.hairColor}" opacity="0.22"/>`;
      case 'mustache': return mustache;
      case 'handlebar': return `<path d="M 176 186 Q 200 172 224 186 Q 212 190 200 186 Q 188 190 176 186 Z" fill="${fill}"/><path d="M 177 186 q -9 -1 -7 -10 M 223 186 q 9 -1 7 -10" stroke="${c.hairColor}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
      case 'beard': return beard + mustache;
      case 'fullbeard': return `<path d="M 168 206 C 152 262 172 296 200 296 C 228 296 248 262 232 206 Z" fill="${fill}"/>${beard}${mustache}`;
      case 'goatee': return `<path d="M 186 207 Q 200 238 214 207 Q 200 214 186 207 Z" fill="${fill}"/>`;
      case 'soulpatch': return `<path d="M 194 206 Q 200 217 206 206 Q 200 209.5 194 206 Z" fill="${fill}"/>`;
      case 'chinstrap': return `${jawClip}<g clip-path="url(#${id}-jaw)">${headShape(c, ` fill="none" stroke="${fill}" stroke-width="7"`, 'translate(200 150) scale(1.02 1.06) translate(-200 -150)')}</g>`;
      default: return '';
    }
  }

  function glasses(c) {
    const named = optionColor('glassesColor', c.glassesColor);
    const frame = named || (c.glasses === 'aviator' ? '#C9A24A' : '#2B2B2B');
    const temples = (y1, y2, w) => `<path d="M 162 ${y1} L 140 ${y2} M 238 ${y1} L 260 ${y2}" stroke="${frame}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
    switch (c.glasses) {
      case 'round':
        return `<g fill="#FFFFFF" fill-opacity="0.16" stroke="${frame}" stroke-width="3"><circle cx="${EYE_LX}" cy="${EYE_Y}" r="16"/><circle cx="${EYE_RX}" cy="${EYE_Y}" r="16"/></g><path d="M 194 150 Q 200 146 206 150 M 162 150 L 140 146 M 238 150 L 260 146" stroke="${frame}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      case 'thin':
        return `<g fill="#FFFFFF" fill-opacity="0.1" stroke="${frame}" stroke-width="1.6"><circle cx="${EYE_LX}" cy="${EYE_Y}" r="15"/><circle cx="${EYE_RX}" cy="${EYE_Y}" r="15"/></g><path d="M 193 150 Q 200 147 207 150 M 163 150 L 140 146 M 237 150 L 260 146" stroke="${frame}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
      case 'square':
        return `<g fill="#FFFFFF" fill-opacity="0.16" stroke="${frame}" stroke-width="3"><rect x="${EYE_LX - 16}" y="${EYE_Y - 13}" width="32" height="26" rx="6"/><rect x="${EYE_RX - 16}" y="${EYE_Y - 13}" width="32" height="26" rx="6"/></g><path d="M 194 150 L 206 150 M 162 150 L 140 146 M 238 150 L 260 146" stroke="${frame}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      case 'halfrim':
        return `<g fill="#FFFFFF" fill-opacity="0.14"><ellipse cx="${EYE_LX}" cy="${EYE_Y + 2}" rx="16" ry="13"/><ellipse cx="${EYE_RX}" cy="${EYE_Y + 2}" rx="16" ry="13"/></g><path d="M 162 143 Q 178 136 194 143 M 206 143 Q 222 136 238 143 M 194 146 L 206 146" stroke="${frame}" stroke-width="3.5" fill="none" stroke-linecap="round"/>${temples(143, 140, 3)}`;
      case 'cateye':
        return `<g fill="#FFFFFF" fill-opacity="0.16" stroke="${frame}" stroke-width="3" stroke-linejoin="round"><path d="M 150 136 L 196 146 Q 196 166 178 166 Q 160 165 156 150 Z"/><path d="M 250 136 L 204 146 Q 204 166 222 166 Q 240 165 244 150 Z"/></g><path d="M 196 149 L 204 149 M 152 140 L 140 140 M 248 140 L 260 140" stroke="${frame}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      case 'sunglasses':
        return `<g fill="#1F1F24" fill-opacity="0.9" stroke="${frame}" stroke-width="3"><rect x="${EYE_LX - 17}" y="${EYE_Y - 13}" width="34" height="27" rx="8"/><rect x="${EYE_RX - 17}" y="${EYE_Y - 13}" width="34" height="27" rx="8"/></g><path d="M 166 146 L 174 143 M 210 146 L 218 143" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" opacity="0.5"/><path d="M 195 150 L 205 150 M 161 150 L 140 146 M 239 150 L 260 146" stroke="${frame}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      case 'aviator':
        return `<g fill="#8FB4D9" fill-opacity="0.38" stroke="${frame}" stroke-width="2.2"><path d="M 160 142 Q 178 136 196 142 Q 198 168 178 170 Q 158 168 160 142 Z"/><path d="M 204 142 Q 222 136 240 142 Q 242 168 222 170 Q 202 168 204 142 Z"/></g><path d="M 196 144 Q 200 141 204 144 M 160 144 L 140 142 M 240 144 L 260 142" stroke="${frame}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
      default: return '';
    }
  }

  /* ----------  Tête : couvre-chefs, boucles d'oreilles  ---------- */
  function hat(c) {
    const hc = c.hatColor;
    switch (c.hat) {
      case 'cap': {
        const dark = shade(hc, '#3A66C4', '#2E52A3', 0.2);
        return `<path d="M 136 128 C 136 78 164 60 200 60 C 236 60 264 78 264 128 Z" fill="${hc}"/><path d="M 136 128 C 136 78 164 60 200 60 C 236 60 264 78 264 128 Z" fill="#fff" opacity="0.12"/><ellipse cx="200" cy="128" rx="80" ry="13" fill="${dark}"/><ellipse cx="200" cy="126" rx="80" ry="11" fill="${hc}"/><circle cx="200" cy="62" r="5" fill="${dark}"/>`;
      }
      case 'headphones': {
        const pad = shade(hc, '#2E3440', '#5C6370', 0.3, true);
        return `<path d="M 134 152 C 134 66 266 66 266 152" stroke="${hc}" stroke-width="10" fill="none" stroke-linecap="round"/><rect x="122" y="138" width="26" height="40" rx="11" fill="${hc}"/><rect x="252" y="138" width="26" height="40" rx="11" fill="${hc}"/><rect x="128" y="146" width="10" height="24" rx="5" fill="${pad}"/><rect x="262" y="146" width="10" height="24" rx="5" fill="${pad}"/>`;
      }
      case 'beanie':
        return `<path d="M 136 120 C 136 58 264 58 264 120 L 264 126 L 136 126 Z" fill="${hc}"/><path d="M 150 72 Q 200 56 250 72" stroke="#fff" stroke-width="5" fill="none" opacity="0.15" stroke-linecap="round"/><rect x="132" y="104" width="136" height="24" rx="11" fill="${darken(hc, 0.15)}"/><path d="M 146 108 L 146 124 M 160 106 L 160 126 M 174 105 L 174 127 M 188 104 L 188 128 M 212 104 L 212 128 M 226 105 L 226 127 M 240 106 L 240 126 M 254 108 L 254 124" stroke="${darken(hc, 0.3)}" stroke-width="1.5" opacity="0.5"/><circle cx="200" cy="58" r="12" fill="${lighten(hc, 0.3)}"/>`;
      case 'beret':
        return `<ellipse cx="206" cy="80" rx="72" ry="34" transform="rotate(-8 206 80)" fill="${hc}"/><ellipse cx="196" cy="70" rx="30" ry="12" transform="rotate(-8 196 70)" fill="#fff" opacity="0.14"/><path d="M 142 112 C 170 98 232 96 262 108" stroke="${darken(hc, 0.2)}" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="208" cy="50" r="4" fill="${darken(hc, 0.2)}"/>`;
      case 'bucket':
        return `<path d="M 142 112 C 142 62 258 62 258 112 Z" fill="${hc}"/><path d="M 118 118 C 150 104 250 104 282 118 C 272 136 128 136 118 118 Z" fill="${darken(hc, 0.12)}"/><path d="M 146 108 Q 200 100 254 108" stroke="${darken(hc, 0.25)}" stroke-width="4" fill="none" opacity="0.6"/>`;
      case 'headband':
        return `<path d="M 136 112 C 160 92 240 92 264 112" stroke="${hc}" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M 150 104 Q 200 92 250 104" stroke="#fff" stroke-width="3" fill="none" opacity="0.2"/>`;
      default: return '';
    }
  }

  function hijabBack(c) {
    if (c.hat !== 'hijab') return '';
    return `<path d="M 108 300 C 92 200 130 70 200 66 C 270 70 308 200 292 300 Z" fill="${darken(c.hatColor, 0.12)}"/>`;
  }

  /** Voile par-dessus la racine des cheveux et le cou, troué autour du visage. */
  function hijabFront(c) {
    if (c.hat !== 'hijab') return '';
    const hc = c.hatColor;
    return `<path fill-rule="evenodd" d="M 120 300 C 104 210 136 84 200 80 C 264 84 296 210 280 300 Z M 200 98 C 240 98 258 128 256 168 C 254 206 232 232 200 232 C 168 232 146 206 144 168 C 142 128 160 98 200 98 Z" fill="${hc}"/>
<path d="M 150 120 C 170 100 230 100 250 120" stroke="#fff" stroke-width="4" fill="none" opacity="0.18"/><path d="M 132 250 C 150 230 160 236 162 262 M 268 250 C 250 230 240 236 238 262" stroke="${darken(hc, 0.2)}" stroke-width="2.5" fill="none" opacity="0.5"/>`;
  }

  function earrings(c) {
    if (c.hat === 'hijab') return '';
    const off = earOffset(c);
    const xs = [200 - off, 200 + off];
    switch (c.earrings) {
      case 'studs': return xs.map((x) => `<circle cx="${x}" cy="176" r="4" fill="#F2C14E" stroke="#C9962E" stroke-width="1"/>`).join('');
      case 'hoops': return xs.map((x) => `<circle cx="${x}" cy="184" r="7.5" fill="none" stroke="#F2C14E" stroke-width="2.6"/>`).join('');
      case 'drops': return xs.map((x) => `<path d="M ${x} 176 L ${x} 188" stroke="#C9962E" stroke-width="1.6"/><circle cx="${x}" cy="176" r="2.6" fill="#F2C14E"/><circle cx="${x}" cy="192" r="5" fill="${c.neckColor}" stroke="#C9962E" stroke-width="1.2"/>`).join('');
      default: return '';
    }
  }

  function head(id, c) {
    const off = earOffset(c);
    const ears = c.hat === 'hijab' ? '' : `<ellipse cx="${200 - off}" cy="160" rx="11" ry="15" fill="url(#${id}-skin)"/><ellipse cx="${200 + off}" cy="160" rx="11" ry="15" fill="url(#${id}-skin)"/>
<ellipse cx="${203 - off}" cy="160" rx="5" ry="8" fill="${darken(c.skin, 0.2)}" opacity="0.45"/><ellipse cx="${197 + off}" cy="160" rx="5" ry="8" fill="${darken(c.skin, 0.2)}" opacity="0.45"/>
`;
    return `${ears}${headShape(c, ` fill="url(#${id}-skin)"`)}
<ellipse cx="200" cy="204" rx="38" ry="16" fill="${darken(c.skin, 0.4)}" opacity="0.12" filter="url(#${id}-soft)"/>
<ellipse cx="176" cy="112" rx="20" ry="11" fill="#FFFFFF" opacity="0.26" filter="url(#${id}-soft)"/>`;
  }

  /** Cadrages des vignettes du builder, dans le repère du SVG final. */
  const VIEWBOXES = { face: '105 90 190 190', head: '70 10 260 260' };

  /**
   * @param {Object} configInput  configuration du builder (normalisée ici)
   * @param {Object} [opts]
   * @param {string} [opts.expression='neutral']
   * @param {number} [opts.size]           largeur/hauteur en px (sinon 100 %)
   * @param {boolean} [opts.background=true]
   * @param {string} [opts.viewBox]        cadrage : 'face', 'head' ou une valeur SVG
   * @param {string} [opts.className]
   * @param {string} [opts.id]             préfixe d'identifiants (unique par défaut)
   */
  function renderAvatar(configInput, opts) {
    opts = opts || {};
    const c = normalizeConfig(configInput);
    const ex = EXPRESSIONS[opts.expression] || EXPRESSIONS.neutral;
    const id = opts.id || uid();
    const sizeAttr = opts.size ? ` width="${opts.size}" height="${opts.size}"` : '';
    const viewBox = VIEWBOXES[opts.viewBox] || opts.viewBox || '0 0 400 400';
    const parts = [defs(id, c)];
    if (opts.background !== false) parts.push(background(id, c));
    parts.push(
      '<g transform="translate(200 56) scale(1.18) translate(-200 -52)">',
      `<ellipse cx="200" cy="300" rx="150" ry="60" fill="#000" opacity="0.12" filter="url(#${id}-soft)"/>`,
      torso(id, c),
      collarBack(id, c),
      fitHair(c, hairBack(id, c)),
      hijabBack(c),
      neck(c),
      collarFront(id, c),
      neckwear(c),
      head(id, c),
      facialHair(id, c),
      face(id, c, ex),
      fitHair(c, hairFront(id, c)),
      hijabFront(c),
      glasses(c),
      earrings(c),
      hat(c),
      '</g>',
    );
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice"${sizeAttr} class="avatar-svg${opts.className ? ' ' + opts.className : ''}" role="img" aria-label="Avatar">${parts.join('\n')}</svg>`;
  }

  /* ======================================================================
     Blobs d'émotion (boules colorées avec visage)
     ====================================================================== */
  /* Tracé épais et arrondi utilisé pour les bouches et paupières des blobs. */
  function st(w, d) {
    return `<path d="${d}" fill="none" stroke="#1C1D22" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const SPARK = (x, y) => `<path d="M ${x} ${y - 5} l 1.2 3.8 3.8 1.2 -3.8 1.2 -1.2 3.8 -1.2 -3.8 -3.8 -1.2 3.8 -1.2 z" fill="#FFFFFF"/>`;

  /* Visages placés dans le tiers haut de la boule, comme sur les maquettes. */
  const BLOB_FACES = {
    happy: `<path d="M 40 34 C 40 21 54 21 54 34 Q 47 31 40 34 Z"/><path d="M 66 34 C 66 21 80 21 80 34 Q 73 31 66 34 Z"/>${st(5, 'M 42 42 Q 60 56 78 42')}`,
    calm: `${st(4.5, 'M 40 30 Q 47 36 54 30 M 66 30 Q 73 36 80 30')}${st(4.5, 'M 50 44 Q 60 51 70 44')}`,
    determined: `<path d="M 37 24 L 55 31 L 53 37 C 44 38 38 33 37 24 Z"/><path d="M 83 24 L 65 31 L 67 37 C 76 38 82 33 83 24 Z"/>${st(4.5, 'M 47 47 Q 60 51 74 43')}`,
    focused: `<path d="M 39 29 L 55 29 C 55 39 39 39 39 29 Z"/><path d="M 65 29 L 81 29 C 81 39 65 39 65 29 Z"/>${st(4.5, 'M 50 46 L 70 46')}`,
    surprised: `${st(3.5, 'M 39 21 Q 46 16 53 21 M 67 21 Q 74 16 81 21')}<circle cx="46" cy="30" r="5.5"/><circle cx="74" cy="30" r="5.5"/><ellipse cx="60" cy="45" rx="5" ry="6.5"/>`,
    worried: `${st(3.5, 'M 38 25 L 52 19 M 82 25 L 68 19')}<ellipse cx="46" cy="31" rx="4.5" ry="5"/><ellipse cx="74" cy="31" rx="4.5" ry="5"/>${st(4.5, 'M 45 46 Q 52.5 39 60 46 Q 67.5 53 75 46')}`,
    sleepy: `${st(4.5, 'M 39 31 L 54 31 M 66 31 L 81 31')}${st(4.5, 'M 50 46 L 70 46')}`,
    sparkle: `<ellipse cx="46" cy="31" rx="8" ry="9"/><ellipse cx="74" cy="31" rx="8" ry="9"/>${SPARK(49, 28)}${SPARK(77, 28)}${st(4.5, 'M 49 46 Q 60 54 71 46')}`,
  };

  /**
   * Boule d'émotion : dégradé doux qui se dissout vers le bas, visage noir dans le tiers haut.
   * @param {Object} o  { color, face, size, className, id, label }
   */
  function renderBlob(o) {
    o = o || {};
    const color = HEX_RE.test(o.color || '') ? o.color : '#F6C644';
    const faceSvg = BLOB_FACES[o.face] || BLOB_FACES.happy;
    const id = o.id || uid();
    const sizeAttr = o.size ? ` width="${o.size}" height="${o.size}"` : '';
    const label = o.label
      ? `<text x="60" y="75" text-anchor="middle" font-family="Inter, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" font-size="13" font-weight="600" fill="${darken(color, 0.58)}">${String(o.label).replace(/[&<>"]/g, '')}</text>`
      : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"${sizeAttr} class="blob-svg${o.className ? ' ' + o.className : ''}" aria-hidden="true">
<defs><radialGradient id="${id}-g" cx="50%" cy="66%" r="66%"><stop offset="0" stop-color="${color}"/><stop offset="0.5" stop-color="${mix(color, '#FFFFFF', 0.1)}"/><stop offset="1" stop-color="${lighten(color, 0.55)}"/></radialGradient>
<linearGradient id="${id}-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.6" stop-color="#FFFFFF"/><stop offset="0.96" stop-color="#000000"/></linearGradient>
<mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120"><rect width="120" height="120" fill="url(#${id}-f)"/></mask>
<filter id="${id}-b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>
<g mask="url(#${id}-m)"><circle cx="60" cy="60" r="48" fill="url(#${id}-g)" filter="url(#${id}-b)"/></g>
<g fill="#1C1D22">${faceSvg}</g>${label}</svg>`;
  }

  return {
    SCHEMA, GROUPS, DEFAULT_CONFIG, EXPRESSIONS, EXPRESSION_LABELS, EMOTIONS, BLOB_FACES,
    normalizeConfig, randomConfig, renderAvatar, renderBlob, lighten, darken, mix, optionColor,
  };
}));
