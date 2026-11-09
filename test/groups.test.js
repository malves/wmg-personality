'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/groups');

const person = (id, D, I, S, C) => ({ id, scores: { D, I, S, C }, full: { D, I, S, C } });
const PROFILES = { DI: { name: 'Le Conquérant' }, D: { name: 'Le Pionnier' }, S: { name: 'Le Pilier' }, C: { name: "L'Analyste" }, SC: { name: 'Le Coordinateur' } };

test('une personne qui a peu répondu reste près du centre, puis rejoint sa position', () => {
  const norm = { D: 90, I: 50, S: 30, C: 30 };
  assert.deepEqual(G.provisional(norm, 0), { D: 50, I: 50, S: 50, C: 50 });
  assert.equal(G.provisional(norm, 0.5).D, 70);
  assert.deepEqual(G.provisional(norm, 1), norm);
  const start = G.mapPosition(G.provisional(norm, 0));
  assert.deepEqual([start.x, start.y], [0, 0]);
});

test('chaque dimension tire la carte vers son coin, sans sortir du disque', () => {
  const at = (D, I, S, C) => G.mapPosition({ D, I, S, C });
  assert.ok(at(90, 50, 50, 50).x < 0 && at(90, 50, 50, 50).y < 0, 'D en haut à gauche');
  assert.ok(at(50, 90, 50, 50).x > 0 && at(50, 90, 50, 50).y < 0, 'I en haut à droite');
  assert.ok(at(50, 50, 90, 50).x > 0 && at(50, 50, 90, 50).y > 0, 'S en bas à droite');
  assert.ok(at(50, 50, 50, 90).x < 0 && at(50, 50, 50, 90).y > 0, 'C en bas à gauche');
  const far = at(100, 100, 0, 0);
  assert.ok(Math.hypot(far.x, far.y) <= 1.0001);
});

test('les personnes semblables se regroupent, les profils opposés restent séparés', () => {
  const people = [
    person(1, 80, 60, 30, 30), person(2, 78, 62, 32, 28), person(3, 82, 58, 28, 32),
    person(4, 30, 30, 80, 60), person(5, 28, 32, 78, 62), person(6, 32, 28, 82, 58),
  ];
  const { groups, alone } = G.buildGroups(people, PROFILES);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.members), [[1, 2, 3], [4, 5, 6]]);
  assert.deepEqual(alone, []);
  assert.equal(groups[0].dim, 'D');
  assert.equal(groups[0].name, 'Les Conquérants');
});

test('le résultat ne dépend pas de l\'ordre des personnes', () => {
  const people = [person(1, 70, 50, 40, 40), person(2, 40, 70, 50, 40), person(3, 40, 40, 70, 50), person(4, 72, 48, 42, 38), person(5, 38, 72, 48, 42)];
  const a = G.buildGroups(people, PROFILES);
  const b = G.buildGroups([...people].reverse(), PROFILES);
  assert.deepEqual(a.groups.map((g) => g.members), b.groups.map((g) => g.members));
  assert.deepEqual(a.alone, b.alone);
});

test('une équipe aux scores resserrés garde plusieurs groupes grâce au seuil adaptatif', () => {
  const people = [
    person(1, 62, 50, 44, 44), person(2, 61, 49, 45, 45), person(3, 44, 62, 50, 44),
    person(4, 45, 61, 49, 45), person(5, 44, 44, 62, 50), person(6, 45, 45, 61, 49),
  ];
  assert.ok(G.groupDistance(people) <= G.MAX_DISTANCE);
  assert.ok(G.buildGroups(people, PROFILES).groups.length >= 2);
});

test('au début du test, tout le monde est au centre et forme un seul ensemble', () => {
  const people = [1, 2, 3, 4].map((id) => person(id, 50 + id, 50 - id, 50, 50));
  assert.equal(G.buildGroups(people, PROFILES).groups.length, 1);
});

test('deux groupes de même profil se distinguent par leur deuxième dimension', () => {
  const people = [
    person(1, 95, 70, 30, 5), person(2, 95, 72, 28, 5),
    person(3, 95, 5, 30, 70), person(4, 95, 5, 28, 72),
  ];
  const { groups } = G.buildGroups(people, { DI: { name: 'Le Pionnier' }, DC: { name: 'Le Pionnier' } });
  assert.deepEqual(groups.map((g) => g.label).sort(), ['Les Pionniers · Conformité', 'Les Pionniers · Influence']);
});

