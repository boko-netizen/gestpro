/* GestPro – espace de gestion de la cave (Supabase + Cloudflare Pages)
 * Toutes les règles de sécurité sont appliquées par la base (RLS, fonctions
 * contrôlées côté serveur) et par la fonction Edge « admin-users » :
 * l'interface ne fait que masquer ce qui ne concerne pas le rôle.
 * Ce fichier : noyau (connexion, menu, recherche, notifications, écrans
 * génériques). Les modules gestion-caisse.js, gestion-stock.js et
 * gestion-stats.js ajoutent leurs écrans dans GP.vues. */
(() => {
  'use strict';

  const CFG = window.GESTPRO_CONFIG || {};
  const GP = (window.GP = window.GP || {});
  GP.vues = GP.vues || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  const fcfa = (n) => nf.format(Math.round(Number(n) || 0)) + ' FCFA';
  const dateFr = (d) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('fr-FR') : '');
  const dateHeureFr = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const isoLocal = (dt) => new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const aujourdhui = () => isoLocal(new Date());
  const normaliser = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const icone = (nom, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${nom}"/></svg>`;
  const attendre = (fn, ms = 200) => { let m = 0; return (...a) => { clearTimeout(m); m = setTimeout(() => fn(...a), ms); }; };
  const reduit = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ROLES = { admin: 'Administrateur', gestionnaire: 'Gestionnaire', caissier: 'Caissier', lecteur: 'Lecteur' };
  const PAIEMENTS = ['Espèces', 'Mobile Money', 'Carte bancaire', 'Virement', 'Chèque', 'Crédit'];
  const CATEGORIES_PRODUITS = ['Champagnes', 'Vins', 'Spiritueux', 'Liqueurs', 'Bières', 'Sodas & jus', 'Eaux minérales', 'Énergie & sport', 'Épicerie fine', 'Confiseries', 'Snacks', 'Cadeaux'];
  const EMBALLAGES = ['Bouteille', 'Canette', 'Brique', 'Pack', 'Carton', 'Casier', 'Fût', 'Coffret', 'Sachet', 'Autre'];
  const COULEURS_STATUT = {
    'en attente': 'orange', 'reçue': 'vert', 'annulée': 'rouge', 'validée': 'vert',
    'en préparation': 'orange', 'en cours': 'bleu', 'livrée': 'vert',
    'Particulier': '', 'Professionnel': 'bleu', 'Revendeur': 'or',
  };

  /* ------------------------------------------------------------------
   * Description des entités : l'écran liste + formulaire est généré ici
   * ------------------------------------------------------------------ */
  const ENTITES = {
    clients: {
      titre: 'Clients', article: 'un client', ordre: [['nom', true]], icone: 'clients', ajoutCaissier: true,
      champs: [
        { k: 'nom', l: 'Nom / raison sociale', req: true, large: true, principal: true },
        { k: 'type_client', l: 'Type', type: 'select', opts: ['Particulier', 'Professionnel', 'Revendeur'], defaut: () => 'Particulier', badge: true },
        { k: 'telephone', l: 'Téléphone', type: 'tel' },
        { k: 'email', l: 'E-mail', type: 'email' },
        { k: 'adresse', l: 'Adresse', large: true },
        { k: 'notes', l: 'Notes', type: 'textarea', liste: false },
      ],
      actionsLigne: (r) => [{ cle: 'historique', icone: 'historique', titre: 'Achats et crédits du client', action: () => GP.historiqueClient?.(r) }],
    },
    ventes: {
      titre: 'Ventes (détail)', article: 'une vente', ordre: [['date', false], ['id', false]], icone: 'ventes',
      champs: [
        { k: 'date', l: 'Date', type: 'date', req: true, defaut: aujourdhui },
        { k: 'ticket_id', l: 'Ticket', form: false, calc: (r) => (r.ticket_id ? `n°${r.ticket_id}` : 'saisie manuelle') },
        { k: 'client_id', l: 'Client', type: 'ref', ref: 'clients' },
        { k: 'produit_id', l: 'Produit', type: 'ref', ref: 'produits', req: true, large: true, saisie: true, principal: true,
          aide: 'Tapez le nom du produit : les produits du stock vous sont proposés au fur et à mesure.' },
        { k: 'quantite', l: 'Quantité (unités)', type: 'number', req: true, min: 1, num: true },
        { k: 'prix_unitaire', l: 'Prix unitaire', type: 'money', req: true },
        { k: 'net', l: 'Montant net', type: 'money', form: false, total: true, calc: (r) => (r.annulee ? 0 : Number(r.montant) - Number(r.remise || 0)) },
        { k: 'mode_paiement', l: 'Paiement', type: 'select', opts: PAIEMENTS.filter((m) => m !== 'Crédit'), defaut: () => 'Espèces' },
        { k: 'annulee', l: 'État', form: false, calc: (r) => (r.annulee ? 'annulée' : 'validée'), badge: true },
        { k: 'notes', l: 'Notes', type: 'textarea', liste: false },
      ],
      surChange: { produit_id: (form, p) => { if (p && !form.prix_unitaire.value) form.prix_unitaire.value = p.prix_vente; } },
      modifiable: (r) => !r.ticket_id && !r.annulee,
      classeLigne: (r) => (r.annulee ? 'annulee' : ''),
      aide: 'Chaque ligne vendue, y compris celles de la caisse (modifiables uniquement en annulant le ticket). La saisie manuelle reste possible : le stock baisse automatiquement et la vente est refusée si le stock est insuffisant.',
    },
    commandes: {
      titre: 'Achats fournisseurs', article: 'un achat', ordre: [['date', false], ['id', false]], icone: 'achats',
      champs: [
        { k: 'date', l: 'Date', type: 'date', req: true, defaut: aujourdhui },
        { k: 'reference_achat', l: 'N° de bon', liste: true },
        { k: 'fournisseur_id', l: 'Fournisseur', type: 'ref', ref: 'fournisseurs' },
        { k: 'produit_id', l: 'Produit', type: 'ref', ref: 'produits', req: true, large: true, saisie: true, creerSiAbsent: true, principal: true,
          aide: 'Tapez le nom du produit. S’il n’existe pas encore, il sera ajouté automatiquement au stock.' },
        { k: 'quantite', l: 'Quantité (unités)', type: 'number', req: true, min: 1, num: true },
        { k: 'prix_unitaire', l: "Prix d'achat unitaire", type: 'money' },
        { k: 'montant', l: 'Montant', type: 'money', form: false, total: true },
        { k: 'montant_paye', l: 'Montant payé', type: 'money', defaut: () => 0, total: true },
        { k: 'reste', l: 'Reste à payer', type: 'money', form: false, total: true, calc: (r) => (r.statut === 'annulée' ? 0 : Math.max(0, Number(r.montant) - Number(r.montant_paye || 0))) },
        { k: 'statut', l: 'Réception', type: 'select', opts: ['en attente', 'reçue', 'annulée'], defaut: () => 'en attente', badge: true },
        { k: 'date_reception', l: 'Reçue le', type: 'date', form: false, liste: false },
        { k: 'notes', l: 'Notes', type: 'textarea', liste: false },
      ],
      surChange: {
        produit_id: (form, p) => {
          if (!p) return;
          if (!form.prix_unitaire.value) form.prix_unitaire.value = p.prix_achat;
          if (!form.fournisseur_id.value && p.fournisseur_id) form.fournisseur_id.value = p.fournisseur_id;
        },
      },
      actionsLigne: (r) => [
        ...(r.statut === 'en attente' ? [{ cle: 'recevoir', icone: 'ok', titre: 'Marquer comme reçu (le stock augmente)', action: () => GP.receptionner?.(r) }] : []),
        ...(r.statut !== 'annulée' && Number(r.montant) > Number(r.montant_paye || 0) ? [{ cle: 'payer', icone: 'credit', titre: 'Enregistrer un paiement au fournisseur', action: () => GP.payerAchat?.(r) }] : []),
      ],
      boutonsEntete: () => [{ id: 'btn-nouvel-achat', libelle: 'Achat de plusieurs produits', icone: 'achats', action: () => GP.nouvelAchat?.() }],
      aide: 'Au statut « reçue », la quantité entre en stock une seule fois et le prix d’achat moyen du produit est recalculé (coût moyen pondéré). Une réception annulée retire la quantité du stock.',
    },
    depenses: {
      titre: 'Dépenses', article: 'une dépense', ordre: [['date', false], ['id', false]], icone: 'depenses',
      champs: [
        { k: 'date', l: 'Date', type: 'date', req: true, defaut: aujourdhui },
        { k: 'libelle', l: 'Libellé', req: true, large: true, principal: true },
        { k: 'categorie', l: 'Catégorie', type: 'liste', opts: ['Loyer', 'Salaires', 'Électricité', 'Eau', 'Transport', 'Carburant', 'Frais de livraison', 'Fournitures', 'Impôts et taxes', 'Entretien', 'Communication', 'Achats de marchandises', 'Autre'] },
        { k: 'montant', l: 'Montant', type: 'money', req: true, total: true },
        { k: 'mode_paiement', l: 'Paiement', type: 'select', opts: PAIEMENTS.filter((m) => m !== 'Crédit'), defaut: () => 'Espèces' },
        { k: 'notes', l: 'Notes / n° du justificatif', type: 'textarea', liste: false },
      ],
      aide: 'Frais de fonctionnement de la cave. La catégorie « Achats de marchandises » n’est pas déduite du bénéfice (le coût des boissons vendues l’est déjà) : utilisez de préférence « Achats fournisseurs » pour les boissons.',
    },
    livraisons: {
      titre: 'Livraisons', article: 'une livraison', ordre: [['date', false], ['id', false]], icone: 'livraisons',
      champs: [
        { k: 'date', l: 'Date', type: 'date', req: true, defaut: aujourdhui },
        { k: 'client_id', l: 'Client', type: 'ref', ref: 'clients', principal: true },
        { k: 'vente_id', l: 'Vente liée', type: 'ref', ref: 'ventes', sansJointure: true },
        { k: 'adresse', l: 'Adresse de livraison', large: true },
        { k: 'livreur', l: 'Livreur' },
        { k: 'frais', l: 'Frais de livraison', type: 'money' },
        { k: 'statut', l: 'Statut', type: 'select', opts: ['en préparation', 'en cours', 'livrée', 'annulée'], defaut: () => 'en préparation', badge: true },
        { k: 'notes', l: 'Notes', type: 'textarea', liste: false },
      ],
      surChange: { client_id: (form, c) => { if (c && !form.adresse.value && c.adresse) form.adresse.value = c.adresse; } },
    },
    produits: {
      titre: 'Produits et stock', article: 'un produit', ordre: [['designation', true]], icone: 'produits', parPage: 50,
      champs: [
        { k: 'photo_url', l: 'Photo', type: 'photo' },
        { k: 'designation', l: 'Nom de la boisson', req: true, large: true, principal: true,
          calcHTML: (r) => `<span class="produit-cellule"><strong>${esc(r.designation)}</strong><small>${esc([r.marque, r.contenance, r.emballage].filter(Boolean).join(' · ') || r.reference || '')}</small></span>` },
        { k: 'marque', l: 'Marque', liste: false },
        { k: 'categorie', l: 'Catégorie', type: 'liste', opts: CATEGORIES_PRODUITS },
        { k: 'contenance', l: 'Contenance', type: 'liste', opts: ['25 cl', '33 cl', '50 cl', '65 cl', '70 cl', '75 cl', '1 L', '1,5 L', '2 L', '5 L'], liste: false },
        { k: 'emballage', l: 'Emballage', type: 'select', opts: EMBALLAGES, vide: '— Non précisé —', liste: false },
        { k: 'reference', l: 'Référence interne', liste: false },
        { k: 'code_barres', l: 'Code-barres', liste: false, aide: 'Scannez ou tapez le code : il permet de retrouver le produit instantanément à la caisse.' },
        { k: 'quantite', l: 'Stock', type: 'number', min: 0, defaut: () => 0, num: true, creationSeulement: true,
          aideCreation: 'Stock de départ. Ensuite, le stock change par les ventes, les réceptions et « Ajuster le stock ».',
          calcHTML: (r) => `<span class="badge ${r.quantite <= 0 ? 'rouge' : r.quantite <= r.seuil_alerte ? 'orange' : 'vert'}">${nf.format(r.quantite)}</span>` },
        { k: 'seuil_alerte', l: "Seuil d'alerte", type: 'number', min: 0, defaut: () => 5, num: true },
        { k: 'prix_achat', l: "Prix d'achat (moyen)", type: 'money', defaut: () => 0 },
        { k: 'prix_vente', l: 'Prix de vente (unité)', type: 'money', defaut: () => 0 },
        { k: 'fournisseur_id', l: 'Fournisseur', type: 'ref', ref: 'fournisseurs', liste: false },
        { k: 'date_peremption', l: 'Date de péremption', type: 'date', liste: false },
        { k: 'actif', l: 'Statut', type: 'bool', defaut: () => true, oui: 'Actif : vendu en caisse', non: 'Archivé : plus vendu', badgeOui: 'Actif', badgeNon: 'Archivé' },
        { k: 'visible_site', l: 'Sur le site', type: 'bool', defaut: () => false, oui: 'Oui : affiché dans la boutique en ligne', non: 'Non : pas affiché sur le site', badgeOui: 'En ligne', badgeNon: 'Non' },
        { k: 'description', l: 'Description pour le site', type: 'textarea', liste: false, max: 1000 },
      ],
      classeLigne: (r) => (r.quantite <= 0 ? 'alerte' : r.quantite <= r.seuil_alerte ? 'attention' : ''),
      filtres: [
        { k: 'categorie', l: 'Catégorie', options: (rows) => [...new Set(rows.map((r) => r.categorie).filter(Boolean))].sort(), test: (r, v) => r.categorie === v },
        { k: 'etat', l: 'État du stock', options: () => ['Stock faible', 'Rupture', 'Péremption sous 30 jours', 'Archivés', 'Sur le site'],
          test: (r, v) => ({
            'Stock faible': r.quantite > 0 && r.quantite <= r.seuil_alerte, 'Rupture': r.quantite <= 0,
            'Péremption sous 30 jours': r.date_peremption && r.date_peremption <= isoLocal(new Date(Date.now() + 30 * 864e5)),
            'Archivés': !r.actif, 'Sur le site': r.visible_site,
          }[v]) },
      ],
      tris: [['designation', 'Nom'], ['prix_vente', 'Prix croissant'], ['-prix_vente', 'Prix décroissant'], ['quantite', 'Stock le plus bas'], ['-created_at', 'Ajoutés récemment']],
      actionsLigne: (r) => [
        { cle: 'stock', icone: 'mouvements', titre: 'Ajuster le stock (entrée, perte, casse, inventaire…)', action: () => GP.ajusterStock?.(r) },
        { cle: 'packs', icone: 'boite', titre: 'Conditionnements (pack, carton, casier)', action: () => GP.conditionnements?.(r) },
        { cle: 'hist', icone: 'historique', titre: 'Historique des mouvements', action: () => GP.historiqueProduit?.(r), lecture: true },
      ],
      aide: 'Lignes orange : stock faible ; lignes rouges : rupture. Le stock est compté à l’unité (bouteille, canette…). Les packs et cartons se définissent avec le bouton « Conditionnements » et retirent le bon nombre d’unités à la vente.',
    },
    fournisseurs: {
      titre: 'Fournisseurs', article: 'un fournisseur', ordre: [['nom', true]], icone: 'fournisseurs',
      champs: [
        { k: 'nom', l: 'Nom / raison sociale', req: true, large: true, principal: true },
        { k: 'contact', l: 'Personne à contacter' },
        { k: 'telephone', l: 'Téléphone', type: 'tel' },
        { k: 'email', l: 'E-mail', type: 'email' },
        { k: 'adresse', l: 'Adresse', large: true, liste: false },
        { k: 'notes', l: 'Notes', type: 'textarea', liste: false },
      ],
    },
  };

  // Comment afficher une ligne référencée dans les listes déroulantes
  const LIBELLES_REF = {
    clients: { cols: 'id, nom, adresse, telephone', libelle: (r) => r.nom, ordre: 'nom' },
    fournisseurs: { cols: 'id, nom', libelle: (r) => r.nom, ordre: 'nom' },
    produits: {
      cols: 'id, designation, reference, quantite, prix_achat, prix_vente, fournisseur_id, actif', ordre: 'designation',
      libelle: (r) => `${r.designation}${r.reference ? ' (' + r.reference + ')' : ''} — stock : ${r.quantite}`,
    },
    ventes: { cols: 'id, date, montant', libelle: (r) => `Vente n°${r.id} du ${dateFr(r.date)} — ${fcfa(r.montant)}`, ordre: 'id', desc: true },
  };
  const COLONNE_REF = { clients: 'nom', fournisseurs: 'nom', produits: 'designation' };

  /* ------------------------------------------------------------------
   * Menu (par rôle). Les droits réels sont vérifiés par la base.
   * ------------------------------------------------------------------ */
  const TOUS = ['admin', 'gestionnaire', 'lecteur', 'caissier'];
  const BUREAU = ['admin', 'gestionnaire', 'lecteur'];
  const MENU = [
    ['Pilotage', [
      ['tableau', 'Tableau de bord', 'tableau', ['admin']],
      ['rapports', 'Rapports', 'rapports', BUREAU],
      ['journal', 'Journal des opérations', 'journal', BUREAU],
    ]],
    ['Vente', [
      ['caisse', 'Caisse', 'caisse', ['admin', 'gestionnaire', 'caissier']],
      ['tickets', 'Tickets de caisse', 'ticket', TOUS],
      ['credits', 'Crédits clients', 'credit', TOUS],
      ['commandes_clients', 'Commandes du site', 'web', TOUS],
      ['clients', 'Clients', 'clients', TOUS],
      ['livraisons', 'Livraisons', 'livraisons', BUREAU],
      ['ventes', 'Ventes (détail)', 'ventes', BUREAU],
    ]],
    ['Stock et achats', [
      ['produits', 'Produits et stock', 'produits', BUREAU],
      ['mouvements', 'Mouvements de stock', 'mouvements', BUREAU],
      ['commandes', 'Achats fournisseurs', 'achats', BUREAU],
      ['fournisseurs', 'Fournisseurs', 'fournisseurs', BUREAU],
    ]],
    ['Finances', [
      ['depenses', 'Dépenses', 'depenses', BUREAU],
    ]],
    ['Administration', [
      ['utilisateurs', 'Utilisateurs', 'utilisateurs', ['admin']],
    ]],
  ];
  const vuesAutorisees = () => MENU.flatMap(([, items]) => items.filter((i) => i[3].includes(moi?.role)).map((i) => i[0]));
  const titreVue = (v) => MENU.flatMap(([, i]) => i).find((i) => i[0] === v)?.[1] || ENTITES[v]?.titre || '';

  /* ------------------------------------------------------------------
   * État
   * ------------------------------------------------------------------ */
  let sb = null;
  let moi = null;            // { id, identifiant, nom, role }
  let vueActive = null;
  let lignes = [];           // lignes de la vue active
  let minuteur = null;
  const etatListe = { page: 1, filtres: {}, tri: null };

  const peutEcrire = () => !!moi && (moi.role === 'admin' || moi.role === 'gestionnaire');
  const peutVendre = () => !!moi && ['admin', 'gestionnaire', 'caissier'].includes(moi.role);
  const estAdmin = () => moi?.role === 'admin';
  const estCaissier = () => moi?.role === 'caissier';

  /* ------------------------------------------------------------------
   * Utilitaires d'interface
   * ------------------------------------------------------------------ */
  function toast(msg, type = false) {
    const t = $('#toast');
    const erreur = type === true || type === 'erreur';
    t.innerHTML = `${icone(erreur ? 'alerte' : type === 'ok' ? 'ok' : 'cloche')}<span>${esc(msg)}</span>`;
    t.classList.toggle('erreur-toast', erreur);
    t.classList.toggle('ok-toast', type === 'ok');
    t.setAttribute('role', erreur ? 'alert' : 'status');
    t.classList.add('visible');
    clearTimeout(t._m);
    t._m = setTimeout(() => t.classList.remove('visible'), erreur ? 6000 : 2800);
  }

  function messageErreur(e) {
    if (!e) return 'Erreur inconnue';
    const m = e.message || String(e);
    if (e.code === '42501' || /row-level security|permission denied/i.test(m)) return /Seuls|réservé|droits/i.test(m) && !/row-level|permission denied/i.test(m) ? m : "Vous n'avez pas les droits pour cette action.";
    if (e.code === '23503') return 'Impossible : cet élément est utilisé ailleurs (vente, commande…).';
    if (e.code === '23505') return 'Cette valeur existe déjà (référence, code-barres ou identifiant en double).';
    if (e.code === '23514') return 'Valeur refusée : vérifiez les quantités et montants (pas de négatif).';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Connexion impossible. Vérifiez votre réseau, puis réessayez.';
    if (/Invalid login credentials/i.test(m)) return 'Identifiant ou mot de passe incorrect.';
    if (/function .* does not exist|Could not find the function/i.test(m)) return 'Mise à jour de la base incomplète : exécutez le dernier script SQL dans Supabase.';
    if (/column .* does not exist/i.test(m)) return 'Mise à jour de la base incomplète : exécutez le dernier script SQL dans Supabase.';
    return m;
  }

  // Dialogue générique. onOk(form) peut lever une erreur : elle s'affiche dans le dialogue.
  function ouvrirDialogue({ titre, corps, ok = 'Enregistrer', onOk, sansAnnuler = false, apres, large = false, simple = false, annuler = 'Annuler', sansOk = false, boutons = '' }) {
    const dlg = $('#dialogue');
    const form = $('#form-dialogue');
    dlg.classList.toggle('large', large);
    $('#dialogue-titre').textContent = titre;
    $('#dialogue-corps').innerHTML = corps;
    $('#dialogue-corps').classList.toggle('simple', simple);
    $('#dialogue-erreur').textContent = '';
    $('#dialogue-ok').textContent = ok;
    $('#dialogue-ok').hidden = sansOk;
    $('#dialogue-annuler').hidden = sansAnnuler;
    $('#dialogue-annuler').textContent = annuler;
    $$('.pied .supp', form).forEach((b) => b.remove());
    if (boutons) $('#dialogue-annuler').insertAdjacentHTML('beforebegin', boutons);
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const btn = $('#dialogue-ok');
      if (btn.disabled) return;
      btn.disabled = true; btn.classList.add('occupe');
      try {
        // onOk peut renvoyer false pour garder le dialogue ouvert (ex. : « Imprimer »)
        const r = onOk ? await onOk(form) : undefined;
        if (r !== false) dlg.close();
      } catch (e) {
        $('#dialogue-erreur').textContent = messageErreur(e);
      } finally {
        btn.disabled = false; btn.classList.remove('occupe');
      }
    };
    $('#dialogue-annuler').onclick = () => dlg.close();
    if (dlg.open) dlg.close();
    dlg.showModal();
    if (apres) apres(form);
    const premier = $('[data-focus]', form) || $('input:not([readonly]):not([type=hidden]):not([type=file]), select, textarea', form);
    if (premier) premier.focus();
  }

  function afficherSecret(titre, identifiant, motDePasse) {
    ouvrirDialogue({
      titre, ok: 'J’ai noté', sansAnnuler: true,
      corps: `
        <div class="large"><label>Identifiant</label><div class="secret">${esc(identifiant)}</div></div>
        <div class="large"><label>Mot de passe</label><div class="secret" id="secret-mdp">${esc(motDePasse)}</div></div>
        <div class="large"><button type="button" class="btn" id="btn-copier">Copier l’identifiant et le mot de passe</button></div>
        <p class="note large">Ce récapitulatif ne sera plus affiché. Transmettez ces informations à la personne par un moyen sûr.</p>`,
      apres: () => {
        $('#btn-copier').onclick = async () => {
          try {
            await navigator.clipboard.writeText(`Identifiant : ${identifiant}\nMot de passe : ${motDePasse}`);
            toast('Copié', 'ok');
          } catch { toast('Copie impossible : sélectionnez le texte à la main', true); }
        };
      },
    });
  }

  // Squelette affiché pendant le chargement
  const chargement = (n = 6, kpis = false) => `${kpis ? `<div class="chargement-kpis">${'<div class="squelette"></div>'.repeat(4)}</div>` : ''}<div class="chargement" aria-label="Chargement">${'<div class="squelette"></div>'.repeat(n)}</div>`;

  // Impression d'un contenu (ticket, rapport) sans le reste de la page
  function imprimer(html) {
    const z = $('#impression');
    z.innerHTML = html;
    document.body.classList.add('imprime');
    const fin = () => { document.body.classList.remove('imprime'); z.innerHTML = ''; removeEventListener('afterprint', fin); };
    addEventListener('afterprint', fin);
    setTimeout(() => { window.print(); setTimeout(fin, 1000); }, 50);
  }

  // Export CSV (séparateur « ; », lisible directement par Excel)
  function telechargerCSV(nom, entetes, rangees) {
    const cellule = (v) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [entetes.map(cellule).join(';'), ...rangees.map((r) => r.map(cellule).join(';'))].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${nom}-${aujourdhui()}.csv`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const badge = (texte, couleur = '') => `<span class="badge ${couleur}">${esc(texte)}</span>`;
  const lienWhatsApp = (tel, texte) => {
    let n = String(tel || '').replace(/\D/g, '');
    if (n.length === 10 && n.startsWith('0')) n = '225' + n;   // numéro ivoirien local
    return `https://wa.me/${n}?text=${encodeURIComponent(texte)}`;
  };

  // Noms des membres de l'équipe (« vendu par … »)
  let equipeP = null;
  const equipe = () => (equipeP ??= sb.rpc('noms_equipe').then(({ data }) => Object.fromEntries((data || []).map((u) => [u.id, u.nom]))).catch(() => ({})));

  /* ------------------------------------------------------------------
   * Connexion
   * ------------------------------------------------------------------ */
  function versEmail(identifiant) {
    const id = identifiant.trim().toLowerCase();
    return id.includes('@') ? id : `${id}@${CFG.loginDomain || 'gestpro.local'}`;
  }

  async function chargerProfil(user) {
    const { data, error } = await sb.from('profiles').select('id, identifiant, nom, role').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function demarrer(session) {
    if (!session) { montrerConnexion(); return; }
    try {
      const profil = await chargerProfil(session.user);
      if (!profil) {
        await sb.auth.signOut();
        montrerConnexion("Ce compte n'est pas autorisé. Contactez l'administrateur.");
        return;
      }
      const premiere = !moi;
      moi = profil;
      if (premiere) montrerApp();
    } catch (e) {
      montrerConnexion(messageErreur(e));
    }
  }

  function montrerConnexion(erreur = '') {
    moi = null;
    equipeP = null;
    clearInterval(minuteur);
    $('#ecran-app').hidden = true;
    $('#ecran-connexion').hidden = false;
    $('#erreur-connexion').textContent = erreur;
  }

  const vueAccueil = () => ({ admin: 'tableau', gestionnaire: 'caisse', caissier: 'caisse', lecteur: 'rapports' }[moi.role] || 'produits');

  function montrerApp() {
    $('#ecran-connexion').hidden = true;
    $('#ecran-app').hidden = false;
    const nom = moi.nom || moi.identifiant;
    $('#profil-nom').textContent = nom;
    $('#profil-role').textContent = ROLES[moi.role] || moi.role;
    $('#menu-profil-nom').textContent = `${nom} · ${ROLES[moi.role] || moi.role}`;
    $('#avatar').textContent = nom.split(/\s+/).map((m) => m[0]).join('').slice(0, 2).toUpperCase();
    construireMenu();
    const demande = decodeURIComponent(location.hash.slice(1));
    afficher(vuesAutorisees().includes(demande) ? demande : vueAccueil());
    chargerNotifications();
    clearInterval(minuteur);
    // Rafraîchissement régulier pour voir le travail des collègues
    minuteur = setInterval(() => {
      if (document.hidden) return;
      chargerNotifications();
      if (!$('#dialogue').open && !['utilisateurs', 'caisse', 'rapports'].includes(vueActive)) afficher(vueActive, true);
    }, 45000);
  }

  /* ------------------------------------------------------------------
   * Navigation
   * ------------------------------------------------------------------ */
  function construireMenu() {
    let html = '';
    for (const [groupe, items] of MENU) {
      const visibles = items.filter((i) => i[3].includes(moi.role));
      if (!visibles.length) continue;
      html += `<div class="menu-groupe">${esc(groupe)}</div>`;
      html += visibles.map(([k, l, ic]) => `<button type="button" data-vue="${k}">${icone(ic)}<span class="lib-menu">${esc(estCaissier() && k === 'tickets' ? 'Mes tickets' : l)}</span></button>`).join('');
    }
    $('#menu').innerHTML = html;
    $$('#menu button').forEach((b) => (b.onclick = () => { fermerMenu(); afficher(b.dataset.vue); }));
  }
  function ouvrirMenu() { $('#barre').classList.add('ouverte'); $('#voile-menu').hidden = false; $('#btn-menu').setAttribute('aria-expanded', 'true'); $('#menu button')?.focus(); }
  function fermerMenu() { $('#barre').classList.remove('ouverte'); $('#voile-menu').hidden = true; $('#btn-menu').setAttribute('aria-expanded', 'false'); }

  function pastilleMenu(vue, n) {
    const b = $(`#menu button[data-vue="${vue}"]`);
    if (!b) return;
    $('.pastille', b)?.remove();
    if (n) b.insertAdjacentHTML('beforeend', `<span class="pastille" aria-label="${n} à traiter">${n > 99 ? '99+' : n}</span>`);
  }

  async function afficher(vue, silencieux = false) {
    if (!vuesAutorisees().includes(vue)) vue = vueAccueil();
    const change = vue !== vueActive;
    vueActive = vue;
    if (change) { etatListe.page = 1; etatListe.filtres = {}; etatListe.tri = null; }
    $$('#menu button').forEach((b) => { b.classList.toggle('actif', b.dataset.vue === vue); if (b.dataset.vue === vue) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (!silencieux) {
      if (location.hash.slice(1) !== vue) history.replaceState(null, '', `#${vue}`);
      $('#titre-vue').textContent = titreVue(vue);
      document.title = `${titreVue(vue)} – ${CFG.nomEntreprise || 'GestPro'}`;
      $('#actions-vue').innerHTML = '';
      $('#vue').innerHTML = chargement(6, vue === 'tableau');
      const v = $('#vue'); v.classList.remove('entree'); void v.offsetWidth; v.classList.add('entree');
      if (change) $('#contenu').scrollTo?.(0, 0), scrollTo(0, 0);
    }
    try {
      if (vue === 'utilisateurs') await vueUtilisateurs();
      else if (vue === 'commandes_clients') await vueCommandesClients(silencieux);
      else if (GP.vues[vue]) await GP.vues[vue](silencieux);
      else await vueEntite(vue, silencieux);
    } catch (e) {
      if (!silencieux && vueActive === vue) {
        $('#vue').innerHTML = `<div class="bloc"><p class="erreur">${esc(messageErreur(e))}</p><br><button class="btn" id="btn-reessayer">Réessayer</button></div>`;
        $('#btn-reessayer').onclick = () => afficher(vue);
      }
    }
  }

  /* ------------------------------------------------------------------
   * Écrans des entités (liste, recherche, filtres, tri, pagination)
   * ------------------------------------------------------------------ */
  const champsListe = (ent) => ent.champs.filter((c) => c.liste !== false);
  const champsForm = (ent) => ent.champs.filter((c) => c.form !== false);

  function requeteSelect(ent) {
    const jointures = ent.champs
      .filter((c) => c.type === 'ref' && !c.sansJointure)
      .map((c) => `r_${c.k}:${c.ref}!${c.k}(${COLONNE_REF[c.ref]})`);
    return ['*', ...jointures].join(', ');
  }

  function valeurAffichee(c, r) {
    if (c.calc) return c.calc(r);
    const v = r[c.k];
    if (c.type === 'ref') {
      if (v == null) return '';
      if (c.sansJointure) return c.ref === 'ventes' ? `Vente n°${v}` : `#${v}`;
      return r['r_' + c.k]?.[COLONNE_REF[c.ref]] ?? `#${v}`;
    }
    if (c.type === 'money') return fcfa(v);
    if (c.type === 'bool') return v ? (c.badgeOui || 'Oui') : (c.badgeNon || 'Non');
    if (c.type === 'photo') return v ? 'Oui' : '';
    if (c.type === 'date') return dateFr(v);
    if (c.num) return nf.format(v ?? 0);
    return v ?? '';
  }

  function celluleHTML(c, r) {
    const lab = `data-label="${esc(c.l)}"`;
    const cls = c.principal ? 'principal-cellule' : '';
    if (c.calcHTML) return `<td ${lab} class="${cls} ${c.num ? 'num' : ''}">${c.calcHTML(r)}</td>`;
    if (c.type === 'photo') {
      return `<td class="vignette" data-label="">${r[c.k] ? `<img src="${esc(r[c.k])}" alt="" loading="lazy" width="44" height="44">` : '<span class="sans-photo" aria-label="Pas de photo">—</span>'}</td>`;
    }
    if (c.type === 'bool') return `<td ${lab}>${r[c.k] ? badge(c.badgeOui || 'Oui', 'vert') : badge(c.badgeNon || 'Non')}</td>`;
    const brut = c.calc && c.type === 'money' ? fcfa(c.calc(r)) : valeurAffichee(c, r);
    if (c.badge && brut) return `<td ${lab}>${badge(brut, COULEURS_STATUT[brut] || '')}</td>`;
    const num = c.type === 'money' || c.num;
    return `<td ${lab} class="${cls} ${num ? 'num' : c.type === 'textarea' ? 'texte' : ''}">${esc(brut)}</td>`;
  }

  const peutAjouter = (ent) => peutEcrire() || (estCaissier() && ent.ajoutCaissier);

  async function vueEntite(cle, silencieux) {
    const ent = ENTITES[cle];
    if (!silencieux) {
      const boutons = (peutEcrire() && ent.boutonsEntete) ? ent.boutonsEntete() : [];
      $('#actions-vue').innerHTML = `
        <button class="btn" id="btn-csv" type="button">${icone('export')} Exporter CSV</button>
        ${boutons.map((b) => `<button class="btn" id="${b.id}" type="button">${icone(b.icone)} ${esc(b.libelle)}</button>`).join('')}
        ${peutAjouter(ent) ? `<button class="btn primaire" id="btn-ajouter" type="button">${icone('plus')} Ajouter</button>` : ''}`;
      boutons.forEach((b) => ($(`#${b.id}`).onclick = b.action));
      const rech = GP.rechercheInitiale || '';
      GP.rechercheInitiale = '';
      if (GP.filtreInitial) { Object.assign(etatListe.filtres, GP.filtreInitial); GP.filtreInitial = null; }
      $('#vue').innerHTML = `
        ${ent.aide ? `<p class="encart info">${esc(ent.aide)}</p><br>` : ''}
        <div class="outils">
          <input type="search" id="recherche" placeholder="Rechercher…" aria-label="Rechercher dans ${esc(ent.titre.toLowerCase())}" value="${esc(rech)}">
          ${(ent.filtres || []).map((f) => `<select id="filtre-${f.k}" aria-label="${esc(f.l)}" data-filtre="${f.k}"><option value="">${esc(f.l)} : tous</option></select>`).join('')}
          ${ent.tris ? `<select id="tri" aria-label="Trier">${ent.tris.map(([v, l]) => `<option value="${v}">Trier : ${esc(l)}</option>`).join('')}</select>` : ''}
        </div>
        <div id="liste">${chargement(6)}</div>`;
      $('#recherche').oninput = attendre(() => { etatListe.page = 1; dessinerListe(cle); }, 150);
      $$('[data-filtre]').forEach((s) => (s.onchange = () => { etatListe.filtres[s.dataset.filtre] = s.value; etatListe.page = 1; dessinerListe(cle); }));
      if ($('#tri')) $('#tri').onchange = () => { etatListe.tri = $('#tri').value; dessinerListe(cle); };
      $('#btn-csv').onclick = () => exporterCSV(cle);
      if (peutAjouter(ent)) $('#btn-ajouter').onclick = () => formulaire(cle, null);
    }
    let q = sb.from(cle).select(requeteSelect(ent));
    for (const [col, asc] of ent.ordre) q = q.order(col, { ascending: asc });
    const { data, error } = await q.limit(5000);
    if (error) throw error;
    if (vueActive !== cle) return;
    lignes = data;
    // options des filtres (selon les données)
    for (const f of ent.filtres || []) {
      const s = $(`#filtre-${f.k}`);
      if (!s) continue;
      const val = etatListe.filtres[f.k] || '';
      s.innerHTML = `<option value="">${esc(f.l)} : tous</option>${f.options(lignes).map((o) => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}`;
    }
    dessinerListe(cle);
  }

  function lignesFiltrees(cle) {
    const ent = ENTITES[cle];
    const terme = normaliser($('#recherche')?.value || '');
    let rows = lignes;
    for (const f of ent.filtres || []) {
      const v = etatListe.filtres[f.k];
      if (v) rows = rows.filter((r) => f.test(r, v));
    }
    if (terme) {
      const mots = terme.split(' ');
      rows = rows.filter((r) => {
        const texte = normaliser(ent.champs.map((c) => (c.type === 'photo' ? '' : valeurAffichee(c, r))).join(' ') + ' ' + [r.marque, r.reference, r.code_barres, r.contenance].filter(Boolean).join(' '));
        return mots.every((m) => texte.includes(m));
      });
    }
    const tri = etatListe.tri;
    if (tri) {
      const desc = tri.startsWith('-'), k = tri.replace('-', '');
      rows = [...rows].sort((a, b) => {
        const x = a[k], y = b[k];
        const c = typeof x === 'number' || !isNaN(Number(x)) && x !== null && x !== '' ? Number(x) - Number(y) : String(x ?? '').localeCompare(String(y ?? ''), 'fr');
        return desc ? -c : c;
      });
    }
    return rows;
  }

  function dessinerListe(cle) {
    const ent = ENTITES[cle];
    const cols = champsListe(ent);
    const toutes = lignesFiltrees(cle);
    const zone = $('#liste');
    if (!zone) return;
    if (!toutes.length) {
      zone.innerHTML = `<div class="table-wrap"><p class="vide">${lignes.length ? 'Aucun résultat pour cette recherche.' : 'Aucun enregistrement pour le moment.'}</p></div>`;
      return;
    }
    const parPage = ent.parPage || 50;
    const pages = Math.max(1, Math.ceil(toutes.length / parPage));
    etatListe.page = Math.min(etatListe.page, pages);
    const rows = toutes.slice((etatListe.page - 1) * parPage, etatListe.page * parPage);
    const totaux = cols.filter((c) => c.total);
    const ecriture = peutEcrire();
    const actionsDe = (r) => {
      const extras = (ent.actionsLigne ? ent.actionsLigne(r) : []).filter((a) => ecriture || a.lecture);
      const modif = ecriture && (!ent.modifiable || ent.modifiable(r));
      if (!extras.length && !modif) return '';
      return `<span class="acts-groupe">
        ${extras.map((a) => `<button class="btn-icone petit" type="button" data-act="${a.cle}" data-id="${r.id}" title="${esc(a.titre)}" aria-label="${esc(a.titre)}">${icone(a.icone)}</button>`).join('')}
        ${modif ? `<button class="btn-icone petit" type="button" data-mod="${r.id}" title="Modifier" aria-label="Modifier">${icone('crayon')}</button>
        <button class="btn-icone petit danger" type="button" data-sup="${r.id}" title="Supprimer" aria-label="Supprimer">${icone('corbeille')}</button>` : ''}
      </span>`;
    };
    const avecActions = rows.some((r) => actionsDe(r));
    zone.innerHTML = `
      <div class="table-wrap"><table class="cartes">
        <thead><tr>${cols.map((c) => `<th class="${c.type === 'money' || c.num ? 'num' : ''}">${esc(c.type === 'photo' ? '' : c.l)}</th>`).join('')}${avecActions ? '<th><span class="visuellement-cache">Actions</span></th>' : ''}</tr></thead>
        <tbody>${rows.map((r) => `
          <tr class="${ent.classeLigne ? ent.classeLigne(r) : ''}">
            ${cols.map((c) => celluleHTML(c, r)).join('')}
            ${avecActions ? `<td class="acts" data-label="">${actionsDe(r)}</td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table></div>
      <div class="compteur"><span>${nf.format(toutes.length)} élément(s)</span>${totaux.map((c) => `<span>Total ${esc(c.l.toLowerCase())} : <strong>${fcfa(toutes.reduce((s, r) => s + Number(c.calc ? c.calc(r) : r[c.k] || 0), 0))}</strong></span>`).join('')}
        ${pages > 1 ? `<span class="pagination"><button class="btn petit" type="button" data-page="-1" ${etatListe.page === 1 ? 'disabled' : ''}>‹ Précédent</button><span>Page ${etatListe.page} / ${pages}</span><button class="btn petit" type="button" data-page="1" ${etatListe.page === pages ? 'disabled' : ''}>Suivant ›</button></span>` : ''}
      </div>`;
    $$('[data-mod]', zone).forEach((b) => (b.onclick = () => formulaire(cle, lignes.find((r) => r.id == b.dataset.mod))));
    $$('[data-sup]', zone).forEach((b) => (b.onclick = () => supprimer(cle, Number(b.dataset.sup))));
    $$('[data-act]', zone).forEach((b) => (b.onclick = () => {
      const r = lignes.find((x) => x.id == b.dataset.id);
      ent.actionsLigne(r).find((a) => a.cle === b.dataset.act)?.action();
    }));
    $$('[data-page]', zone).forEach((b) => (b.onclick = () => { etatListe.page += Number(b.dataset.page); dessinerListe(cle); $('#liste').scrollIntoView({ block: 'start', behavior: reduit() ? 'auto' : 'smooth' }); }));
  }

  // --- Saisie libre du nom d'un produit -----------------------------
  const nomProduit = (p) => `${p.designation}${p.reference ? ` (${p.reference})` : ''}`;

  // Retrouve le produit correspondant au texte tapé (sans tenir compte des accents ni des majuscules)
  function trouverProduit(texte, produits) {
    const n = normaliser(texte);
    if (!n) return null;
    const exact = produits.find((p) => normaliser(nomProduit(p)) === n);
    if (exact) return exact;
    const memeNom = produits.filter((p) => normaliser(p.designation) === n);
    if (memeNom.length > 1) throw new Error(`Plusieurs produits s'appellent « ${texte} ». Choisissez celui avec la bonne référence dans la liste.`);
    return memeNom[0] || null;
  }

  async function chargerOptions(ref) {
    const d = LIBELLES_REF[ref];
    const { data, error } = await sb.from(ref).select(d.cols).order(d.ordre, { ascending: !d.desc }).limit(5000);
    if (error) throw error;
    return data;
  }

  function champHTML(c, val, options, enModification) {
    const id = `f_${c.k}`;
    const req = c.req ? 'required' : '';
    const etiquette = `${esc(c.l)}${c.req ? ' *' : ''}`;
    let input;
    if (c.creationSeulement && enModification) {
      return `<div><label>${esc(c.l)}</label><div class="lecture-seule">${esc(nf.format(val || 0))}</div><p class="note">Pour changer le stock : bouton « Ajuster le stock » de la liste (l’historique est conservé).</p></div>`;
    }
    switch (c.type) {
      case 'textarea':
        input = `<textarea id="${id}" name="${c.k}" ${c.max ? `maxlength="${c.max}"` : ''} ${req}>${esc(val)}</textarea>`; break;
      case 'bool':
        input = `<select id="${id}" name="${c.k}"><option value="false" ${val ? '' : 'selected'}>${esc(c.non || 'Non')}</option><option value="true" ${val ? 'selected' : ''}>${esc(c.oui || 'Oui')}</option></select>`; break;
      case 'photo':
        input = `<div class="champ-photo">
            <img class="apercu-photo" id="apercu-${c.k}" alt="Aperçu de la photo" ${val ? `src="${esc(val)}"` : 'hidden'}>
            <div class="champ-photo-actions">
              <input type="hidden" name="${c.k}" value="${esc(val)}">
              <input type="file" id="${id}" accept="image/jpeg,image/png,image/webp" class="fichier-photo">
              <button type="button" class="btn petit" id="retirer-${c.k}" ${val ? '' : 'hidden'}>Retirer la photo</button>
              <p class="note">JPEG, PNG ou WebP. La photo est réduite automatiquement avant l’envoi.</p>
            </div>
          </div>`;
        break;
      case 'select':
        input = `<select id="${id}" name="${c.k}" ${req}>${c.vide ? `<option value="">${esc(c.vide)}</option>` : ''}${c.opts.map((o) => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`; break;
      case 'liste':
        input = `<input id="${id}" name="${c.k}" list="dl_${c.k}" value="${esc(val)}" ${req}><datalist id="dl_${c.k}">${c.opts.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>`; break;
      case 'ref': {
        if (c.saisie) {
          const actuel = options.find((o) => o.id == val);
          input = `<input id="${id}" name="${c.k}" list="dl_${c.k}" value="${esc(actuel ? nomProduit(actuel) : '')}" ${req} autocomplete="off" placeholder="Ex. : Moët & Chandon Impérial">`
            + `<datalist id="dl_${c.k}">${options.filter((o) => o.actif !== false || o.id == val).map((o) => `<option value="${esc(nomProduit(o))}" label="${esc(`stock : ${o.quantite}`)}">`).join('')}</datalist>`;
          break;
        }
        const lib = LIBELLES_REF[c.ref].libelle;
        input = `<select id="${id}" name="${c.k}" ${req}><option value="">${c.req ? '— Choisir —' : '— Aucun —'}</option>${options.map((o) => `<option value="${o.id}" ${o.id == val ? 'selected' : ''}>${esc(lib(o))}</option>`).join('')}</select>`;
        break;
      }
      case 'money':
        input = `<input id="${id}" name="${c.k}" type="number" min="0" step="any" inputmode="decimal" value="${esc(val)}" ${req}>`; break;
      case 'number':
        input = `<input id="${id}" name="${c.k}" type="number" step="1" ${c.min != null ? `min="${c.min}"` : ''} inputmode="numeric" value="${esc(val)}" ${req}>`; break;
      default:
        input = `<input id="${id}" name="${c.k}" type="${c.type || 'text'}" value="${esc(val)}" ${req}>`;
    }
    const aide = (!enModification && c.aideCreation) || c.aide;
    return `<div class="${c.large || c.type === 'textarea' || c.type === 'photo' ? 'large' : ''}"><label for="${id}">${etiquette}</label>${input}${aide ? `<p class="note">${esc(aide)}</p>` : ''}</div>`;
  }

  async function formulaire(cle, ligne) {
    const ent = ENTITES[cle];
    const champs = champsForm(ent);
    let options = {};
    try {
      const refs = [...new Set(champs.filter((c) => c.type === 'ref').map((c) => c.ref))];
      const res = await Promise.all(refs.map(chargerOptions));
      refs.forEach((r, i) => (options[r] = res[i]));
    } catch (e) { toast(messageErreur(e), true); return; }

    const valeurInitiale = (c) => (ligne ? ligne[c.k] ?? '' : c.defaut ? c.defaut() : '');
    ouvrirDialogue({
      titre: `${ligne ? 'Modifier' : 'Ajouter'} ${ent.article}`,
      corps: champs.map((c) => champHTML(c, valeurInitiale(c), options[c.ref] || [], !!ligne)).join(''),
      large: champs.length > 9,
      apres: (form) => {
        champs.filter((c) => c.type === 'photo').forEach((c) => brancherPhoto(form, c));
        for (const [k, fn] of Object.entries(ent.surChange || {})) {
          const champ = champs.find((c) => c.k === k);
          const liste = options[champ.ref] || [];
          const trouver = () => {
            if (!champ.saisie) return liste.find((o) => o.id == form[k].value);
            try { return trouverProduit(form[k].value, liste); } catch { return null; }
          };
          form[k].addEventListener('change', () => fn(form, trouver()));
        }
      },
      onOk: async (form) => {
        const donnees = {};
        let aCreer = null;   // produit tapé qui n'existe pas encore (achat fournisseur)
        for (const c of champs) {
          if (c.creationSeulement && ligne) continue;
          if (c.type === 'photo') {
            const fichier = form.querySelector(`#f_${c.k}`).__photo;
            donnees[c.k] = fichier ? await envoyerPhoto(fichier) : (form[c.k].value || null);
            continue;
          }
          if (c.type === 'bool') { donnees[c.k] = form[c.k].value === 'true'; continue; }
          const v = form[c.k].value.trim();
          if (c.saisie) {
            if (!v) { if (c.req) throw new Error(`Indiquez le ${c.l.toLowerCase()}.`); donnees[c.k] = null; continue; }
            const p = trouverProduit(v, options[c.ref] || []);
            if (p) donnees[c.k] = p.id;
            else if (c.creerSiAbsent) aCreer = { champ: c.k, designation: v.slice(0, 200) };
            else throw new Error(`« ${v} » n'est pas dans le stock. Choisissez un produit proposé dans la liste, ou ajoutez-le d'abord dans Produits.`);
            continue;
          }
          if (v === '') donnees[c.k] = null;
          else if (c.type === 'ref' || c.type === 'number' || c.type === 'money') donnees[c.k] = Number(v);
          else donnees[c.k] = v;
          // Les champs avec valeur par défaut en base ne doivent pas recevoir null
          if (donnees[c.k] === null && c.defaut && !c.req) delete donnees[c.k];
        }
        if (cle === 'commandes' && donnees.montant_paye != null && donnees.quantite) {
          const total = donnees.quantite * (donnees.prix_unitaire || 0);
          if (donnees.montant_paye > total) throw new Error(`Le montant payé (${fcfa(donnees.montant_paye)}) dépasse le montant de l’achat (${fcfa(total)}).`);
        }
        let nouveauProduit = null;
        if (aCreer) {
          const { data: p, error: eP } = await sb.from('produits').insert({
            designation: aCreer.designation,
            prix_achat: donnees.prix_unitaire ?? 0,
            fournisseur_id: donnees.fournisseur_id ?? null,
          }).select('id').single();
          if (eP) throw eP;
          nouveauProduit = p.id;
          donnees[aCreer.champ] = p.id;
        }
        const { error } = ligne
          ? await sb.from(cle).update(donnees).eq('id', ligne.id)
          : await sb.from(cle).insert(donnees);
        if (error) {
          // Pas de produit orphelin si l'enregistrement échoue
          if (nouveauProduit) await sb.from('produits').delete().eq('id', nouveauProduit);
          throw error;
        }
        toast(aCreer ? `« ${aCreer.designation} » ajouté au stock, achat enregistré` : (ligne ? 'Modifications enregistrées' : 'Ajouté'), 'ok');
        afficher(cle, true);
        chargerNotifications();
      },
    });
  }

  /* ------------------------------------------------------------------
   * Commandes passées depuis la boutique en ligne
   * ------------------------------------------------------------------ */
  const STATUTS_SITE = { 'nouvelle': 'orange', 'confirmée': 'bleu', 'livrée': 'vert', 'annulée': 'rouge' };
  let filtreStatut = 'à traiter';

  async function vueCommandesClients(silencieux) {
    if (!silencieux) {
      $('#actions-vue').innerHTML = `<label class="filtre-statut">Afficher
        <select id="filtre-statut">
          ${['à traiter', 'toutes', 'nouvelle', 'confirmée', 'livrée', 'annulée'].map((v) => `<option ${v === filtreStatut ? 'selected' : ''}>${v}</option>`).join('')}
        </select></label>`;
      $('#filtre-statut').onchange = (e) => { filtreStatut = e.target.value; afficher('commandes_clients', true); };
      $('#vue').innerHTML = `<p class="encart info">Commandes envoyées par les visiteurs depuis la boutique en ligne. Les prix ont été recalculés par la base. Le stock ne baisse qu’au clic sur « Enregistrer en ventes », après votre confirmation avec le client.</p><br><div id="liste">${chargement(4)}</div>`;
    }
    let q = sb.from('commandes_clients').select('*').order('created_at', { ascending: false }).limit(300);
    if (filtreStatut === 'à traiter') q = q.in('statut', ['nouvelle', 'confirmée']);
    else if (filtreStatut !== 'toutes') q = q.eq('statut', filtreStatut);
    const { data, error } = await q;
    if (error) throw error;
    if (vueActive !== 'commandes_clients') return;
    chargerNotifications();
    const zone = $('#liste');
    if (!data.length) {
      zone.innerHTML = `<div class="table-wrap"><p class="vide">${filtreStatut === 'à traiter' ? 'Aucune commande à traiter pour le moment.' : 'Aucune commande.'}</p></div>`;
      return;
    }
    zone.innerHTML = `<div class="table-wrap"><table class="cartes">
      <thead><tr><th>N°</th><th>Reçue le</th><th>Client</th><th>Articles</th><th class="num">Total</th><th>Statut</th><th></th></tr></thead>
      <tbody>${data.map((c) => `
        <tr>
          <td class="principal-cellule" data-label="N°"><strong>Commande n°${c.id}</strong></td>
          <td data-label="Reçue le">${dateHeureFr(c.created_at)}</td>
          <td class="texte" data-label="Client"><span><strong>${esc(c.nom)}</strong><br><a href="${esc(lienWhatsApp(c.telephone, `Bonjour ${c.nom}, nous avons bien reçu votre commande n°${c.id} au Paradis des Bavins.`))}" target="_blank" rel="noopener">${esc(c.telephone)}</a>${c.note ? `<br><span class="note">« ${esc(c.note)} »</span>` : ''}</span></td>
          <td class="texte" data-label="Articles"><span>${c.lignes.map((l) => `${nf.format(l.quantite)} × ${esc(l.designation)} <span class="note">(${fcfa(l.prix_unitaire)})</span>`).join('<br>')}</span></td>
          <td class="num" data-label="Total"><strong>${fcfa(c.total)}</strong></td>
          <td data-label="Statut">${peutEcrire()
            ? `<select data-statut="${c.id}" aria-label="Statut de la commande ${c.id}">${Object.keys(STATUTS_SITE).map((st) => `<option ${st === c.statut ? 'selected' : ''}>${st}</option>`).join('')}</select>`
            : badge(c.statut, STATUTS_SITE[c.statut])}</td>
          <td class="acts" data-label="">${c.ventes_creees
            ? badge('Ventes enregistrées', 'vert')
            : (peutEcrire() && c.statut !== 'annulée' ? `<button class="btn petit" type="button" data-confirmer="${c.id}">Enregistrer en ventes</button>` : '')}</td>
        </tr>`).join('')}
      </tbody></table></div>
      <div class="compteur">${nf.format(data.length)} commande(s) · Total ${fcfa(data.reduce((t, c) => t + Number(c.total), 0))}</div>`;
    $$('[data-statut]', zone).forEach((sel) => (sel.onchange = async () => {
      const { error: e } = await sb.from('commandes_clients').update({ statut: sel.value }).eq('id', sel.dataset.statut);
      if (e) toast(messageErreur(e), true); else toast(`Commande n°${sel.dataset.statut} : ${sel.value}`, 'ok');
      afficher('commandes_clients', true);
    }));
    $$('[data-confirmer]', zone).forEach((b) => (b.onclick = async () => {
      if (!confirm(`Enregistrer la commande n°${b.dataset.confirmer} en ventes ? Le stock des produits baissera.`)) return;
      b.disabled = true; b.classList.add('occupe');
      const { error: e } = await sb.rpc('confirmer_commande_client', { p_id: Number(b.dataset.confirmer) });
      if (e) { toast(messageErreur(e), true); b.disabled = false; b.classList.remove('occupe'); return; }
      toast(`Commande n°${b.dataset.confirmer} enregistrée en ventes`, 'ok');
      afficher('commandes_clients', true);
    }));
  }

  /* ------------------------------------------------------------------
   * Photos des produits (Supabase Storage, dossier « produits »)
   * ------------------------------------------------------------------ */
  // Réduit la photo (1200 px maximum, JPEG) avant l'envoi
  async function preparerPhoto(fichier) {
    if (!/^image\/(jpeg|png|webp)$/.test(fichier.type)) throw new Error('Choisissez une image JPEG, PNG ou WebP.');
    if (fichier.size > 15 * 1024 * 1024) throw new Error('Cette image est trop lourde (15 Mo au maximum).');
    const bitmap = await createImageBitmap(fichier);
    const k = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const toile = document.createElement('canvas');
    toile.width = Math.round(bitmap.width * k); toile.height = Math.round(bitmap.height * k);
    const ctx = toile.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, toile.width, toile.height);   // fond blanc pour les PNG transparents
    ctx.drawImage(bitmap, 0, 0, toile.width, toile.height);
    const blob = await new Promise((ok) => toile.toBlob(ok, 'image/jpeg', 0.85));
    return { blob, apercu: toile.toDataURL('image/jpeg', 0.7) };
  }

  async function envoyerPhoto(photo) {
    const nom = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await sb.storage.from('produits').upload(nom, photo.blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
    if (error) throw new Error(`Envoi de la photo impossible : ${error.message}`);
    return sb.storage.from('produits').getPublicUrl(nom).data.publicUrl;
  }

  function brancherPhoto(form, c) {
    const fichier = form.querySelector(`#f_${c.k}`), apercu = form.querySelector(`#apercu-${c.k}`), retirer = form.querySelector(`#retirer-${c.k}`);
    fichier.addEventListener('change', async () => {
      $('#dialogue-erreur').textContent = '';
      const f = fichier.files[0];
      if (!f) return;
      try {
        fichier.__photo = await preparerPhoto(f);
        apercu.src = fichier.__photo.apercu; apercu.hidden = false; retirer.hidden = false;
      } catch (e) { fichier.value = ''; fichier.__photo = null; $('#dialogue-erreur').textContent = messageErreur(e); }
    });
    retirer.addEventListener('click', () => {
      fichier.value = ''; fichier.__photo = null; form[c.k].value = '';
      apercu.hidden = true; apercu.removeAttribute('src'); retirer.hidden = true;
    });
  }

  async function supprimer(cle, id) {
    const ent = ENTITES[cle];
    let avert = `Supprimer ${ent.article.replace(/^une? /, (m) => (m === 'un ' ? 'ce ' : 'cette '))} ? Cette action est définitive.`;
    if (cle === 'ventes') avert += '\nLa quantité vendue sera remise en stock.';
    if (cle === 'commandes') avert += '\nSi l’achat était reçu, la quantité sera retirée du stock.';
    if (cle === 'produits') avert += '\nAstuce : pour ne plus le vendre sans perdre son historique, passez plutôt son statut à « Archivé ».';
    if (!confirm(avert)) return;
    const { error } = await sb.from(cle).delete().eq('id', id);
    if (error) { toast(messageErreur(error), true); return; }
    toast('Supprimé', 'ok');
    afficher(cle, true);
  }

  function exporterCSV(cle) {
    const ent = ENTITES[cle];
    const cols = ent.champs.filter((c) => c.type !== 'photo');
    const brut = (c, r) => (c.calc ? c.calc(r) : c.type === 'money' || c.num ? (r[c.k] ?? '') : valeurAffichee(c, r));
    telechargerCSV(cle, cols.map((c) => c.l), lignesFiltrees(cle).map((r) => cols.map((c) => brut(c, r))));
  }

  /* ------------------------------------------------------------------
   * Recherche globale (barre du haut)
   * ------------------------------------------------------------------ */
  let resultats = [];
  async function rechercherPartout(terme) {
    const zone = $('#resultats-globaux');
    const t = terme.trim();
    if (t.length < 2) { zone.hidden = true; $('#recherche-globale').setAttribute('aria-expanded', 'false'); return; }
    const motif = `%${t.replace(/[%_,()]/g, ' ')}%`;
    const taches = [];
    if (estCaissier()) {
      taches.push(sb.rpc('produits_caisse').then(({ data }) => (data || []).filter((p) => normaliser(`${p.designation} ${p.reference} ${p.code_barres} ${p.marque}`).includes(normaliser(t))).slice(0, 6)
        .map((p) => ({ type: 'Produit', libelle: p.designation, detail: `${fcfa(p.prix_vente)} · stock ${p.quantite}`, aller: () => { GP.rechercheCaisse = p.designation; afficher('caisse'); } }))));
    } else {
      taches.push(sb.from('produits').select('id, designation, quantite, prix_vente, reference').or(`designation.ilike.${motif},reference.ilike.${motif},code_barres.ilike.${motif},marque.ilike.${motif}`).limit(6)
        .then(({ data }) => (data || []).map((p) => ({ type: 'Produit', libelle: p.designation, detail: `${fcfa(p.prix_vente)} · stock ${p.quantite}`, aller: () => { GP.rechercheInitiale = p.designation; afficher('produits'); } }))));
    }
    taches.push(sb.from('clients').select('id, nom, telephone').or(`nom.ilike.${motif},telephone.ilike.${motif}`).limit(5)
      .then(({ data }) => (data || []).map((c) => ({ type: 'Client', libelle: c.nom, detail: c.telephone || '', aller: () => { GP.rechercheInitiale = c.nom; afficher('clients'); } }))));
    const n = t.replace(/^n°\s*/i, '');
    if (/^\d{1,9}$/.test(n)) {
      taches.push(sb.from('tickets').select('id, total, date, statut').eq('id', Number(n)).limit(1)
        .then(({ data }) => (data || []).map((k) => ({ type: 'Ticket', libelle: `Ticket n°${k.id}`, detail: `${fcfa(k.total)} · ${dateFr(k.date)}${k.statut === 'annulée' ? ' · annulé' : ''}`, aller: () => GP.ouvrirTicket?.(k.id) }))));
    }
    const res = (await Promise.allSettled(taches)).flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if ($('#recherche-globale').value.trim() !== t) return;   // une autre frappe a suivi
    resultats = res;
    zone.innerHTML = res.length
      ? res.map((r, i) => `<button type="button" class="resultat" role="option" data-i="${i}"><span class="type">${esc(r.type)}</span><span>${esc(r.libelle)}</span><span class="detail">${esc(r.detail)}</span></button>`).join('')
      : `<p class="resultats-vide">Aucun résultat pour « ${esc(t)} »</p>`;
    zone.hidden = false;
    $('#recherche-globale').setAttribute('aria-expanded', 'true');
    $$('.resultat', zone).forEach((b) => (b.onclick = () => choisirResultat(Number(b.dataset.i))));
  }
  function choisirResultat(i) {
    const r = resultats[i];
    fermerRecherche();
    $('#recherche-globale').value = '';
    r?.aller();
  }
  function fermerRecherche() { $('#resultats-globaux').hidden = true; $('#recherche-globale').setAttribute('aria-expanded', 'false'); }

  /* ------------------------------------------------------------------
   * Notifications (événements réels : stock, péremptions, commandes du
   * site, crédits en retard, journal des opérations)
   * ------------------------------------------------------------------ */
  let notifs = [];
  let dernierNbNonLues = 0;
  const cleLues = () => `gestpro-notifs-lues-${moi?.id}`;
  const lirelues = () => { try { return new Set(JSON.parse(localStorage.getItem(cleLues()) || '[]')); } catch { return new Set(); } };
  const ecrireLues = (s) => { try { localStorage.setItem(cleLues(), JSON.stringify([...s].slice(-800))); } catch { /* stockage indisponible */ } };

  async function chargerNotifications() {
    if (!moi || !sb) return;
    const liste = [];
    const taches = [];
    // stock : faible, rupture, péremption
    taches.push((estCaissier()
      ? sb.rpc('produits_caisse').then(({ data }) => data || [])
      : sb.from('produits').select('id, designation, quantite, seuil_alerte, date_peremption, actif').eq('actif', true).limit(5000).then(({ data }) => data || []))
      .then((produits) => {
        const limite = isoLocal(new Date(Date.now() + 30 * 864e5));
        for (const p of produits) {
          if (p.quantite <= 0) liste.push({ cle: `rupture:${p.id}`, niveau: 'alerte', groupe: 'À surveiller', texte: `Rupture de stock : ${p.designation}`, icone: 'alerte', aller: () => { GP.filtreInitial = { etat: 'Rupture' }; afficher(estCaissier() ? 'caisse' : 'produits'); } });
          else if (p.quantite <= p.seuil_alerte) liste.push({ cle: `faible:${p.id}:${p.quantite}`, niveau: 'attention', groupe: 'À surveiller', texte: `Stock faible : ${p.designation} (${p.quantite} restant${p.quantite > 1 ? 's' : ''})`, icone: 'produits', aller: () => { GP.filtreInitial = { etat: 'Stock faible' }; afficher(estCaissier() ? 'caisse' : 'produits'); } });
          if (p.date_peremption && p.date_peremption <= limite && p.quantite > 0) liste.push({ cle: `peremption:${p.id}:${p.date_peremption}`, niveau: p.date_peremption < aujourdhui() ? 'alerte' : 'attention', groupe: 'À surveiller', texte: `${p.date_peremption < aujourdhui() ? 'Périmé' : 'Péremption proche'} : ${p.designation} (${dateFr(p.date_peremption)})`, icone: 'alerte', aller: () => { GP.filtreInitial = { etat: 'Péremption sous 30 jours' }; afficher('produits'); } });
        }
      }));
    // commandes du site
    taches.push(sb.from('commandes_clients').select('id, nom, total, created_at').eq('statut', 'nouvelle').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => {
        pastilleMenu('commandes_clients', (data || []).length);
        for (const c of data || []) liste.push({ cle: `site:${c.id}`, niveau: 'info', groupe: 'À surveiller', date: c.created_at, texte: `Nouvelle commande du site n°${c.id} : ${c.nom} (${fcfa(c.total)})`, icone: 'web', aller: () => afficher('commandes_clients') });
      }));
    // crédits en retard
    taches.push(sb.rpc('liste_credits', { p_tous: false }).then(({ data }) => {
      const retards = (data || []).filter((c) => c.statut === 'en retard');
      pastilleMenu('credits', retards.length);
      for (const c of retards) liste.push({ cle: `retard:${c.id}:${c.paye}`, niveau: 'attention', groupe: 'À surveiller', texte: `Crédit en retard : ${c.client || 'client'} — ${fcfa(c.retard)} attendus (vente n°${c.id})`, icone: 'credit', aller: () => afficher('credits') });
    }));
    // journal
    if (!estCaissier()) {
      taches.push(sb.from('journal').select('id, created_at, categorie, niveau, message, reference').order('created_at', { ascending: false }).limit(40)
        .then(({ data }) => {
          for (const j of data || []) liste.push({ cle: `journal:${j.id}`, niveau: j.niveau === 'info' ? (j.categorie === 'vente' ? 'ok' : 'info') : j.niveau, groupe: 'Activité récente', date: j.created_at, texte: j.message,
            icone: { vente: 'caisse', annulation: 'alerte', stock: 'mouvements', achat: 'achats', paiement: 'credit', prix: 'crayon', depense: 'depenses' }[j.categorie] || 'journal',
            aller: () => { const [t, id] = String(j.reference || '').split(':'); if (t === 'ticket') GP.ouvrirTicket?.(Number(id)); else afficher('journal'); } });
        }));
    }
    await Promise.allSettled(taches);
    notifs = liste;
    dessinerNotifications();
  }

  function dessinerNotifications() {
    const lues = lirelues();
    const nonLues = notifs.filter((n) => !lues.has(n.cle)).length;
    const b = $('#nb-notifs');
    b.textContent = nonLues > 99 ? '99+' : nonLues;
    b.hidden = !nonLues;
    $('#btn-notifs').setAttribute('aria-label', nonLues ? `Notifications (${nonLues} non lues)` : 'Notifications');
    if (nonLues > dernierNbNonLues && !reduit()) { const c = $('#btn-notifs'); c.classList.remove('sonne'); void c.offsetWidth; c.classList.add('sonne'); }
    dernierNbNonLues = nonLues;
    const groupes = ['À surveiller', 'Activité récente'];
    const zone = $('#liste-notifs');
    zone.innerHTML = notifs.length ? groupes.map((g) => {
      const items = notifs.filter((n) => n.groupe === g);
      if (!items.length) return '';
      return `<div class="notif-groupe">${esc(g)}</div>${items.slice(0, 60).map((n) => `
        <button type="button" class="notif ${n.niveau} ${lues.has(n.cle) ? '' : 'non-lue'} resultat" data-cle="${esc(n.cle)}">
          <span class="notif-icone">${icone(n.icone)}</span>
          <span><span class="notif-texte">${esc(n.texte)}</span>${n.date ? `<span class="notif-date"> · ${esc(dateHeureFr(n.date))}</span>` : ''}</span>
        </button>`).join('')}`;
    }).join('') : '<p class="vide">Rien à signaler pour le moment.</p>';
    $$('[data-cle]', zone).forEach((el) => (el.onclick = () => {
      const n = notifs.find((x) => x.cle === el.dataset.cle);
      const l = lirelues(); l.add(n.cle); ecrireLues(l);
      fermerPanneaux();
      n.aller?.();
      dessinerNotifications();
    }));
  }

  function fermerPanneaux() {
    $('#panneau-notifs').hidden = true; $('#btn-notifs').setAttribute('aria-expanded', 'false');
    $('#menu-profil').hidden = true; $('#btn-profil').setAttribute('aria-expanded', 'false');
  }

  /* ------------------------------------------------------------------
   * Utilisateurs (administrateur)
   * ------------------------------------------------------------------ */
  async function appelAdmin(body) {
    const { data, error } = await sb.functions.invoke('admin-users', { body });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.error || msg; } catch { /* réponse non JSON */ }
      if (/Rôle invalide|role/i.test(msg) && body.role === 'caissier') msg = 'Le rôle Caissier n’est pas encore activé : redéployez la fonction « admin-users » avec la nouvelle version (voir les instructions).';
      throw new Error(msg);
    }
    return data;
  }

  const DESCRIPTION_ROLES = {
    admin: 'Administrateur (tout, y compris les comptes et le tableau de bord)',
    gestionnaire: 'Gestionnaire (caisse, stock, achats, dépenses, annulations)',
    caissier: 'Caissier (caisse et crédits uniquement, remise ≤ 10 %)',
    lecteur: 'Lecteur (consultation seule)',
  };

  async function vueUtilisateurs() {
    $('#actions-vue').innerHTML = `<button class="btn primaire" id="btn-gen" type="button">${icone('plus')} Créer un compte</button>`;
    $('#btn-gen').onclick = creerCompte;
    $('#vue').innerHTML = `<p class="encart info">Créez ici les comptes de votre équipe, avec l’identifiant et le mot de passe de votre choix. ${Object.values(DESCRIPTION_ROLES).map(esc).join(' · ')}.</p><br><div id="liste">${chargement(3)}</div>`;
    const { users } = await appelAdmin({ action: 'list' });
    if (vueActive !== 'utilisateurs') return;
    $('#liste').innerHTML = `<div class="table-wrap"><table class="cartes">
      <thead><tr><th>Identifiant</th><th>Nom</th><th>Rôle</th><th>Dernière connexion</th><th>Créé le</th><th></th></tr></thead>
      <tbody>${users.map((u) => `
        <tr>
          <td class="principal-cellule" data-label="Identifiant"><strong>${esc(u.identifiant)}</strong>${u.moi ? ' ' + badge('vous', 'accent') : ''}</td>
          <td data-label="Nom">${esc(u.nom || '')}</td>
          <td data-label="Rôle">${u.moi ? badge(ROLES[u.role] || u.role) : `<select data-role="${u.id}" aria-label="Rôle de ${esc(u.identifiant)}">${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${l}</option>`).join('')}</select>`}</td>
          <td data-label="Dernière connexion">${dateHeureFr(u.last_sign_in_at)}</td>
          <td data-label="Créé le">${dateFr(u.created_at)}</td>
          <td class="acts" data-label="">${u.moi ? '' : `<span class="acts-groupe"><button class="btn petit" type="button" data-reset="${u.id}" data-ident="${esc(u.identifiant)}">Changer le mot de passe</button><button class="btn petit danger" type="button" data-del="${u.id}" data-ident="${esc(u.identifiant)}">Supprimer</button></span>`}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
    $$('[data-role]').forEach((s) => (s.onchange = async () => {
      try { await appelAdmin({ action: 'set_role', id: s.dataset.role, role: s.value }); toast('Rôle modifié', 'ok'); }
      catch (e) { toast(messageErreur(e), true); }
      afficher('utilisateurs');
    }));
    $$('[data-reset]').forEach((b) => (b.onclick = () => changerMotDePasse(b.dataset.reset, b.dataset.ident)));
    $$('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!confirm(`Supprimer le compte « ${b.dataset.ident} » ? La personne perdra immédiatement l'accès.`)) return;
      try { await appelAdmin({ action: 'delete', id: b.dataset.del }); toast('Compte supprimé', 'ok'); }
      catch (e) { toast(messageErreur(e), true); }
      afficher('utilisateurs');
    }));
  }

  // Champ mot de passe : saisi par l'administrateur, ou généré au hasard
  const CHAMP_MDP = `
    <div class="large"><label for="u_mdp">Mot de passe *</label>
      <div class="ligne-mdp">
        <input id="u_mdp" name="mot_de_passe" type="password" required minlength="8" maxlength="72" autocomplete="new-password" placeholder="8 caractères minimum">
        <button type="button" class="btn" id="btn-voir-mdp">Afficher</button>
        <button type="button" class="btn" id="btn-gen-mdp">Générer</button>
      </div>
    </div>
    <p class="note large">Tapez le mot de passe de votre choix (8 caractères minimum), ou cliquez sur « Générer » pour en créer un au hasard.</p>`;

  function brancherChampMdp(form) {
    const champ = form.mot_de_passe;
    $('#btn-voir-mdp').onclick = () => {
      const visible = champ.type === 'text';
      champ.type = visible ? 'password' : 'text';
      $('#btn-voir-mdp').textContent = visible ? 'Afficher' : 'Masquer';
    };
    $('#btn-gen-mdp').onclick = () => {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%*-_';
      const octets = crypto.getRandomValues(new Uint8Array(64));
      let mdp = '';
      for (const o of octets) { if (o < 256 - (256 % alphabet.length) && mdp.length < 14) mdp += alphabet[o % alphabet.length]; }
      champ.value = mdp;
      champ.type = 'text';
      $('#btn-voir-mdp').textContent = 'Masquer';
    };
  }

  function verifierMdp(mdp) {
    if (mdp.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
    if (/^\s|\s$/.test(mdp)) throw new Error('Le mot de passe ne doit pas commencer ni finir par un espace.');
  }

  function creerCompte() {
    ouvrirDialogue({
      titre: 'Créer un compte', ok: 'Créer le compte',
      corps: `
        <div><label for="u_ident">Identifiant (login) *</label><input id="u_ident" name="identifiant" required pattern="[a-zA-Z0-9._\\-]{3,32}" placeholder="ex. awa.kone" autocomplete="off"></div>
        <div><label for="u_nom">Nom complet</label><input id="u_nom" name="nom" placeholder="ex. Awa Koné" autocomplete="off"></div>
        <p class="note large">Identifiant : 3 à 32 caractères, lettres, chiffres, point, tiret ou tiret bas, sans espace ni accent.</p>
        ${CHAMP_MDP}
        <div class="large"><label for="u_role">Rôle *</label><select id="u_role" name="role">
          ${['caissier', 'gestionnaire', 'lecteur', 'admin'].map((r) => `<option value="${r}">${esc(DESCRIPTION_ROLES[r])}</option>`).join('')}
        </select></div>`,
      apres: brancherChampMdp,
      onOk: async (form) => {
        verifierMdp(form.mot_de_passe.value);
        const r = await appelAdmin({
          action: 'create', identifiant: form.identifiant.value, nom: form.nom.value,
          role: form.role.value, mot_de_passe: form.mot_de_passe.value,
        });
        // Le dialogue se ferme après onOk : on affiche le récapitulatif juste après
        setTimeout(() => afficherSecret('Compte créé', r.identifiant, r.mot_de_passe), 0);
        afficher('utilisateurs');
      },
    });
  }

  function changerMotDePasse(id, identifiant) {
    ouvrirDialogue({
      titre: `Nouveau mot de passe pour « ${identifiant} »`, ok: 'Enregistrer',
      corps: `${CHAMP_MDP}<p class="note large">L'ancien mot de passe ne fonctionnera plus.</p>`,
      apres: brancherChampMdp,
      onOk: async (form) => {
        verifierMdp(form.mot_de_passe.value);
        const r = await appelAdmin({ action: 'reset', id, mot_de_passe: form.mot_de_passe.value });
        setTimeout(() => afficherSecret('Mot de passe changé', identifiant, r.mot_de_passe), 0);
      },
    });
  }

  /* ------------------------------------------------------------------
   * Annonce d'ouverture (image ou motion de la cave pendant quelques secondes)
   * ------------------------------------------------------------------ */
  function afficherPub() {
    const pub = CFG.pub;
    if (!pub || pub.active === false) return;
    if (pub.uneFoisParSession) {
      try { if (sessionStorage.getItem('pubVue')) return; sessionStorage.setItem('pubVue', '1'); } catch { /* stockage indisponible */ }
    }
    const zone = $('#pub');
    const enMotion = pub.mode === 'motion' && window.MotionBavins;
    const duree = Math.max(1, Number(pub.duree) || (enMotion ? 11 : 10));
    if (enMotion) {
      // Motion animé (motion.js) à la place de l'affiche fixe
      $('#pub-image').hidden = true;
      $('#pub-fond').hidden = true;
      zone.classList.add('pub-sans-texte', 'pub-motion');
      const toile = $('#pub-motion');
      toile.hidden = false;
      zone.hidden = false;
      document.body.classList.add('pub-ouverte');
      const m = window.MotionBavins.creer(toile);
      m.lire();
      lancerCompteARebours(zone, duree, pub, () => m.arreter());
      return;
    }
    const img = $('#pub-image');
    zone.classList.add('sans-image');           // visuel de secours tant que la photo n'est pas chargée
    img.onload = () => zone.classList.remove('sans-image');
    img.onerror = () => { img.hidden = true; zone.classList.remove('pub-sans-texte'); };
    const fond = $('#pub-fond');
    const entier = pub.ajustement !== 'remplir';
    zone.classList.toggle('pub-entier', entier);
    zone.classList.toggle('pub-sans-texte', pub.afficherTexte === false);
    fond.hidden = !entier;
    fond.onerror = () => { fond.hidden = true; };
    if (pub.image) { img.src = pub.image; if (entier) fond.src = pub.image; } else { img.hidden = true; fond.hidden = true; }
    img.alt = `${CFG.nomEntreprise || 'La cave'}`;
    $('#pub-slogan').textContent = pub.slogan || '';
    zone.hidden = false;
    document.body.classList.add('pub-ouverte');
    lancerCompteARebours(zone, duree, pub);
  }

  // Compte à rebours, barre de progression et fermeture de l'annonce
  function lancerCompteARebours(zone, duree, pub, alaFermeture) {
    const debut = performance.now();
    const barre = $('#pub-progression');
    let fini = false;
    const fermer = () => {
      if (fini) return;
      fini = true;
      if (alaFermeture) alaFermeture();
      zone.classList.add('pub-sortie');
      setTimeout(() => { zone.hidden = true; document.body.classList.remove('pub-ouverte'); }, 400);
    };
    const tic = () => {
      if (fini) return;
      const ecoule = (performance.now() - debut) / 1000;
      $('#pub-secondes').textContent = Math.max(0, Math.ceil(duree - ecoule));
      barre.style.width = `${Math.min(100, (ecoule / duree) * 100)}%`;
      if (ecoule >= duree) fermer(); else requestAnimationFrame(tic);
    };
    requestAnimationFrame(tic);
    if (pub.passable) {
      const b = $('#pub-passer');
      b.hidden = false;
      b.onclick = fermer;
    }
  }

  /* ------------------------------------------------------------------
   * Démarrage
   * ------------------------------------------------------------------ */
  function init() {
    afficherPub();
    if (CFG.nomEntreprise) {
      document.title = `${CFG.nomEntreprise} – Gestion commerciale`;
      $$('.nom-entreprise').forEach((el) => (el.textContent = CFG.nomEntreprise));
      $$('.logo').forEach((el) => (el.textContent = CFG.nomEntreprise.trim().charAt(0).toUpperCase()));
    }
    if (!window.supabase || !CFG.supabaseUrl || /VOTRE-PROJET/.test(CFG.supabaseUrl)) {
      montrerConnexion('Configuration manquante : renseignez public/config.js (adresse et clé Supabase).');
      return;
    }
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });

    $('#form-connexion').onsubmit = async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const btn = $('button[type=submit]', f);
      btn.disabled = true; btn.classList.add('occupe');
      $('#erreur-connexion').textContent = '';
      const { error } = await sb.auth.signInWithPassword({ email: versEmail(f.identifiant.value), password: f.mot_de_passe.value });
      btn.disabled = false; btn.classList.remove('occupe');
      if (error) { $('#erreur-connexion').textContent = messageErreur(error); return; }
      f.mot_de_passe.value = '';
    };
    $('#btn-deconnexion').onclick = () => { fermerPanneaux(); sb.auth.signOut(); };
    $('#btn-menu').onclick = ouvrirMenu;
    $('#btn-fermer-menu').onclick = fermerMenu;
    $('#voile-menu').onclick = fermerMenu;
    $('#barre').addEventListener('keydown', (e) => { if (e.key === 'Escape') { fermerMenu(); $('#btn-menu').focus(); } });

    // recherche globale
    const champ = $('#recherche-globale');
    champ.addEventListener('input', attendre(() => rechercherPartout(champ.value), 220));
    champ.addEventListener('keydown', (e) => {
      const items = $$('#resultats-globaux .resultat');
      const i = items.findIndex((b) => b.classList.contains('actif'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const j = e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
        items.forEach((b, k) => b.classList.toggle('actif', k === j));
      } else if (e.key === 'Enter' && items.length) { e.preventDefault(); choisirResultat(Math.max(0, i)); }
      else if (e.key === 'Escape') { fermerRecherche(); }
    });
    // panneaux du haut
    $('#btn-notifs').onclick = (e) => {
      e.stopPropagation();
      const ouvrir = $('#panneau-notifs').hidden;
      fermerPanneaux();
      if (ouvrir) { $('#panneau-notifs').hidden = false; $('#btn-notifs').setAttribute('aria-expanded', 'true'); chargerNotifications(); }
    };
    $('#btn-tout-lu').onclick = () => { const l = lirelues(); notifs.forEach((n) => l.add(n.cle)); ecrireLues(l); dessinerNotifications(); };
    $('#btn-profil').onclick = (e) => {
      e.stopPropagation();
      const ouvrir = $('#menu-profil').hidden;
      fermerPanneaux();
      if (ouvrir) { $('#menu-profil').hidden = false; $('#btn-profil').setAttribute('aria-expanded', 'true'); $('#btn-deconnexion').focus(); }
    };
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.panneau-notifs, .menu-profil')) fermerPanneaux();
      if (!e.target.closest('.recherche-globale')) fermerRecherche();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#dialogue').open) fermerPanneaux(); });
    addEventListener('hashchange', () => { const v = decodeURIComponent(location.hash.slice(1)); if (moi && v && v !== vueActive) afficher(v); });

    sb.auth.onAuthStateChange((evenement, session) => {
      if (evenement === 'SIGNED_OUT') { montrerConnexion(); return; }
      if (evenement === 'INITIAL_SESSION' || evenement === 'SIGNED_IN') {
        // Différé : on ne doit pas appeler Supabase dans ce rappel
        setTimeout(() => demarrer(session), 0);
      }
    });
  }

  // Boîte à outils partagée avec les modules (caisse, stock, statistiques)
  Object.assign(GP, {
    $, $$, esc, nf, nf2, fcfa, dateFr, dateHeureFr, aujourdhui, isoLocal, normaliser, icone, attendre, reduit, badge, lienWhatsApp,
    toast, messageErreur, ouvrirDialogue, chargement, imprimer, telechargerCSV, afficher, chargerNotifications, equipe,
    peutEcrire, peutVendre, estAdmin, estCaissier, ROLES, COULEURS_STATUT, CATEGORIES_PRODUITS, ENTITES,
  });
  // accesseurs (Object.assign copierait leur valeur du moment, pas l'accesseur)
  Object.defineProperties(GP, {
    sb: { get: () => sb }, moi: { get: () => moi }, vue: { get: () => vueActive }, cfg: { get: () => CFG },
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
