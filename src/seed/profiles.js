'use strict';

/**
 * 17 profils DISC (4 purs, 12 combinés, 1 équilibré) et 10 conseils de collaboration par paire.
 * Les champs multi-lignes (strengths, watchouts, how_to_work) utilisent un retour à la ligne par puce.
 * Entièrement modifiables dans l'admin.
 */

const profiles = {
  D: {
    name: 'Le Pionnier', tagline: 'Fonce, décide, obtient des résultats.',
    keywords: 'Décision, Résultats, Audace, Franchise, Énergie',
    description: 'Tu vas droit au but. Les défis te stimulent, les décisions ne te font pas peur et tu préfères agir plutôt qu\'attendre. Tu mesures ta journée aux résultats obtenus, et tu attends des autres la même exigence.',
    strengths: 'Prend des décisions rapidement, même sous pression\nFait avancer les projets et débloque les situations\nAssume les responsabilités et les risques\nDit les choses clairement',
    watchouts: 'Peut paraître brusque ou impatient\nA tendance à sous-estimer le besoin des autres d\'être consultés\nRisque de négliger les détails au profit de la vitesse',
    communication: 'Direct, concis, orienté solutions. Préfère les échanges courts qui aboutissent à une décision. Supporte mal les détours et les réunions sans conclusion.',
    how_to_work: 'Va à l\'essentiel : objectif, options, décision.\nPropose des solutions plutôt que des problèmes.\nSois franc, même en désaccord : c\'est ce qu\'il respecte.\nÉvite de le noyer dans les détails, donne-lui le choix.',
  },
  I: {
    name: 'L\'Enthousiaste', tagline: 'Embarque tout le monde dans l\'aventure.',
    keywords: 'Énergie, Relations, Optimisme, Créativité, Persuasion',
    description: 'Tu as besoin de contact et tu aimes convaincre. Spontané et chaleureux, tu vois le verre à moitié plein et tu entraînes les autres avec toi. Les idées fusent, l\'ambiance compte autant que le résultat.',
    strengths: 'Crée du lien et de l\'enthousiasme dans l\'équipe\nCommunique avec aisance et conviction\nGénère des idées et de l\'énergie nouvelle\nS\'adapte facilement aux imprévus',
    watchouts: 'Peut manquer de suivi une fois l\'enthousiasme retombé\nA tendance à parler plus qu\'à écouter\nRisque de sous-estimer le temps et les détails',
    communication: 'Expressif, chaleureux, souvent en mouvement. Aime raconter, illustrer, partager. Apprécie la reconnaissance et les échanges informels.',
    how_to_work: 'Prends le temps d\'un vrai échange avant d\'entrer dans le sujet.\nLaisse-le exprimer ses idées, puis aide-le à structurer.\nFormalise par écrit ce qui a été décidé.\nReconnais ses contributions, ça le porte.',
  },
  S: {
    name: 'Le Pilier', tagline: 'Fiable, à l\'écoute, toujours là.',
    keywords: 'Fiabilité, Écoute, Patience, Harmonie, Loyauté',
    description: 'On peut compter sur toi. Tu préfères la stabilité au tumulte, tu écoutes avant de parler et tu tiens tes engagements. L\'harmonie du groupe te tient à cœur, et tu avances à un rythme régulier.',
    strengths: 'Fiable et constant dans la durée\nÉcoute sincèrement, apaise les tensions\nTravaille bien en équipe, soutient les autres\nMéthodique et persévérant',
    watchouts: 'Peut résister aux changements brusques\nA du mal à dire non ou à exprimer un désaccord\nRisque de garder ses frustrations pour lui',
    communication: 'Calme, posé, attentif. Préfère les échanges en confiance, sans pression. A besoin de temps pour s\'approprier une nouvelle idée.',
    how_to_work: 'Annonce les changements à l\'avance et explique le pourquoi.\nDemande-lui son avis : il ne le donnera pas forcément spontanément.\nRespecte son rythme, évite les urgences artificielles.\nMontre ta reconnaissance pour sa régularité.',
  },
  C: {
    name: 'L\'Analyste', tagline: 'Précis, rigoureux, jamais à l\'aveugle.',
    keywords: 'Précision, Qualité, Logique, Méthode, Expertise',
    description: 'Tu aimes comprendre avant d\'agir. Les faits, la méthode et la qualité guident tes décisions. Tu préfères avoir raison tranquillement que briller rapidement, et tu te méfies des approximations.',
    strengths: 'Analyse en profondeur, repère les erreurs\nProduit un travail précis et de qualité\nPlanifie et respecte les processus\nReste objectif et factuel',
    watchouts: 'Peut se perdre dans les détails et retarder la décision\nA tendance à paraître froid ou critique\nSupporte mal l\'imprévu et les règles floues',
    communication: 'Factuel, structuré, mesuré. Pose des questions précises et attend des réponses étayées. Préfère l\'écrit et le temps de réflexion.',
    how_to_work: 'Apporte des données et des faits, pas seulement des impressions.\nDonne-lui le temps d\'analyser avant de demander une réponse.\nSois précis dans tes demandes : périmètre, critères, délais.\nAccepte ses questions : elles améliorent le résultat.',
  },
  DI: {
    name: 'Le Conquérant', tagline: 'Ambitieux et entraînant.',
    keywords: 'Ambition, Impact, Leadership, Vitesse, Charisme',
    description: 'Tu combines l\'envie de gagner et le talent d\'embarquer les autres. Tu prends l\'initiative, tu convaincs vite et tu vises haut. Les projets à fort enjeu et les rôles visibles te vont bien.',
    strengths: 'Lance les projets et mobilise autour d\'un objectif\nConvainc et négocie avec aisance\nGarde le cap sous pression\nAime les défis et la nouveauté',
    watchouts: 'Peut s\'impatienter face aux rythmes plus lents\nRisque de promettre plus que ce qui est tenable\nA tendance à négliger l\'analyse et le suivi',
    communication: 'Énergique, direct et persuasif. Parle vite, décide vite. Aime les échanges dynamiques et les interlocuteurs qui répondent du tac au tac.',
    how_to_work: 'Présente-lui l\'objectif et l\'impact avant les détails.\nSois réactif et concret.\nChallenge ses idées avec des faits, il le prendra bien si c\'est rapide.\nAide-le à sécuriser le suivi derrière l\'élan.',
  },
  DS: {
    name: 'Le Bâtisseur', tagline: 'Déterminé, mais sur la durée.',
    keywords: 'Persévérance, Résultats, Fiabilité, Pragmatisme, Engagement',
    description: 'Tu allies détermination et constance. Tu avances méthodiquement vers tes objectifs sans faire de bruit, et tu termines ce que tu commences. On peut compter sur toi pour tenir dans la durée.',
    strengths: 'Tient le cap et termine les projets\nDécide sans précipitation mais sans hésiter\nFiable, solide dans les moments difficiles\nProtège son équipe',
    watchouts: 'Peut s\'entêter sur une position\nExprime peu ses émotions et ses besoins\nRisque de porter trop de choses seul',
    communication: 'Sobre, direct et calme. Peu de mots, mais pesés. Préfère les faits et les engagements clairs aux grands discours.',
    how_to_work: 'Donne-lui des objectifs clairs et de l\'autonomie.\nÉvite de changer les règles en cours de route sans explication.\nSois fiable : il juge sur les actes.\nPrends des nouvelles, il ne se plaindra pas spontanément.',
  },
  DC: {
    name: 'Le Stratège', tagline: 'Exigeant avec les résultats comme avec la méthode.',
    keywords: 'Exigence, Stratégie, Efficacité, Rigueur, Indépendance',
    description: 'Tu veux des résultats, mais des résultats justes. Tu analyses vite, tu décides avec logique et tu attends un haut niveau de qualité. Tu es à l\'aise seul face à un problème complexe.',
    strengths: 'Résout les problèmes complexes avec méthode\nAllie vision et précision\nDécide sur la base de faits\nMaintient un haut niveau d\'exigence',
    watchouts: 'Peut paraître distant ou trop critique\nRisque de sous-estimer la dimension humaine\nA du mal à déléguer ce qu\'il ferait mieux',
    communication: 'Factuel, concis, sans détour. Attend des arguments solides. Peu sensible aux émotions dans l\'échange professionnel.',
    how_to_work: 'Prépare tes dossiers : faits, chiffres, options.\nSois direct et précis, évite le superflu.\nAccepte la critique comme un outil d\'amélioration.\nRappelle-lui l\'impact sur les personnes, il peut l\'oublier.',
  },
  ID: {
    name: 'Le Persuasif', tagline: 'Convainc avec le sourire, et gagne.',
    keywords: 'Persuasion, Confiance, Dynamisme, Réseau, Initiative',
    description: 'Tu as le contact facile et l\'envie d\'aboutir. Tu rallies les autres à tes idées avec enthousiasme, et tu sais être ferme quand il le faut. Les négociations et les lancements sont ton terrain de jeu.',
    strengths: 'Convainc et fédère naturellement\nPrend des initiatives avec assurance\nOuvre des portes, crée des opportunités\nMotive l\'équipe dans les moments clés',
    watchouts: 'Peut privilégier l\'image au fond\nRisque de s\'éparpiller sur trop de fronts\nSupporte mal la routine et les tâches solitaires',
    communication: 'Chaleureux, vif et convaincant. Aime le débat animé, les histoires, les projets ambitieux. Sensible à la reconnaissance.',
    how_to_work: 'Implique-le tôt, il aime co-construire.\nValorise ses idées, puis aide-le à prioriser.\nFixe des points d\'étape pour sécuriser le suivi.\nSois positif : l\'énergie compte pour lui.',
  },
  IS: {
    name: 'Le Fédérateur', tagline: 'Chaleureux, à l\'écoute, de bonne humeur.',
    keywords: 'Bienveillance, Cohésion, Écoute, Optimisme, Confiance',
    description: 'Tu mets les gens à l\'aise. Sociable et attentif, tu crées une ambiance où chacun trouve sa place. Tu préfères la coopération à la compétition et tu sais apaiser les tensions.',
    strengths: 'Crée de la cohésion et de la confiance\nÉcoute avec empathie\nAccompagne et encourage les autres\nGarde le moral de l\'équipe au beau fixe',
    watchouts: 'Évite les conflits, parfois au détriment de la clarté\nPeut avoir du mal à trancher\nRisque de prendre les critiques personnellement',
    communication: 'Chaleureux, ouvert, encourageant. Préfère les échanges en confiance et les retours constructifs. Fuit la confrontation directe.',
    how_to_work: 'Prends soin de la relation avant le sujet.\nSois clair mais bienveillant dans tes retours.\nAide-le à dire non et à poser des limites.\nRemercie-le pour ce qu\'il fait pour le groupe.',
  },
  IC: {
    name: 'Le Diplomate', tagline: 'Convaincant et précis.',
    keywords: 'Diplomatie, Argumentation, Curiosité, Créativité, Nuance',
    description: 'Tu sais présenter les choses avec tact et les étayer avec rigueur. Curieux, tu aimes comprendre et expliquer. Tu convaincs autant par la qualité de tes arguments que par ta manière de les exposer.',
    strengths: 'Explique clairement des sujets complexes\nAllie créativité et méthode\nSait convaincre sans forcer\nS\'intéresse sincèrement aux autres et aux idées',
    watchouts: 'Peut hésiter entre spontanéité et contrôle\nRisque de trop peaufiner avant de partager\nSensible aux critiques sur son travail',
    communication: 'Soigné, pédagogue, nuancé. Aime les échanges d\'idées argumentés. Apprécie qu\'on reconnaisse la qualité de son raisonnement.',
    how_to_work: 'Laisse-lui de l\'espace pour exposer son raisonnement.\nDonne des retours précis et constructifs.\nAssocie-le aux présentations et aux explications.\nAide-le à passer à l\'action sans tout parfaire.',
  },
  SD: {
    name: 'Le Réalisateur', tagline: 'Calme en apparence, déterminé en profondeur.',
    keywords: 'Constance, Détermination, Autonomie, Sérieux, Efficacité',
    description: 'Tu avances avec calme et obstination. Tu n\'as pas besoin de lumière pour obtenir des résultats, et tu préfères prouver par les faits. Tu es solide, autonome et peu impressionnable.',
    strengths: 'Mène les projets à terme sans se disperser\nGarde son calme dans les situations tendues\nAutonome et responsable\nDécide avec bon sens',
    watchouts: 'Peut sembler fermé ou peu expressif\nRésiste aux changements qu\'il juge inutiles\nCommunique peu sur ses difficultés',
    communication: 'Posé, factuel, économe en mots. Préfère l\'action aux discours. Dit les choses sans détour quand c\'est nécessaire.',
    how_to_work: 'Explique le sens des changements avant de les imposer.\nFais-lui confiance et laisse-le organiser son travail.\nSollicite son avis, il est souvent pertinent.\nNe confonds pas son calme avec de l\'indifférence.',
  },
  SI: {
    name: 'Le Conseiller', tagline: 'L\'épaule sur laquelle on peut compter.',
    keywords: 'Soutien, Empathie, Patience, Convivialité, Fidélité',
    description: 'Tu es là pour les autres. Patient et chaleureux, tu écoutes, tu conseilles et tu rassures. Tu préfères un cadre stable et une équipe soudée, où chacun se sent en sécurité.',
    strengths: 'Écoute et accompagne avec sincérité\nFidèle et constant dans ses relations\nApaise les tensions et réconcilie\nCrée un climat de confiance',
    watchouts: 'Peut s\'oublier au profit des autres\nA du mal avec le conflit et les décisions tranchées\nRésiste aux changements rapides',
    communication: 'Doux, attentif, encourageant. Préfère les échanges individuels et les conversations calmes. Sensible au ton employé.',
    how_to_work: 'Prends le temps d\'un échange personnel.\nPrépare-le aux changements avec douceur et explications.\nEncourage-le à exprimer ses besoins.\nMontre que son soutien est vu et apprécié.',
  },
  SC: {
    name: 'Le Coordinateur', tagline: 'Méthodique, fiable, discret.',
    keywords: 'Organisation, Fiabilité, Précision, Calme, Service',
    description: 'Tu aimes que les choses soient bien faites et bien ordonnées. Discret et consciencieux, tu assures la continuité et la qualité sans chercher les projecteurs. On sait que ce que tu prends en charge sera fait.',
    strengths: 'Organise et fiabilise les processus\nTravail soigné et régulier\nCalme et diplomate\nSoutien discret mais essentiel',
    watchouts: 'Peut manquer d\'initiative face à l\'incertitude\nSe met en retrait dans les débats\nSupporte mal la pression et les changements soudains',
    communication: 'Mesuré, précis, respectueux. Préfère l\'écrit et les consignes claires. S\'exprime peu en groupe, davantage en tête-à-tête.',
    how_to_work: 'Donne un cadre clair : priorités, délais, attentes.\nÉvite les changements de dernière minute.\nValorise la qualité de son travail, pas seulement la vitesse.\nInvite-le explicitement à donner son avis.',
  },
  CD: {
    name: 'Le Perfectionniste', tagline: 'Rien ne lui échappe, et il tranche.',
    keywords: 'Exigence, Analyse, Indépendance, Compétence, Lucidité',
    description: 'Tu combines un œil critique et la volonté de trancher. Tu vois ce qui ne va pas, tu le dis, et tu corriges. L\'excellence technique te tient à cœur, et tu préfères travailler avec des gens compétents.',
    strengths: 'Repère les failles et propose des solutions\nDécide sur des bases solides\nDéfend ses positions avec des arguments\nExcellence et rigueur dans l\'exécution',
    watchouts: 'Peut être perçu comme critique ou intransigeant\nTolère mal l\'erreur, la sienne comme celle des autres\nRisque de retarder pour atteindre la perfection',
    communication: 'Précis, argumenté, parfois tranchant. Va droit aux problèmes. Apprécie les échanges fondés sur la compétence et les faits.',
    how_to_work: 'Sois préparé et précis.\nAccueille ses critiques comme des contributions.\nDonne-lui des responsabilités techniques claires.\nAide-le à définir ce qui est « assez bien » pour livrer.',
  },
  CI: {
    name: 'L\'Innovateur', tagline: 'Rigoureux sur le fond, créatif sur la forme.',
    keywords: 'Créativité, Analyse, Curiosité, Pédagogie, Originalité',
    description: 'Tu aimes creuser les sujets et partager ce que tu découvres. Ta rigueur s\'accompagne d\'une vraie curiosité et d\'un goût pour les idées nouvelles. Tu sais rendre le complexe accessible.',
    strengths: 'Allie profondeur d\'analyse et ouverture\nExplique et transmet avec clarté\nImagine des solutions originales et étayées\nS\'adapte à des interlocuteurs variés',
    watchouts: 'Peut se disperser entre exploration et finition\nHésite à défendre ses idées face à l\'opposition\nSensible au jugement sur son travail',
    communication: 'Curieux, nuancé, pédagogue. Aime débattre d\'idées et poser des questions. Préfère un ton constructif.',
    how_to_work: 'Laisse-lui du temps pour explorer, puis cadre la livraison.\nSollicite-le pour expliquer et vulgariser.\nDonne des retours précis et respectueux.\nEncourage-le à défendre ses propositions.',
  },
  CS: {
    name: 'Le Spécialiste', tagline: 'Expert tranquille, précis et fiable.',
    keywords: 'Expertise, Précision, Constance, Méthode, Discrétion',
    description: 'Tu maîtrises ton domaine et tu avances avec méthode. Tu préfères la profondeur à la vitesse, la qualité au bruit. Discret, tu es une référence sur laquelle l\'équipe s\'appuie.',
    strengths: 'Expertise solide et travail minutieux\nFiable et régulier\nRespecte les méthodes et les standards\nCalme et patient',
    watchouts: 'Peut résister aux nouvelles façons de faire\nHésite à prendre des décisions rapides\nSe met peu en avant, au risque d\'être sous-estimé',
    communication: 'Réservé, factuel, précis. Préfère l\'écrit et les échanges préparés. Parle volontiers de son domaine quand on l\'interroge.',
    how_to_work: 'Donne-lui un périmètre clair et stable.\nRespecte son besoin de préparation.\nDemande son expertise explicitement.\nAccompagne les changements avec des explications concrètes.',
  },
  EQ: {
    name: 'Le Caméléon', tagline: 'Un profil équilibré qui s\'adapte.',
    keywords: 'Adaptabilité, Équilibre, Polyvalence, Médiation, Ouverture',
    description: 'Tes quatre dimensions sont proches : tu t\'adaptes au contexte plutôt que d\'imposer un style. Tu peux prendre les commandes, fédérer, soutenir ou analyser selon ce que la situation demande.',
    strengths: 'S\'adapte à des équipes et contextes variés\nComprend les différents styles de travail\nFait le lien entre des profils opposés\nPolyvalent',
    watchouts: 'Peut sembler difficile à cerner\nRisque de ne pas affirmer de préférence ou de position\nPeut s\'épuiser à s\'adapter en permanence',
    communication: 'Souple, à l\'écoute, capable de changer de registre. Ajuste son ton à son interlocuteur.',
    how_to_work: 'Clarifie ce que tu attends de lui : il saura s\'y adapter.\nDemande-lui son avis personnel, pas seulement sa synthèse.\nUtilise-le comme médiateur entre profils différents.\nVeille à ce qu\'il ait aussi un espace à lui.',
  },
};

