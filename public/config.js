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
};
