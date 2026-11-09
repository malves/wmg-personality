'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderRadar, pointFor, CENTER } = require('../src/radar');

const SCORES = { D: 80, I: 40, S: 60, C: 20 };

test('D en haut à gauche, S en bas à droite, valeur 0 au centre', () => {
  const [dx, dy] = pointFor('D', 100);
  const [sx, sy] = pointFor('S', 100);
  assert.ok(dx < CENTER[0] && dy < CENTER[1]);
  assert.ok(sx > CENTER[0] && sy > CENTER[1]);
  assert.deepEqual(pointFor('I', 0).map(Math.round), CENTER);
});

test('les valeurs hors bornes sont ramenées entre 0 et 100', () => {
  assert.deepEqual(pointFor('D', 250), pointFor('D', 100));
  assert.deepEqual(pointFor('D', -10), pointFor('D', 0));
});

test('une série : valeurs lisibles, pas de légende', () => {
  const svg = renderRadar({ series: [{ scores: SCORES, stroke: '#D5493E', fill: '#D5493E' }] });
  assert.match(svg, />80</);
  assert.match(svg, /aria-label="Dominance 80, Influence 40, Stabilité 60, Conformité 20"/);
  assert.doesNotMatch(svg, /<line x1="70"/);
});

test('deux séries : légende, tracé pointillé, prénom échappé', () => {
  const svg = renderRadar({ series: [
    { label: 'Toi', scores: SCORES, stroke: '#2A2D38' },
    { label: '<b>Zoé</b>', scores: { D: 10, I: 90, S: 30, C: 70 }, stroke: '#7A5FD0', dash: '6 4' },
  ] });
  assert.match(svg, />80 · 10</);
  assert.match(svg, /stroke-dasharray="6 4"/);
  assert.match(svg, /&lt;b&gt;Zoé&lt;\/b&gt;/);
  assert.doesNotMatch(svg, /<b>Zoé/);
});

test('la roue DISC place chaque score dans son quart et liste les quatre dimensions', () => {
  const { renderDiscWheel, wheelPoint } = require('../src/radar');
  const scores = { D: 50, I: 42, S: 46, C: 63 };
  const [dx, dy] = wheelPoint('D', 100);
  const [ix, iy] = wheelPoint('I', 100);
  const [sx, sy] = wheelPoint('S', 100);
  const [cx, cy] = wheelPoint('C', 100);
  assert.ok(dx < 160 && dy < 160, 'D en haut à gauche');
  assert.ok(ix > 160 && iy < 160, 'I en haut à droite');
  assert.ok(sx > 160 && sy > 160, 'S en bas à droite');
  assert.ok(cx < 160 && cy > 160, 'C en bas à gauche');
  assert.deepEqual(wheelPoint('D', 0).map((n) => Math.round(n)), [160, 160]);
  const dist = (v) => Math.hypot(wheelPoint('S', v)[0] - 160, wheelPoint('S', v)[1] - 160);
  assert.equal(Math.round(dist(50)), 56, '50 reste sur le cercle neutre');
  assert.ok(dist(63) > dist(50) && dist(42) < dist(50), 'les écarts à 50 restent dans le bon sens');
  assert.equal(Math.round(dist(100)), 112, 'le maximum reste dans le disque');
  const svg = renderDiscWheel({ scores });
  assert.match(svg, /aria-label="Dominance 50, Influence 42, Stabilité 46, Conformité 63"/);
  assert.equal((svg.match(/<title>/g) || []).length, 4);
});
