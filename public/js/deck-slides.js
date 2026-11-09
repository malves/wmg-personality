/**
 * Présentation « Démarrer l'explication » : ordre, textes et chorégraphie des quatre boules.
 * Partagé serveur/navigateur, comme avatar.js : le serveur y lit l'ordre des diapositives,
 * la page y lit le reste pour les dessiner.
 *
 * Positions des boules : x et y en % de la scène 16:9, s = échelle (1 = 60 % de la largeur de la scène).
 * Rien ici ne relie une personne à un résultat : les avatars affichés servent de public, jamais d'exemple.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DeckSlides = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  const at = (x, y, s) => ({ x, y, s });

  const FOOT = { D: at(8, 76, 0.28), I: at(36, 104, 0.44), S: at(65, 105, 0.4), C: at(92, 74, 0.28) };
  const ROW = { D: at(14, 79, 0.19), I: at(38, 79, 0.19), S: at(62, 79, 0.19), C: at(86, 79, 0.19) };
  const CORNERS = { D: at(7, 14, 0.15), I: at(93, 14, 0.15), S: at(93, 86, 0.15), C: at(7, 86, 0.15) };
  const HUB = { D: at(68, 50, 0.05), I: at(70, 50, 0.05), S: at(70, 52, 0.05), C: at(68, 52, 0.05) };
  const QUADRANTS = { D: at(54.5, 27, 0.2), I: at(81.5, 27, 0.2), S: at(81.5, 73, 0.2), C: at(54.5, 73, 0.2) };
  const PEEK = { D: at(62, 11, 0.1), I: at(70, 8, 0.12), S: at(79, 8, 0.11), C: at(87, 11, 0.09) };

  /** La boule présentée occupe la droite, les trois autres patientent en bas à gauche. */
  function spotlight(dim) {
    const others = ['D', 'I', 'S', 'C'].filter((d) => d !== dim);
    const pose = { [dim]: at(73, 54, 0.66) };
    others.forEach((d, i) => { pose[d] = at(9 + i * 7, 88, 0.075); });
    return pose;
  }

  const dimension = (key, label, say, ask, chips) => ({
    id: key, label, view: 'dim', dim: key, eyebrow: `${key} comme`, title: label, say, ask, chips, blobs: spotlight(key),
  });

  const SLIDES = [
    {
      id: 'hello', label: 'Bonjour', view: 'hello', sky: '#BFE1FF',
      eyebrow: 'Avant de commencer',
      say: ['On va parler de vous.', 'Enfin, de votre façon de fonctionner ensemble.'],
      blobs: FOOT,
    },
    {
      id: 'printer', label: 'L\'imprimante', view: 'scene', sky: '#FFE9B8',
      eyebrow: 'Même situation, quatre réactions',
      say: ['L\'imprimante lâche', 'cinq minutes avant la réunion.'],
      lines: {
        D: 'Tant pis, on envoie le PDF. Suivant !',
        I: 'Venez voir, elle fait un bruit incroyable !',
        S: 'Pas de panique, je reste avec toi.',
        C: 'Erreur E-42. Page 86 du manuel.',
      },
      blobs: ROW,
    },
    {
      id: 'what', label: 'Le DISC', view: 'statement', sky: '#D9EEFF',
      eyebrow: 'Le DISC',
      title: 'Personne n\'a tort.',
      say: ['On ne fonctionne juste pas pareil.', 'Le DISC met des mots sur ces différences.'],
      note: 'Un modèle imaginé en 1928 par William Marston, qui a aussi créé Wonder Woman.',
      blobs: CORNERS,
    },
    {
      id: 'axes', label: 'Deux questions', view: 'axes', sky: '#E4E2FF',
      eyebrow: 'Comment ça marche',
      title: 'Tout part de deux questions.',
      questions: ['Vous allez plutôt vite, ou plutôt posément ?', 'Vous pensez d\'abord aux tâches, ou d\'abord aux personnes ?'],
      conclusion: 'Deux axes, quatre grandes tendances.',
      ends: { top: 'Plutôt vif', bottom: 'Plutôt posé', left: 'Tâches', right: 'Personnes' },
      blobs: HUB,
      beats: [{ at: 5400, blobs: QUADRANTS }],
    },
    dimension('D', 'Dominance', ['Va droit au but.', 'Décide vite et aime les défis.'], 'Quel est l\'objectif ?', ['Action', 'Décision', 'Résultats']),
    dimension('I', 'Influence', ['Embarque tout le monde.', 'Communique, motive, met de l\'énergie.'], 'Qui on embarque ?', ['Relations', 'Enthousiasme', 'Persuasion']),
    dimension('S', 'Stabilité', ['Fait tenir le groupe.', 'Écoute, soutient, apporte du calme.'], 'Comment on fait ensemble ?', ['Coopération', 'Patience', 'Fiabilité']),
    dimension('C', 'Conformité', ['Vérifie que c\'est juste.', 'Analyse, structure, soigne les détails.'], 'Pourquoi comme ça ?', ['Qualité', 'Précision', 'Analyse']),
    {
      id: 'mix', label: 'Les nuances', view: 'mix', sky: '#F3E4FF',
      eyebrow: 'Le plus important',
      title: 'Personne n\'est d\'une seule couleur.',
      say: ['On a tous les quatre en nous,', 'dans des proportions différentes. Aucune n\'est meilleure qu\'une autre.'],
      blobs: { D: at(42, 54, 0.3), I: at(54, 50, 0.2), S: at(58, 62, 0.16), C: at(46, 66, 0.14) },
      beats: [
        { at: 2800, blobs: { D: at(45, 62, 0.15), I: at(52, 48, 0.32), S: at(60, 60, 0.18), C: at(42, 52, 0.17) } },
        { at: 5600, blobs: { D: at(58, 52, 0.14), I: at(43, 62, 0.16), S: at(48, 50, 0.3), C: at(58, 64, 0.2) } },
      ],
    },
    {
      id: 'survey', label: 'Le test', view: 'survey', sky: '#D6F3E2',
      eyebrow: 'Le test',
      say: ['{blocks} séries de 4 propositions.', 'À chaque fois, vous choisissez ce qui vous ressemble le plus, puis le moins.'],
      tip: 'Pas de bonne réponse : votre premier réflexe est le bon.',
      sample: 'Exemple pour rire',
      demo: [
        { items: ['Je commande pour toute la table', 'Je raconte une anecdote', 'J\'attends que chacun ait choisi', 'Je lis toute la carte'], most: 1, least: 3 },
        { items: ['Je réserve le jour même', 'J\'invite tout le monde', 'Je suis le groupe', 'Je prépare un tableur'], most: 3, least: 0 },
      ],
      blobs: PEEK,
    },
    {
      id: 'map', label: 'La carte', view: 'map', sky: '#EAF4FF',
      eyebrow: 'Pendant que vous répondez',
      say: ['Votre avatar part du centre', 'et rejoint sa zone au fil de vos réponses.'],
      then: 'Les groupes se forment en direct, et deviennent définitifs quand tout le monde a terminé.',
      sample: 'Exemple, pas vos résultats',
      blobs: CORNERS,
    },
    {
      id: 'go', label: 'À vous', view: 'go', sky: '#BFE1FF',
      title: 'À vous de jouer',
      titleDone: 'Voyons ce que ça donne',
      points: ['Pas une évaluation', 'Pas de bonne réponse', 'L\'équipe voit votre profil, pas vos réponses'],
      say: ['Le détail de chaque groupe ?', 'On le verra ensemble, juste après.'],
      blobs: FOOT,
    },
  ];

  return { SLIDES };
}));
