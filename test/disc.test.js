'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const disc = require('../src/disc');

function repeat(choice, n) { return Array.from({ length: n }, () => ({ ...choice })); }

test('profil pur : 24 blocs « plus D / moins C »', () => {
  const s = disc.computeScores(repeat({ most: 'D', least: 'C' }, 24));
  assert.equal(s.answered, 24);
  assert.deepEqual(s.raw, { D: 24, I: 0, S: 0, C: -24 });
  assert.deepEqual(s.norm, { D: 100, I: 50, S: 50, C: 0 });
  assert.equal(disc.resolveProfile(s.norm), 'D');
});

test('profil combiné : D et I hauts, égalité tranchée par l\'ordre D I S C', () => {
  const choices = [...repeat({ most: 'D', least: 'S' }, 12), ...repeat({ most: 'I', least: 'S' }, 12)];
  const s = disc.computeScores(choices);
  assert.deepEqual(s.norm, { D: 75, I: 75, S: 0, C: 50 });
  assert.equal(disc.resolveProfile(s.norm), 'DI');
  assert.deepEqual(disc.orderedDims(s.norm), ['D', 'I', 'C', 'S']);
});

test('secondaire sous le seuil : profil pur', () => {
  const choices = [
    ...repeat({ most: 'D', least: 'I' }, 8),
    ...repeat({ most: 'D', least: 'S' }, 8),
    ...repeat({ most: 'D', least: 'C' }, 8),
  ];
  const s = disc.computeScores(choices);
  assert.equal(s.norm.D, 100);
  assert.equal(s.norm.I, 33);
  assert.equal(disc.resolveProfile(s.norm), 'D');
});

test('blocs passés ignorés, aucun bloc répondu => tout à 50 et profil EQ', () => {
  const s = disc.computeScores([{ skipped: true }, { skipped: true }, null]);
  assert.equal(s.answered, 0);
  assert.deepEqual(s.norm, { D: 50, I: 50, S: 50, C: 50 });
  assert.equal(disc.resolveProfile(s.norm), 'EQ');
});

test('profil équilibré quand les plus et les moins se compensent', () => {
  const choices = [
    { most: 'D', least: 'I' }, { most: 'I', least: 'D' },
    { most: 'S', least: 'C' }, { most: 'C', least: 'S' },
  ];
  const s = disc.computeScores(choices);
  assert.deepEqual(s.raw, { D: 0, I: 0, S: 0, C: 0 });
  assert.equal(disc.resolveProfile(s.norm), 'EQ');
});

test('un bloc avec une dimension invalide est ignoré', () => {
  const s = disc.computeScores([{ most: 'X', least: 'D' }, { most: 'D', least: 'C' }]);
  assert.equal(s.answered, 1);
});

test('clé de paire non ordonnée', () => {
  assert.equal(disc.pairKey('S', 'D'), 'DS');
  assert.equal(disc.pairKey('C', 'C'), 'CC');
  assert.equal(disc.pairKey('I', 'D'), 'DI');
});

test('expression et couleur du profil', () => {
  assert.equal(disc.profileExpression('DI'), 'proud');
  assert.equal(disc.profileExpression('EQ'), 'wink');
  assert.equal(disc.profileColor('SC'), disc.DIMENSIONS.S.color);
  assert.equal(disc.primaryOf('EQ'), null);
});
