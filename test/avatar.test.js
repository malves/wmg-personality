'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../public/js/avatar');

/** Vérifie que le SVG est bien formé : pas de valeur manquante, balises équilibrées. */
function checkSvg(svg, label) {
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), `${label} : enveloppe svg`);
  assert.doesNotMatch(svg, /undefined|NaN|\[object/, `${label} : valeur manquante`);
  const opened = (svg.match(/<([a-zA-Z]+)(?=[\s>])[^>]*?(?<!\/)>/g) || []).length;
  const closed = (svg.match(/<\/[a-zA-Z]+>/g) || []).length;
  assert.equal(opened, closed, `${label} : balises ouvertes ${opened}, fermées ${closed}`);
}

const LEGACY = {
  body: 'slim', skin: '#FDE3D0', hair: 'buzz', hairColor: '#F1D28A', eyes: 'round', eyeColor: '#5A8FD6', brows: 'arched',
  facialHair: 'mustache', glasses: 'round', jacket: 'blazer', jacketColor: '#F2C96B', accessory: 'none', background: 'office', backgroundColor: '#EEE6FB',
};

test('une configuration d\'avant les nouvelles options prend les valeurs par défaut, sans l\'ancien champ', () => {
  const c = K.normalizeConfig(LEGACY);
  assert.deepEqual(Object.keys(c).sort(), Object.keys(K.DEFAULT_CONFIG).sort());
  assert.equal(c.faceShape, 'oval');
  assert.equal(c.hair, 'buzz');
  assert.equal(c.hat, 'none');
  assert.ok(!('accessory' in c));
});

test('l\'ancien accessoire unique se répartit entre tête, oreilles et cou', () => {
  assert.equal(K.normalizeConfig({ ...LEGACY, accessory: 'cap' }).hat, 'cap');
  assert.equal(K.normalizeConfig({ ...LEGACY, accessory: 'earrings' }).earrings, 'studs');
  assert.equal(K.normalizeConfig({ ...LEGACY, accessory: 'scarf' }).neck, 'scarf');
  const phones = K.normalizeConfig({ ...LEGACY, accessory: 'headphones' });
  assert.equal(phones.hat, 'headphones');
  assert.equal(phones.hatColor, '#2E3440');
  // Une configuration déjà convertie ne l'est pas une seconde fois.
  assert.equal(K.normalizeConfig({ ...LEGACY, accessory: 'cap', hat: 'beret' }).hat, 'beret');
});

test('les valeurs inconnues retombent sur la valeur par défaut', () => {
  const c = K.normalizeConfig({ faceShape: 'triangle', skin: 'rouge', hat: 42, lips: 'neon' });
  assert.equal(c.faceShape, 'oval');
  assert.equal(c.skin, K.DEFAULT_CONFIG.skin);
  assert.equal(c.hat, 'none');
  assert.equal(c.lips, 'none');
  assert.equal(K.normalizeConfig({ skin: '#abcdef' }).skin, '#ABCDEF');
});

test('chaque option de chaque champ se dessine, seule et combinée, dans toutes les expressions', () => {
  const bases = [
    K.DEFAULT_CONFIG,
    { ...K.DEFAULT_CONFIG, faceShape: 'heart', hair: 'braids', jacket: 'cardigan', hat: 'hijab', neck: 'tie', glasses: 'cateye', facialHair: 'fullbeard', lips: 'red', pattern: 'dots' },
    { ...K.DEFAULT_CONFIG, faceShape: 'square', hair: 'locs', jacket: 'denim', hat: 'beanie', facialHair: 'chinstrap', eyes: 'upturned', lashes: 'long', details: 'freckles' },
  ];
  let count = 0;
  for (const field of K.SCHEMA) {
    for (const opt of field.options) {
      const value = field.type === 'color' ? opt : opt.v;
      for (const base of bases) {
        for (const expression of Object.keys(K.EXPRESSIONS)) {
          checkSvg(K.renderAvatar({ ...base, [field.key]: value }, { expression, id: 't' }), `${field.key}=${value} ${expression}`);
          count++;
        }
      }
    }
  }
  assert.ok(count > 5000, `${count} rendus`);
});

test('le schéma est cohérent : groupes connus, défauts valides, libellés présents', () => {
  const groups = new Set(K.GROUPS.map((g) => g.key));
  for (const field of K.SCHEMA) {
    assert.ok(groups.has(field.group), field.key);
    assert.ok(field.label, field.key);
    if (field.type === 'color') assert.ok(field.options.includes(K.DEFAULT_CONFIG[field.key]), `${field.key} : défaut hors palette`);
    else {
      assert.ok(field.options.some((o) => o.v === K.DEFAULT_CONFIG[field.key]), `${field.key} : défaut inconnu`);
      for (const o of field.options) assert.ok(o.l, `${field.key}=${o.v} sans libellé`);
    }
  }
  assert.equal(K.SCHEMA.find((f) => f.key === 'faceShape').options.length, 5);
});

test('le tirage au sort respecte les clés demandées et évite les options rares', () => {
  const base = { ...K.DEFAULT_CONFIG, hair: 'afro', jacket: 'denim' };
  for (let i = 0; i < 200; i++) {
    const only = K.randomConfig(base, ['eyes', 'brows']);
    assert.equal(only.hair, 'afro');
    assert.equal(only.jacket, 'denim');
    const all = K.randomConfig();
    assert.notEqual(all.hat, 'hijab');
    assert.deepEqual(Object.keys(all).sort(), Object.keys(K.DEFAULT_CONFIG).sort());
  }
});

test('le cadrage des vignettes change la zone visible sans toucher au dessin', () => {
  const full = K.renderAvatar(K.DEFAULT_CONFIG, { id: 't' });
  const face = K.renderAvatar(K.DEFAULT_CONFIG, { id: 't', viewBox: 'face' });
  assert.match(full, /viewBox="0 0 400 400"/);
  assert.match(face, /viewBox="105 90 190 190"/);
  assert.equal(full.replace(/viewBox="[^"]+"/, ''), face.replace(/viewBox="[^"]+"/, ''));
});