const pairAdvice = {
  DD: 'Deux profils directs : les décisions seront rapides, les désaccords aussi. Fixez dès le départ qui tranche sur quoi, et gardez en tête que l\'autre n\'est pas un obstacle mais un allié pressé. Un point court et franc vaut mieux qu\'une bataille de positions.',
  DI: 'L\'un pousse vers le résultat, l\'autre vers l\'adhésion. Ensemble, vous allez vite et vous embarquez les autres. Attention à ne pas confondre vitesse et précipitation : prévoyez un moment pour vérifier les détails et le suivi, que ni l\'un ni l\'autre n\'aime spontanément.',
  DS: 'Le rythme est votre principal point de friction : l\'un veut décider maintenant, l\'autre veut comprendre d\'abord. Le profil D gagne à expliquer le pourquoi et à laisser un temps de réflexion ; le profil S gagne à exprimer clairement ses réserves plutôt qu\'à les garder. Complémentarité solide une fois le rythme accordé.',
  DC: 'Vous visez tous les deux l\'efficacité, l\'un par la vitesse, l\'autre par la précision. Le D doit accepter les questions du C comme une sécurité, pas comme un frein ; le C doit accepter de livrer à « assez bien » quand la décision presse. Avec un cadre clair, c\'est un duo redoutable.',
  II: 'Beaucoup d\'énergie, d\'idées et de bonne humeur. Le risque : parler beaucoup et conclure peu. Désignez qui note les décisions et qui assure le suivi, et fixez des échéances concrètes. Votre enthousiasme commun est une force dès qu\'il est canalisé.',
  IS: 'Un duo chaleureux et agréable. L\'I apporte l\'élan, le S la constance. Veillez à ce que l\'harmonie ne masque pas les désaccords : osez les retours francs, avec bienveillance. Le S aidera l\'I à finir, l\'I aidera le S à oser.',
  IC: 'L\'un improvise, l\'autre prépare. Le C peut trouver l\'I superficiel, l\'I peut trouver le C rigide. Transformez cela en complémentarité : l\'I présente et convainc, le C structure et vérifie. Mettez-vous d\'accord sur le niveau de détail attendu avant de commencer.',
  SS: 'Beaucoup de stabilité et d\'écoute, peu de vagues. Le danger est l\'immobilisme : personne ne veut bousculer l\'autre. Fixez-vous des échéances, nommez explicitement les décisions à prendre et prenez l\'habitude de dire ce qui ne va pas.',
  SC: 'Un duo fiable et consciencieux. Vous aimez tous les deux un cadre clair et du temps pour bien faire. Veillez à ne pas trop attendre avant de décider ou d\'alerter, et pensez à solliciter des profils plus rapides quand il faut trancher dans l\'urgence.',
  CC: 'Rigueur au carré : la qualité sera là, les débats seront précis. Attention à l\'analyse sans fin et au désaccord sur les détails. Définissez ensemble ce qui est « suffisant » pour livrer, et acceptez qu\'une bonne décision prise à temps vaut mieux qu\'une décision parfaite prise trop tard.',
};

const consentText = `Ce test de personnalité DISC est proposé dans un cadre de développement d'équipe. Il ne s'agit pas d'une évaluation de tes compétences ni de ta performance : il n'y a pas de bonne ou de mauvaise réponse.

Ton résultat (profil et scores) sera visible par les autres collaborateurs sur la page Équipe, afin que chacun puisse mieux comprendre les modes de fonctionnement de ses collègues.

Tes réponses détaillées ne sont accessibles qu'à l'administrateur. Tu peux à tout moment demander la suppression de ton résultat.`;

module.exports = { profiles, pairAdvice, consentText };
