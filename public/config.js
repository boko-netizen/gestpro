// Paramètres publics de connexion à Supabase.
// À remplir avec les valeurs de : Supabase > Project Settings > API.
// La clé « anon / publishable » est faite pour être publique : la sécurité
// repose sur les règles de la base (RLS). Ne mettez JAMAIS ici la clé
// « service_role / secret ».
window.GESTPRO_CONFIG = {
  supabaseUrl: "https://pzlrmsbamvdjduknawyd.supabase.co",
  supabaseAnonKey: "sb_publishable_g4KZNm9xy-gSdAQUvgqSEA_Nb-3BLAs",
  // Domaine technique des identifiants (doit être identique à LOGIN_DOMAIN
  // de la fonction Edge). L'utilisateur tape « awa », Supabase reçoit
  // « awa@gestpro.local ».
  loginDomain: "gestpro.local",
  nomEntreprise: "MA CAVE",

  // Annonce affichée à l'ouverture du site.
  // Déposez la photo de votre cave dans public/img/ sous le nom cave.jpg
  // (ou changez le nom ci-dessous). Mettez active: false pour la désactiver.
  pub: {
    active: true,
    // "motion" : animation de la cave (logo, bouteilles, catégories, coordonnées)
    // "image"  : l'affiche fixe ci-dessous
    mode: "motion",
    image: "img/cave.jpg",
    duree: 11,                 // en secondes (le motion dure 10 s, puis 1 s sur la carte de fin)
    // "entier" : l'image est affichée en entier (idéal pour une affiche avec du texte)
    // "remplir" : l'image remplit l'écran, quitte à rogner les bords (idéal pour une photo)
    ajustement: "entier",
    afficherTexte: false,      // true = nom et slogan écrits par-dessus l'image
    slogan: "Vins & spiritueux de qualité",
    passable: false,           // true = bouton « Passer » visible
    uneFoisParSession: true,   // true = une seule fois tant que l'onglet reste ouvert
  },
};