test('noms de groupes au pluriel', () => {
  assert.equal(G.pluralName('Le Pionnier'), 'Les Pionniers');
  assert.equal(G.pluralName("L'Analyste"), 'Les Analystes');
  assert.equal(G.pluralName('Le Persuasif'), 'Les Persuasifs');
  assert.equal(G.pluralName('Les Curieux'), 'Les Curieux');
  assert.equal(G.pluralName(''), 'Groupe');
});

test('la vue publique ne transmet ni réponses, ni scores, ni nom de famille', () => {
  const snap = {
    state: 'live',
    counts: { total: 2, notStarted: 1, inProgress: 1, done: 0, answers: 5, expected: 48 },
    people: [{ id: 1, firstName: 'Zoé', lastName: 'SECRET-NOM', avatar: {}, status: 'progress', answered: 5, total: 24, x: 0.1, y: 0.2, group: 1, scores: { D: 91, I: 9, S: 9, C: 9 } }],
    groups: [{ id: 1, key: 'D', dim: 'D', name: 'Les Pionniers', label: 'Les Pionniers', members: [1], mean: { D: 91, I: 9, S: 9, C: 9 } }],
    alone: [],
    feed: [{ userId: 1, name: 'Zoé SECRET-NOM', most: 'SECRET-REPONSE', least: 'SECRET-REPONSE', at: 'x' }],
  };
  const view = G.publicView(snap);
  const text = JSON.stringify(view);
  assert.doesNotMatch(text, /SECRET|scores|mean|feed|answers/);
  assert.equal(view.people[0].firstName, 'Zoé');
  assert.deepEqual(Object.keys(view.people[0]).sort(), ['answered', 'avatar', 'firstName', 'group', 'id', 'profileKey', 'status', 'total', 'x', 'y']);
  assert.deepEqual(view.groups[0], { id: 1, key: 'D', label: 'Les Pionniers', dim: 'D', members: [1] });
});

test('un groupe garde ses membres malgré une petite variation des scores', () => {
  const people = [person(1, 70, 50, 40, 40), person(2, 72, 50, 40, 40), person(3, 90, 50, 40, 40), person(4, 92, 50, 40, 40), person(5, 30, 70, 60, 40), person(6, 28, 70, 60, 40)];
  const threshold = 25;
  const seeds = G.seedGroups(people, [[1, 2, 3], [4], [5, 6]], threshold, 0);
  assert.deepEqual(seeds.map((c) => c.map((p) => p.id)), [[1, 2, 3], [5, 6]]);
  const memory = { groups: [[1, 2, 3], [5, 6]], progress: 0 };
  const { groups } = G.buildGroups(people, {}, memory);
  assert.ok(groups.some((g) => g.members.includes(1) && g.members.includes(3)));
});

test('un membre devenu trop éloigné quitte son groupe, et la marge se resserre en fin de test', () => {
  const people = [person(1, 50, 50, 50, 50), person(2, 52, 50, 50, 50), person(3, 82, 50, 50, 50)];
  assert.deepEqual(G.seedGroups(people, [[1, 2, 3]], 22, 0).map((c) => c.map((p) => p.id).sort()), [[1, 2, 3]]);
  assert.deepEqual(G.seedGroups(people, [[1, 2, 3]], 22, 1).map((c) => c.map((p) => p.id).sort()), [[1, 2]]);
});

test('sans changement de scores, repartir de groupes déjà calculés donne les mêmes groupes', () => {
  const people = [];
  for (let i = 0; i < 24; i++) people.push(person(i + 1, 30 + (i * 37) % 41, 30 + (i * 53) % 41, 30 + (i * 19) % 41, 30 + (i * 71) % 41));
  const first = G.buildGroups(people, {}, null);
  const memory = { groups: first.groups.map((g) => g.members), progress: 1 };
  const second = G.buildGroups(people, {}, memory);
  const third = G.buildGroups(people, {}, { groups: second.groups.map((g) => g.members), progress: 1 });
  const parts = (r) => r.groups.map((g) => g.members.join()).sort();
  assert.deepEqual(parts(third), parts(second));
});
