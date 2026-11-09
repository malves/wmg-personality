'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDeck } = require('../src/deck');
const { SLIDES } = require('../public/js/deck-slides');

const slides = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

function setup() {
  const events = [];
  const deck = createDeck({ slides, onChange: (view) => events.push(view) });
  return { deck, events };
}

test('rien ne se passe tant que la présentation n\'est pas lancée', () => {
  const { deck, events } = setup();
  assert.deepEqual(deck.view(), { active: false });
  deck.next();
  deck.prev();
  deck.stop();
  assert.equal(events.length, 0);
});

test('la présentation n\'avance jamais toute seule', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const { deck, events } = setup();
  deck.start();
  t.mock.timers.tick(3600000);
  assert.equal(deck.view().id, 'a');
  assert.equal(events.length, 1);
});

test('Suivant et Précédent déplacent d\'une diapositive et préviennent les écrans', () => {
  const { deck, events } = setup();
  deck.start();
  deck.next();
  deck.next();
  deck.prev();
  assert.equal(deck.view().id, 'b');
  assert.deepEqual(events.map((v) => v.id), ['a', 'b', 'c', 'b']);
  assert.deepEqual(deck.view(), { active: true, index: 1, total: 3, id: 'b' });
});

test('Précédent sur la première diapositive ne change rien', () => {
  const { deck, events } = setup();
  deck.start();
  deck.prev();
  assert.equal(deck.view().id, 'a');
  assert.equal(events.length, 1);
});

test('Suivant sur la dernière diapositive ramène à la carte', () => {
  const { deck, events } = setup();
  deck.start();
  deck.next();
  deck.next();
  deck.next();
  assert.deepEqual(deck.view(), { active: false });
  assert.deepEqual(events.at(-1), { active: false });
});

test('Terminer ramène à la carte, et relancer repart du début', () => {
  const { deck } = setup();
  deck.start();
  deck.next();
  deck.stop();
  assert.deepEqual(deck.view(), { active: false });
  deck.start();
  assert.equal(deck.view().id, 'a');
});

test('le vrai déroulé est cohérent', () => {
  assert.equal(new Set(SLIDES.map((s) => s.id)).size, SLIDES.length);
  for (const s of SLIDES) {
    assert.ok(s.label && s.view, s.id);
    assert.deepEqual(Object.keys(s.blobs).sort(), ['C', 'D', 'I', 'S'], s.id);
  }
});
