'use strict';

/**
 * Position de la présentation « Démarrer l'explication ».
 * L'admin avance à la main, avec les flèches du clavier ou la télécommande : rien ne défile tout seul.
 * Le serveur retient seulement la diapositive affichée, pour garder les écrans synchronisés et
 * renseigner un écran ouvert en cours de route. L'état reste en mémoire : après un redémarrage,
 * tout le monde revient simplement à la carte.
 */

const { SLIDES } = require('../public/js/deck-slides');

const ACTIONS = ['start', 'next', 'prev', 'stop'];

function createDeck({ slides = SLIDES, onChange = () => {} } = {}) {
  let index = -1; // -1 : aucune présentation en cours

  const active = () => index >= 0;

  function view() {
    if (!active()) return { active: false };
    return { active: true, index, total: slides.length, id: slides[index].id };
  }

  function goTo(i) {
    index = i;
    onChange(view());
  }

  function start() {
    goTo(0);
  }

  /** Avancer depuis la dernière diapositive termine la présentation. */
  function next() {
    if (active()) goTo(index + 1 < slides.length ? index + 1 : -1);
  }

  function prev() {
    if (index > 0) goTo(index - 1);
  }

  function stop() {
    if (active()) goTo(-1);
  }

  return { start, next, prev, stop, view };
}

module.exports = { ACTIONS, createDeck };
