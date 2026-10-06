/* GestPro – interface (Supabase + Cloudflare Pages)
 * Toutes les règles de sécurité sont appliquées par la base (RLS) et par
 * la fonction Edge « admin-users » : l'interface ne fait que masquer les
 * boutons inutiles selon le rôle. */
(() => {
  'use strict';

  const CFG = window.GESTPRO_CONFIG || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const fcfa = (n) => nf.format(Number(n) || 0) + ' FCFA';
  const dateFr = (d) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('fr-FR') : '');
  const dateHeureFr = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const aujourdhui = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  const ROLES = { admin: 'Administrateur', gestionnaire: 'Gestionnaire', lecteur: 'Lecteur' };
  const PAIEMENTS = ['Espèces', 'Mobile Money', 'Virement', 'Chèque', 'Carte bancaire', 'Crédit'];
  const COULEURS_STATUT = {
    'en attente': 'orange', 'reçue': 'vert', 'annulée': 'rouge',
    'en préparation': 'orange', 'en cours': 'accent', 'livrée': 'vert',
  };

  /* ------------------------------------------------------------------
   * Description des entités : tout l'écran CRUD est généré à partir d'ici
   * ------------------------------------------------------------------ */
  const ENTITES = {
    clients: {
      titre: 'Clients', article: 'un client', ordre: [['nom', true]],
      champs: [
        { k: 'nom', l: 'Nom / raison sociale', req: true, large: true },
        { k: 'telephone', l: 'Téléphone', type: 'tel' },
        { k: 'email', l: 'E-mail', type: 'email' },
        { k: 'adresse', l: 'Adresse', large: true },
        { k: 'notes', l: 'Notes', type: 'textarea', liste: false },
      ],
    },
    ventes: {
      titre: 'Ventes', article: 'une vente', ordre: [['date', false], ['id', false]],
      champs: [
        { k: 'date', l: 'Date', type: 'date', req: true, defaut: aujourdhui },
        { k: 'client_id', l: 'Client', type: 'ref', ref: 'clients' },
        { k: 'produit_id', l: 'Produit', type: 'ref', ref: 'produits', req: true, large: true },
        { k: 'quantite', l: 'Quantité', type: 'number', req: true, min: 1, num: true },
        { k: 'prix_unitaire', l: 'Prix unitaire', type: 'money', req: true },
        { k: 'montant', l: 'Montant', type: 'money', form: false, total: true },
        { k: 'mode_paiement', l: 'Paiement', type: 'select', opts: PAIEMENTS, defaut: () => 'Espèces' },
        { k: 'notes', l: 'Notes', type: 'textarea', liste: false },
      ],
      surChange: { produit_id: (form, p) => { if (p && !form.prix_unitaire.value) form.prix_unitaire.value = p.prix_vente; } },
      aide: 'Le stock du produit baisse automatiquement. La vente est refusée si le stock est insuffisant.',
    },
    commandes: {
      titre: 'Commandes', article: 'une commande', ordre: [['date', false], ['id', false]],
      champs: [
        { k: 'date', l: 'Date', type: 'date', req: true, defaut: aujourdhui },
        { k: 'fournisseur_id', l: 'Fournisseur', type: 'ref', ref: 'fournisseurs' },
        { k: 'produit_id', l: 'Produit', type: 'ref', ref: 'produits', req: true, large: true },
        { k: 'quantite', l: 'Quantité', type: 'number', req: true, min: 1, num: true },
        { k: 'prix_unitaire', l: "Prix d'achat unitaire", type: 'money' },
        { k: 'montant', l: 'Montant', type: 'money', form: false, total: true },
        { k: 'statut', l: 'Statut', type: 'select', opts: ['en attente', 'reçue', 'annulée'], defaut: () => 'en attente', badge: true },
        { k: 'notes', l: 'Notes', type: 'textarea', liste: false },
      ],
      surChange: {
        produit_id: (form, p) => {
          if (!p) return;
          if (!form.prix_unitaire.value) form.prix_unitaire.value = p.prix_achat;
          if (!form.fournisseur_id.value && p.fournisseur_id) form.fournisseur_id.value = p.fournisseur_id;
        },
      },
      aide: 'Commandes passées aux fournisseurs. Au statut « reçue », la quantité est ajoutée au stock.',
    },
    depenses: {
      titre: 'Dépenses', article: 'une dépense', ordre: [['date', false], ['id', false]],
      champs: [
        { k: 'date', l: 'Date', type: 'date', req: true, defaut: aujourdhui },
        { k: 'libelle', l: 'Libellé', req: true, large: true },
        { k: 'categorie', l: 'Catégorie', type: 'liste', opts: ['Loyer', 'Salaires', 'Électricité', 'Eau', 'Transport', 'Carburant', 'Fournitures', 'Impôts et taxes', 'Entretien', 'Communication', 'Autre'] },
        { k: 'montant', l: 'Montant', type: 'money', req: true, total: true },
        { k: 'mode_paiement', l: 'Paiement', type: 'select', opts: PAIEMENTS, defaut: () => 'Espèces' },
        { k: 'notes', l: 'Notes', type: 'textarea', liste: false },
      ],
    },
    livraisons: {
      titre: 'Livraisons', article: 'une livraison', ordre: [['date', false], ['id', false]],
      champs: [
        { k: 'date', l: 'Date', type: 'date', req: true, defaut: aujourdhui },
        { k: 'client_id', l: 'Client', type: 'ref', ref: 'clients' },
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
      titre: 'Stock', article: 'un produit', ordre: [['designation', true]],
      champs: [
        { k: 'reference', l: 'Référence' },
        { k: 'designation', l: 'Désignation', req: true },
        { k: 'categorie', l: 'Catégorie' },
        { k: 'quantite', l: 'Quantité en stock', type: 'number', min: 0, defaut: () => 0, num: true },
        { k: 'prix_achat', l: "Prix d'achat", type: 'money', defaut: () => 0 },
        { k: 'prix_vente', l: 'Prix de vente', type: 'money', defaut: () => 0 },
        { k: 'seuil_alerte', l: "Seuil d'alerte", type: 'number', min: 0, defaut: () => 5, num: true },
        { k: 'fournisseur_id', l: 'Fournisseur', type: 'ref', ref: 'fournisseurs' },
      ],
      classeLigne: (r) => (r.quantite <= r.seuil_alerte ? 'alerte' : ''),
      aide: 'Les lignes en rouge ont atteint le seuil d’alerte.',
    },
    fournisseurs: {
      titre: 'Fournisseurs', article: 'un fournisseur', ordre: [['nom', true]],
      champs: [
        { k: 'nom', l: 'Nom / raison sociale', req: true, large: true },
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
    clients: { cols: 'id, nom, adresse', libelle: (r) => r.nom, ordre: 'nom' },
    fournisseurs: { cols: 'id, nom', libelle: (r) => r.nom, ordre: 'nom' },
    produits: {
      cols: 'id, designation, reference, quantite, prix_achat, prix_vente, fournisseur_id', ordre: 'designation',
      libelle: (r) => `${r.designation}${r.reference ? ' (' + r.reference + ')' : ''} — stock : ${r.quantite}`,
    },
    ventes: { cols: 'id, date, montant', libelle: (r) => `Vente n°${r.id} du ${dateFr(r.date)} — ${fcfa(r.montant)}`, ordre: 'id', desc: true },
  };
  // Nom affiché dans les tableaux pour les colonnes de référence
  const COLONNE_REF = { clients: 'nom', fournisseurs: 'nom', produits: 'designation' };

  /* ------------------------------------------------------------------
   * État
   * ------------------------------------------------------------------ */
  let sb = null;
  let moi = null;            // { id, identifiant, nom, role }
  let vueActive = 'tableau';
  let lignes = [];           // lignes de la vue active
  let minuteur = null;

  const peutEcrire = () => moi && (moi.role === 'admin' || moi.role === 'gestionnaire');

  /* ------------------------------------------------------------------
   * Utilitaires d'interface
   * ------------------------------------------------------------------ */
  function toast(msg, erreur = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('erreur-toast', erreur);
    t.classList.add('visible');
    clearTimeout(t._m);
    t._m = setTimeout(() => t.classList.remove('visible'), erreur ? 5000 : 2500);
  }

  function messageErreur(e) {
    if (!e) return 'Erreur inconnue';
    const m = e.message || String(e);
    if (e.code === '42501' || /row-level security|permission denied/i.test(m)) return "Vous n'avez pas les droits pour cette action.";
    if (e.code === '23503') return 'Impossible : cet élément est utilisé ailleurs (vente, commande…).';
    if (e.code === '23505') return 'Cette valeur existe déjà (référence ou identifiant en double).';
    if (e.code === '23514') return 'Valeur refusée : vérifiez les quantités et montants (pas de négatif).';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Connexion impossible. Vérifiez votre réseau.';
    if (/Invalid login credentials/i.test(m)) return 'Identifiant ou mot de passe incorrect.';
    return m;
  }

  // Dialogue générique. onOk(form) peut lever une erreur : elle s'affiche dans le dialogue.
  function ouvrirDialogue({ titre, corps, ok = 'Enregistrer', onOk, sansAnnuler = false, apres }) {
    const dlg = $('#dialogue');
    const form = $('#form-dialogue');
    $('#dialogue-titre').textContent = titre;
    $('#dialogue-corps').innerHTML = corps;
    $('#dialogue-erreur').textContent = '';
    $('#dialogue-ok').textContent = ok;
    $('#dialogue-annuler').hidden = sansAnnuler;
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const btn = $('#dialogue-ok');
      btn.disabled = true;
      try {
        if (onOk) await onOk(form);
        dlg.close();
      } catch (e) {
        $('#dialogue-erreur').textContent = messageErreur(e);
      } finally {
        btn.disabled = false;
      }
    };
    $('#dialogue-annuler').onclick = () => dlg.close();
    dlg.showModal();
    if (apres) apres(form);
    const premier = $('input:not([readonly]), select, textarea', form);
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
            toast('Copié');
          } catch { toast('Copie impossible : sélectionnez le texte à la main', true); }
        };
      },
    });
  }

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
    clearInterval(minuteur);
    $('#ecran-app').hidden = true;
    $('#ecran-connexion').hidden = false;
    $('#erreur-connexion').textContent = erreur;
  }

  function montrerApp() {
    $('#ecran-connexion').hidden = true;
    $('#ecran-app').hidden = false;
    $('#profil-nom').textContent = moi.nom || moi.identifiant;
    $('#profil-role').textContent = `${ROLES[moi.role]} · ${moi.identifiant}`;
    construireMenu();
    afficher(vueAccueil());
    clearInterval(minuteur);
    // Rafraîchissement régulier pour voir le travail des collègues
    minuteur = setInterval(() => {
      if (!document.hidden && !$('#dialogue').open && vueActive !== 'utilisateurs') afficher(vueActive, true);
    }, 30000);
  }

  /* ------------------------------------------------------------------
   * Navigation
   * ------------------------------------------------------------------ */
  function construireMenu() {
    const items = Object.entries(ENTITES).map(([k, e]) => [k, e.titre]);
    // Le tableau de bord est réservé à l'administrateur
    if (moi.role === 'admin') items.unshift(['tableau', 'Tableau de bord']);
    let html = items.map(([k, l]) => `<button data-vue="${k}">${esc(l)}</button>`).join('');
    if (moi.role === 'admin') html += '<div class="sep"></div><button data-vue="utilisateurs">Utilisateurs</button>';
    $('#menu').innerHTML = html;
    $$('#menu button').forEach((b) => (b.onclick = () => { $('.barre').classList.remove('ouverte'); afficher(b.dataset.vue); }));
  }

  const vueAccueil = () => (moi.role === 'admin' ? 'tableau' : 'ventes');

  async function afficher(vue, silencieux = false) {
    if (vue === 'tableau' && moi.role !== 'admin') vue = 'ventes';
    vueActive = vue;
    $$('#menu button').forEach((b) => b.classList.toggle('actif', b.dataset.vue === vue));
    try {
      if (vue === 'tableau') await vueTableau(silencieux);
      else if (vue === 'utilisateurs') await vueUtilisateurs();
      else await vueEntite(vue, silencieux);
    } catch (e) {
      if (!silencieux) {
        $('#vue').innerHTML = `<div class="bloc"><p class="erreur">${esc(messageErreur(e))}</p></div>`;
      }
    }
  }

  /* ------------------------------------------------------------------
   * Tableau de bord
   * ------------------------------------------------------------------ */
  async function vueTableau() {
    $('#titre-vue').textContent = 'Tableau de bord';
    $('#actions-vue').innerHTML = '';
    const [{ data: t, error }, { data: dernieres, error: e2 }] = await Promise.all([
      sb.rpc('tableau_de_bord'),
      sb.from('ventes').select('id, date, quantite, montant, client:clients!client_id(nom), produit:produits!produit_id(designation)')
        .order('date', { ascending: false }).order('id', { ascending: false }).limit(8),
    ]);
    if (error) throw error;
    if (e2) throw e2;
    if (vueActive !== 'tableau') return;
    const resultat = t.ca - t.depenses;
    const resultatMois = t.ca_mois - t.depenses_mois;
    const kpi = (lib, val, sous = '', cls = '') => `<div class="kpi ${cls}"><div class="lib">${esc(lib)}</div><div class="val">${esc(val)}</div>${sous ? `<div class="sous">${esc(sous)}</div>` : ''}</div>`;
    $('#vue').innerHTML = `
      <div class="kpis">
        ${kpi("Chiffre d'affaires", fcfa(t.ca), `Ce mois : ${fcfa(t.ca_mois)}`)}
        ${kpi('Dépenses', fcfa(t.depenses), `Ce mois : ${fcfa(t.depenses_mois)}`)}
        ${kpi('Résultat', fcfa(resultat), `Ce mois : ${fcfa(resultatMois)}`, resultat >= 0 ? 'positif' : 'negatif')}
        ${kpi('Valeur du stock', fcfa(t.valeur_stock), "Au prix d'achat")}
        ${kpi('Commandes en attente', nf.format(t.commandes_attente))}
        ${kpi('Livraisons en cours', nf.format(t.livraisons_cours))}
        ${kpi('Clients', nf.format(t.nb_clients))}
        ${kpi('Alertes de stock', nf.format(t.alertes.length), '', t.alertes.length ? 'negatif' : '')}
      </div>
      <div class="grille-2">
        <div class="bloc"><h3>Stock bas</h3>
          ${t.alertes.length ? `<div class="table-wrap"><table><thead><tr><th>Produit</th><th class="num">Stock</th><th class="num">Seuil</th></tr></thead><tbody>
            ${t.alertes.map((a) => `<tr><td>${esc(a.designation)}</td><td class="num">${nf.format(a.quantite)}</td><td class="num">${nf.format(a.seuil)}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="vide">Aucun produit sous le seuil d’alerte.</p>'}
        </div>
        <div class="bloc"><h3>Dernières ventes</h3>
          ${dernieres.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Produit</th><th>Client</th><th class="num">Montant</th></tr></thead><tbody>
            ${dernieres.map((v) => `<tr><td>${dateFr(v.date)}</td><td>${esc(v.produit?.designation)} × ${v.quantite}</td><td>${esc(v.client?.nom || '—')}</td><td class="num">${fcfa(v.montant)}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="vide">Aucune vente enregistrée.</p>'}
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------
   * Écrans des entités
   * ------------------------------------------------------------------ */
  const champsListe = (ent) => ent.champs.filter((c) => c.liste !== false);
  const champsForm = (ent) => ent.champs.filter((c) => c.form !== false);

  function requeteSelect(ent) {
    const jointures = ent.champs
      .filter((c) => c.type === 'ref' && !c.sansJointure && c.liste !== false)
      .map((c) => `r_${c.k}:${c.ref}!${c.k}(${COLONNE_REF[c.ref]})`);
    return ['*', ...jointures].join(', ');
  }

  function valeurAffichee(c, r) {
    const v = r[c.k];
    if (c.type === 'ref') {
      if (v == null) return '';
      if (c.sansJointure) return c.ref === 'ventes' ? `Vente n°${v}` : `#${v}`;
      return r['r_' + c.k]?.[COLONNE_REF[c.ref]] ?? `#${v}`;
    }
    if (c.type === 'money') return fcfa(v);
    if (c.type === 'date') return dateFr(v);
    if (c.num) return nf.format(v ?? 0);
    return v ?? '';
  }

  function celluleHTML(c, r) {
    const brut = valeurAffichee(c, r);
    if (c.badge && r[c.k]) return `<td><span class="badge ${COULEURS_STATUT[r[c.k]] || ''}">${esc(brut)}</span></td>`;
    const num = c.type === 'money' || c.num;
    return `<td class="${num ? 'num' : c.type === 'textarea' ? 'texte' : ''}">${esc(brut)}</td>`;
  }

  async function vueEntite(cle, silencieux) {
    const ent = ENTITES[cle];
    $('#titre-vue').textContent = ent.titre;
    if (!silencieux) {
      $('#actions-vue').innerHTML = `
        <button class="btn" id="btn-csv">Exporter CSV</button>
        ${peutEcrire() ? `<button class="btn primaire" id="btn-ajouter">+ Ajouter</button>` : ''}`;
      $('#vue').innerHTML = `
        ${ent.aide ? `<p class="note">${esc(ent.aide)}</p><br>` : ''}
        <div class="outils"><input type="search" id="recherche" placeholder="Rechercher…" aria-label="Rechercher"></div>
        <div id="liste"><p class="vide">Chargement…</p></div>`;
      $('#recherche').oninput = () => dessinerListe(cle);
      $('#btn-csv').onclick = () => exporterCSV(cle);
      if (peutEcrire()) $('#btn-ajouter').onclick = () => formulaire(cle, null);
    }
    let q = sb.from(cle).select(requeteSelect(ent));
    for (const [col, asc] of ent.ordre) q = q.order(col, { ascending: asc });
    const { data, error } = await q.limit(2000);
    if (error) throw error;
    if (vueActive !== cle) return;
    lignes = data;
    dessinerListe(cle);
  }

  function lignesFiltrees(cle) {
    const ent = ENTITES[cle];
    const terme = ($('#recherche')?.value || '').trim().toLowerCase();
    if (!terme) return lignes;
    return lignes.filter((r) => ent.champs.some((c) => String(valeurAffichee(c, r)).toLowerCase().includes(terme)));
  }

  function dessinerListe(cle) {
    const ent = ENTITES[cle];
    const cols = champsListe(ent);
    const rows = lignesFiltrees(cle);
    const zone = $('#liste');
    if (!zone) return;
    if (!rows.length) {
      zone.innerHTML = `<div class="table-wrap"><p class="vide">${lignes.length ? 'Aucun résultat.' : 'Aucun enregistrement pour le moment.'}</p></div>`;
      return;
    }
    const totaux = cols.filter((c) => c.total);
    zone.innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr>${cols.map((c) => `<th class="${c.type === 'money' || c.num ? 'num' : ''}">${esc(c.l)}</th>`).join('')}${peutEcrire() ? '<th></th>' : ''}</tr></thead>
        <tbody>${rows.map((r) => `
          <tr class="${ent.classeLigne ? ent.classeLigne(r) : ''}">
            ${cols.map((c) => celluleHTML(c, r)).join('')}
            ${peutEcrire() ? `<td class="acts"><button class="btn petit" data-mod="${r.id}">Modifier</button><button class="btn petit danger" data-sup="${r.id}">Supprimer</button></td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table></div>
      <div class="compteur">${nf.format(rows.length)} élément(s)${totaux.map((c) => ` · Total ${esc(c.l.toLowerCase())} : <strong>${fcfa(rows.reduce((s, r) => s + Number(r[c.k] || 0), 0))}</strong>`).join('')}</div>`;
    $$('[data-mod]', zone).forEach((b) => (b.onclick = () => formulaire(cle, lignes.find((r) => r.id == b.dataset.mod))));
    $$('[data-sup]', zone).forEach((b) => (b.onclick = () => supprimer(cle, Number(b.dataset.sup))));
  }

  async function chargerOptions(ref) {
    const d = LIBELLES_REF[ref];
    const { data, error } = await sb.from(ref).select(d.cols).order(d.ordre, { ascending: !d.desc }).limit(2000);
    if (error) throw error;
    return data;
  }

  function champHTML(c, val, options) {
    const id = `f_${c.k}`;
    const req = c.req ? 'required' : '';
    const etiquette = `${esc(c.l)}${c.req ? ' *' : ''}`;
    let input;
    switch (c.type) {
      case 'textarea':
        input = `<textarea id="${id}" name="${c.k}" ${req}>${esc(val)}</textarea>`; break;
      case 'select':
        input = `<select id="${id}" name="${c.k}" ${req}>${c.opts.map((o) => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`; break;
      case 'liste':
        input = `<input id="${id}" name="${c.k}" list="dl_${c.k}" value="${esc(val)}" ${req}><datalist id="dl_${c.k}">${c.opts.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>`; break;
      case 'ref': {
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
    return `<div class="${c.large || c.type === 'textarea' ? 'large' : ''}"><label for="${id}">${etiquette}</label>${input}</div>`;
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
      corps: champs.map((c) => champHTML(c, valeurInitiale(c), options[c.ref] || [])).join(''),
      apres: (form) => {
        for (const [k, fn] of Object.entries(ent.surChange || {})) {
          const champ = champs.find((c) => c.k === k);
          form[k].addEventListener('change', () => fn(form, (options[champ.ref] || []).find((o) => o.id == form[k].value)));
        }
      },
      onOk: async (form) => {
        const donnees = {};
        for (const c of champs) {
          const v = form[c.k].value.trim();
          if (v === '') donnees[c.k] = null;
          else if (c.type === 'ref' || c.type === 'number' || c.type === 'money') donnees[c.k] = Number(v);
          else donnees[c.k] = v;
          // Les champs avec valeur par défaut en base ne doivent pas recevoir null
          if (donnees[c.k] === null && c.defaut && !c.req) delete donnees[c.k];
        }
        const { error } = ligne
          ? await sb.from(cle).update(donnees).eq('id', ligne.id)
          : await sb.from(cle).insert(donnees);
        if (error) throw error;
        toast(ligne ? 'Modifications enregistrées' : 'Ajouté');
        afficher(cle, true);
      },
    });
  }

  async function supprimer(cle, id) {
    const ent = ENTITES[cle];
    let avert = `Supprimer ${ent.article.replace(/^une? /, (m) => (m === 'un ' ? 'ce ' : 'cette '))} ? Cette action est définitive.`;
    if (cle === 'ventes') avert += '\nLa quantité vendue sera remise en stock.';
    if (cle === 'commandes') avert += '\nSi la commande était reçue, la quantité sera retirée du stock.';
    if (!confirm(avert)) return;
    const { error } = await sb.from(cle).delete().eq('id', id);
    if (error) { toast(messageErreur(error), true); return; }
    toast('Supprimé');
    afficher(cle, true);
  }

  function exporterCSV(cle) {
    const ent = ENTITES[cle];
    const cols = ent.champs;
    const cellule = (v) => {
      const s = String(v ?? '');
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const brut = (c, r) => (c.type === 'money' ? (r[c.k] ?? '') : c.num ? (r[c.k] ?? '') : valeurAffichee(c, r));
    const csv = [cols.map((c) => cellule(c.l)).join(';'),
      ...lignesFiltrees(cle).map((r) => cols.map((c) => cellule(brut(c, r))).join(';'))].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${cle}-${aujourdhui()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ------------------------------------------------------------------
   * Utilisateurs (administrateur)
   * ------------------------------------------------------------------ */
  async function appelAdmin(body) {
    const { data, error } = await sb.functions.invoke('admin-users', { body });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.error || msg; } catch { /* réponse non JSON */ }
      throw new Error(msg);
    }
    return data;
  }

  async function vueUtilisateurs() {
    $('#titre-vue').textContent = 'Utilisateurs';
    $('#actions-vue').innerHTML = '<button class="btn primaire" id="btn-gen">+ Créer un compte</button>';
    $('#btn-gen').onclick = creerCompte;
    $('#vue').innerHTML = '<p class="note">Créez ici les comptes de votre équipe, avec l’identifiant et le mot de passe de votre choix. Gestionnaire : lecture et écriture. Lecteur : lecture seule.</p><br><div id="liste"><p class="vide">Chargement…</p></div>';
    const { users } = await appelAdmin({ action: 'list' });
    if (vueActive !== 'utilisateurs') return;
    $('#liste').innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Identifiant</th><th>Nom</th><th>Rôle</th><th>Dernière connexion</th><th>Créé le</th><th></th></tr></thead>
      <tbody>${users.map((u) => `
        <tr>
          <td><strong>${esc(u.identifiant)}</strong>${u.moi ? ' <span class="badge accent">vous</span>' : ''}</td>
          <td>${esc(u.nom || '')}</td>
          <td>${u.moi ? `<span class="badge">${ROLES[u.role]}</span>` : `<select data-role="${u.id}" aria-label="Rôle">${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${l}</option>`).join('')}</select>`}</td>
          <td>${dateHeureFr(u.last_sign_in_at)}</td>
          <td>${dateFr(u.created_at)}</td>
          <td class="acts">${u.moi ? '' : `<button class="btn petit" data-reset="${u.id}" data-ident="${esc(u.identifiant)}">Changer le mot de passe</button><button class="btn petit danger" data-del="${u.id}" data-ident="${esc(u.identifiant)}">Supprimer</button>`}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
    $$('[data-role]').forEach((s) => (s.onchange = async () => {
      try { await appelAdmin({ action: 'set_role', id: s.dataset.role, role: s.value }); toast('Rôle modifié'); }
      catch (e) { toast(messageErreur(e), true); }
      afficher('utilisateurs');
    }));
    $$('[data-reset]').forEach((b) => (b.onclick = () => changerMotDePasse(b.dataset.reset, b.dataset.ident)));
    $$('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!confirm(`Supprimer le compte « ${b.dataset.ident} » ? La personne perdra immédiatement l'accès.`)) return;
      try { await appelAdmin({ action: 'delete', id: b.dataset.del }); toast('Compte supprimé'); }
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
          <option value="gestionnaire">Gestionnaire (lecture et écriture)</option>
          <option value="lecteur">Lecteur (lecture seule)</option>
          <option value="admin">Administrateur (tout, y compris les comptes)</option>
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
   * Démarrage
   * ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------
   * Annonce d'ouverture (image de la cave pendant quelques secondes)
   * ------------------------------------------------------------------ */
  function afficherPub() {
    const pub = CFG.pub;
    if (!pub || pub.active === false) return;
    if (pub.uneFoisParSession) {
      try { if (sessionStorage.getItem('pubVue')) return; sessionStorage.setItem('pubVue', '1'); } catch { /* stockage indisponible */ }
    }
    const duree = Math.max(1, Number(pub.duree) || 10);
    const zone = $('#pub');
    const img = $('#pub-image');
    zone.classList.add('sans-image');           // visuel de secours tant que la photo n'est pas chargée
    img.onload = () => zone.classList.remove('sans-image');
    img.onerror = () => { img.hidden = true; };
    if (pub.image) img.src = pub.image; else img.hidden = true;
    img.alt = `${CFG.nomEntreprise || 'La cave'}`;
    $('#pub-slogan').textContent = pub.slogan || '';
    zone.hidden = false;
    document.body.classList.add('pub-ouverte');

    const debut = performance.now();
    const barre = $('#pub-progression');
    let fini = false;
    const fermer = () => {
      if (fini) return;
      fini = true;
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
      btn.disabled = true;
      $('#erreur-connexion').textContent = '';
      const { error } = await sb.auth.signInWithPassword({ email: versEmail(f.identifiant.value), password: f.mot_de_passe.value });
      btn.disabled = false;
      if (error) { $('#erreur-connexion').textContent = messageErreur(error); return; }
      f.mot_de_passe.value = '';
    };
    $('#btn-deconnexion').onclick = () => sb.auth.signOut();
    $('#btn-menu').onclick = () => $('.barre').classList.toggle('ouverte');

    sb.auth.onAuthStateChange((evenement, session) => {
      if (evenement === 'SIGNED_OUT') { montrerConnexion(); return; }
      if (evenement === 'INITIAL_SESSION' || evenement === 'SIGNED_IN') {
        // Différé : on ne doit pas appeler Supabase dans ce rappel
        setTimeout(() => demarrer(session), 0);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
