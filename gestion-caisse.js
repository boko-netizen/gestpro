/* GestPro – caisse rapide, tickets de caisse et crédits clients.
 * Le navigateur n'envoie que les produits, conditionnements et quantités :
 * prix, remise autorisée, stock et crédit sont vérifiés par la base
 * (fonction enregistrer_vente). Une clé unique par ticket empêche les
 * doubles validations (double clic, réseau lent). */
(() => {
  'use strict';
  const GP = window.GP;
  const { $, $$, esc, nf, fcfa, dateFr, dateHeureFr, aujourdhui, isoLocal, normaliser, icone, attendre, badge, toast, messageErreur, ouvrirDialogue, chargement } = GP;
  const MODES = ['Espèces', 'Mobile Money', 'Carte bancaire', 'Virement', 'Crédit'];
  const cleNeuve = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const plusMois = (iso, n) => { const d = new Date(iso + 'T00:00:00'); const j = d.getDate(); d.setMonth(d.getMonth() + n); if (d.getDate() < j) d.setDate(0); return isoLocal(d); };

  /* ------------------------------------------------------------------
   * Reçu (ticket de caisse)
   * ------------------------------------------------------------------ */
  function recuHTML(t, { vendeur = '', client = '', paiements = [] } = {}) {
    const cfg = GP.cfg;
    const l = (a, b, cls = '') => `<div class="l ${cls}"><span>${a}</span><span>${b}</span></div>`;
    const lignes = (t.lignes || []).map((x) => `${l(`${esc(x.designation)}${x.conditionnement ? ` <br>&nbsp;&nbsp;${esc(x.conditionnement)} de ${x.unites_par}` : ''}`, '')}${l(`&nbsp;&nbsp;${nf.format(x.quantite)} × ${fcfa(x.prix)}`, fcfa(x.montant))}`).join('');
    const paye = paiements.reduce((s, p) => s + Number(p.montant), 0);
    return `<div class="recu">
      <h4>${esc(cfg.nomEntreprise || 'La cave')}</h4>
      ${cfg.ticket?.entete ? `<p class="centre">${esc(cfg.ticket.entete)}</p>` : ''}
      <p class="centre">Ticket n°${t.id} · ${esc(dateHeureFr(t.created_at))}</p>
      ${vendeur ? `<p class="centre">Servi par : ${esc(vendeur)}</p>` : ''}
      ${client ? `<p class="centre">Client : ${esc(client)}</p>` : ''}
      ${t.statut === 'annulée' ? `<p class="annule">VENTE ANNULÉE${t.motif_annulation ? ` – ${esc(t.motif_annulation)}` : ''}</p>` : ''}
      <hr>${lignes}<hr>
      ${l('Sous-total', fcfa(t.sous_total))}
      ${Number(t.remise) ? l('Remise', '− ' + fcfa(t.remise)) : ''}
      ${l('TOTAL', fcfa(t.total), 'gros')}
      ${t.est_credit ? `${Number(t.interets) ? l(`Intérêts (${nf.format(t.taux_interet)} %)`, fcfa(t.interets)) : ''}${l('Montant dû', fcfa(t.montant_du), 'gros')}
        ${l(`Échéances`, `${t.nb_echeances} × ${fcfa((Number(t.montant_du) - Number(t.acompte ?? paiements.find((p) => p.notes === 'Acompte à la vente')?.montant ?? 0)) / t.nb_echeances)}`)}
        ${l('1re échéance', dateFr(t.premiere_echeance))}
        ${paiements.length || t.acompte ? l('Déjà payé', fcfa(paiements.length ? paye : t.acompte)) : ''}
        ${l('Reste à payer', fcfa(Number(t.montant_du) - (paiements.length ? paye : Number(t.acompte || 0))))}`
      : `${l('Paiement', esc(t.mode_paiement))}${t.montant_recu != null ? l('Reçu', fcfa(t.montant_recu)) + l('Monnaie rendue', fcfa(t.monnaie)) : ''}`}
      <hr><p class="centre">${esc(cfg.ticket?.pied || 'Merci de votre visite !')}</p>
      <p class="centre">L'abus d'alcool est dangereux pour la santé.</p>
    </div>`;
  }

  async function ouvrirTicket(id) {
    const sb = GP.sb;
    const [{ data: t, error }, { data: paiements }] = await Promise.all([
      sb.from('tickets').select('*, client:clients!client_id(nom, telephone)').eq('id', id).maybeSingle(),
      sb.from('paiements_credit').select('*').eq('ticket_id', id).order('date'),
    ]);
    if (error || !t) { toast(error ? messageErreur(error) : `Ticket n°${id} introuvable ou non accessible.`, true); return; }
    const noms = await GP.equipe();
    const annulable = GP.peutEcrire() && t.statut === 'validée';
    ouvrirDialogue({
      titre: `Ticket n°${t.id}${t.statut === 'annulée' ? ' (annulé)' : ''}`, simple: true,
      ok: 'Imprimer', annuler: 'Fermer',
      boutons: annulable ? `<button type="button" class="btn danger supp" id="btn-annuler-ticket">${icone('corbeille')} Annuler la vente</button>` : '',
      corps: `${recuHTML(t, { vendeur: noms[t.created_by], client: t.client?.nom, paiements: paiements || [] })}
        ${t.statut === 'annulée' ? `<br><p class="encart danger">Annulé le ${esc(dateHeureFr(t.annule_le))} par ${esc(noms[t.annule_par] || '—')} : ${esc(t.motif_annulation)}. Montant à rembourser au client : <strong>${fcfa(t.montant_rembourse)}</strong>.</p>` : ''}`,
      onOk: () => { GP.imprimer(recuHTML(t, { vendeur: noms[t.created_by], client: t.client?.nom, paiements: paiements || [] })); return false; },
      apres: () => { $('#btn-annuler-ticket')?.addEventListener('click', () => annulerTicket(t)); },
    });
  }

  function annulerTicket(t) {
    ouvrirDialogue({
      titre: `Annuler le ticket n°${t.id} ?`, ok: 'Annuler la vente', annuler: 'Retour',
      corps: `<p class="encart danger large">Les ${t.lignes.reduce((s, l) => s + l.unites, 0)} unité(s) vendue(s) reviendront en stock. Le ticket restera visible avec la mention « annulé » et l’opération sera inscrite au journal.${t.est_credit ? ' Les paiements déjà reçus sur ce crédit seront à rembourser.' : ` Montant à rembourser : ${fcfa(t.total)}.`}</p>
        <div class="large"><label for="motif">Motif de l’annulation *</label><input id="motif" name="motif" required minlength="3" maxlength="200" placeholder="Ex. : erreur de saisie, client a rapporté le produit…" data-focus></div>`,
      onOk: async (form) => {
        const { data, error } = await GP.sb.rpc('annuler_ticket', { p_id: t.id, p_motif: form.motif.value.trim() });
        if (error) throw error;
        toast(`Ticket n°${t.id} annulé · à rembourser : ${fcfa(data.montant_rembourse)}`, 'ok');
        GP.chargerNotifications();
        if (['tickets', 'credits'].includes(GP.vue)) GP.afficher(GP.vue, true);
      },
    });
  }

  /* ------------------------------------------------------------------
   * Caisse
   * ------------------------------------------------------------------ */
  const etat = { produits: [], clients: [], panier: [], cat: '', mode: 'Espèces', remise: '', remiseType: 'fcfa', recu: '', client: '', credit: { taux: '', nb: 3, premiere: '', acompte: '', modeAcompte: 'Espèces' }, cle: cleNeuve(), envoi: false };
  const clePanier = () => `gestpro-panier-${GP.moi?.id}`;
  function sauverPanier() { try { localStorage.setItem(clePanier(), JSON.stringify({ panier: etat.panier, cle: etat.cle })); } catch { /* stockage indisponible */ } }
  function lirePanier() { try { const v = JSON.parse(localStorage.getItem(clePanier()) || 'null'); if (v?.panier) { etat.panier = v.panier; etat.cle = v.cle || cleNeuve(); } } catch { /* ignoré */ } }

  const produit = (id) => etat.produits.find((p) => p.id === id);
  const cond = (p, cid) => (cid ? p.conditionnements.find((c) => c.id === cid) : null);
  const unitesLigne = (l) => l.q * (cond(produit(l.produit_id), l.cond)?.unites || 1);
  const prixLigne = (l) => { const p = produit(l.produit_id); const c = cond(p, l.cond); return c ? Number(c.prix_vente) : Number(p.prix_vente); };
  const unitesProduit = (pid, sauf = null) => etat.panier.filter((l) => l.produit_id === pid && l !== sauf).reduce((s, l) => s + unitesLigne(l), 0);
  const sousTotal = () => etat.panier.reduce((s, l) => s + l.q * prixLigne(l), 0);
  const remiseFCFA = () => {
    const v = Number(String(etat.remise).replace(',', '.')) || 0;
    return Math.max(0, Math.min(sousTotal(), Math.round((etat.remiseType === '%' ? sousTotal() * v / 100 : v) * 100) / 100));
  };
  const total = () => Math.round((sousTotal() - remiseFCFA()) * 100) / 100;

  async function chargerCaisse() {
    const [{ data: produits, error }, { data: clients }] = await Promise.all([
      GP.sb.rpc('produits_caisse'),
      GP.sb.from('clients').select('id, nom, telephone').order('nom').limit(5000),
    ]);
    if (error) throw error;
    etat.produits = produits.map((p) => ({ ...p, prix_vente: Number(p.prix_vente) }));
    etat.clients = clients || [];
    // le panier ne garde que les produits encore vendus
    etat.panier = etat.panier.filter((l) => produit(l.produit_id) && (!l.cond || cond(produit(l.produit_id), l.cond)));
  }

  GP.vues.caisse = async (silencieux) => {
    if (silencieux) return;
    lirePanier();
    GP.filtreInitial = null;
    $('#actions-vue').innerHTML = `<button class="btn" type="button" id="btn-actualiser-caisse" title="Recharger les produits et le stock">${icone('historique')} Actualiser</button>`;
    await chargerCaisse();
    if (GP.vue !== 'caisse') return;
    $('#vue').innerHTML = `
      <div class="caisse">
        <section class="caisse-produits" aria-label="Produits">
          <div class="caisse-recherche">${icone('recherche')}
            <label class="visuellement-cache" for="caisse-q">Rechercher un produit ou scanner un code-barres</label>
            <input id="caisse-q" type="search" placeholder="Rechercher ou scanner un code-barres…  ( / )" autocomplete="off" enterkeyhint="search">
          </div>
          <div class="puces" id="caisse-cats" role="group" aria-label="Catégories"></div>
          <div class="tuiles" id="caisse-tuiles"></div>
        </section>
        <aside class="ticket-panneau" id="ticket-panneau" aria-label="Ticket en cours">
          <div class="ticket-tete"><h3>${icone('ticket')} Ticket en cours</h3>
            <span class="acts-groupe"><button class="btn petit" type="button" id="btn-vider">Vider</button><button class="btn petit fermer-ticket" type="button" id="btn-fermer-ticket" aria-label="Fermer le ticket">${icone('fermer')}</button></span></div>
          <ul class="panier-lignes" id="panier-lignes" aria-live="polite"></ul>
          <div class="ticket-pied" id="ticket-pied"></div>
        </aside>
        <div class="barre-caisse-mobile" id="barre-caisse-mobile">
          <span class="bcm-total" id="bcm-total"></span>
          <button class="btn primaire" type="button" id="btn-voir-ticket">Voir le ticket</button>
        </div>
      </div>`;
    if (GP.rechercheCaisse) { $('#caisse-q').value = GP.rechercheCaisse; GP.rechercheCaisse = ''; }
    $('#btn-actualiser-caisse').onclick = async () => { await chargerCaisse(); dessinerTuiles(); dessinerPanier(); toast('Produits et stock à jour', 'ok'); };
    $('#caisse-q').addEventListener('input', attendre(dessinerTuiles, 120));
    $('#caisse-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); validerRecherche(); } });
    $('#btn-vider').onclick = () => { if (!etat.panier.length || confirm('Vider le ticket en cours ?')) { etat.panier = []; etat.cle = cleNeuve(); sauverPanier(); dessinerPanier(); dessinerTuiles(); } };
    $('#btn-voir-ticket').onclick = () => { $('#ticket-panneau').classList.add('ouvert'); $('#ticket-panneau button, #ticket-panneau input')?.focus(); };
    $('#btn-fermer-ticket').onclick = () => $('#ticket-panneau').classList.remove('ouvert');
    $('#ticket-panneau').addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#ticket-panneau').classList.remove('ouvert'); });
    if (!GP._raccourciCaisse) {
      GP._raccourciCaisse = true;
      document.addEventListener('keydown', (e) => {
        if (GP.vue !== 'caisse' || $('#dialogue').open) return;
        if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); $('#caisse-q')?.focus(); }
      });
    }
    dessinerCategories(); dessinerTuiles(); dessinerPanier();
    if (matchMedia('(min-width: 961px)').matches) $('#caisse-q').focus();
  };

  function dessinerCategories() {
    const cats = [...new Set(etat.produits.map((p) => p.categorie).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    $('#caisse-cats').innerHTML = [['', 'Tout'], ...cats.map((c) => [c, c])].map(([v, l]) => `<button type="button" class="puce" data-cat="${esc(v)}" aria-pressed="${etat.cat === v}">${esc(l)}</button>`).join('');
    $$('#caisse-cats .puce').forEach((b) => (b.onclick = () => { etat.cat = b.dataset.cat; $$('#caisse-cats .puce').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); dessinerTuiles(); }));
  }

  function produitsFiltres() {
    const mots = normaliser($('#caisse-q')?.value || '').split(' ').filter(Boolean);
    return etat.produits.filter((p) => (!etat.cat || p.categorie === etat.cat)
      && mots.every((m) => normaliser(`${p.designation} ${p.marque || ''} ${p.reference || ''} ${p.code_barres || ''} ${p.categorie || ''} ${p.contenance || ''} ${p.conditionnements.map((c) => c.code_barres || '').join(' ')}`).includes(m)));
  }

  function dessinerTuiles() {
    const zone = $('#caisse-tuiles');
    if (!zone) return;
    const liste = produitsFiltres();
    if (!etat.produits.length) { zone.innerHTML = `<p class="vide">Aucun produit actif. ${GP.peutEcrire() ? 'Ajoutez vos boissons dans « Produits et stock ».' : 'Demandez au gestionnaire d’ajouter les produits.'}</p>`; return; }
    if (!liste.length) { zone.innerHTML = '<p class="vide">Aucun produit ne correspond.</p>'; return; }
    zone.innerHTML = liste.slice(0, 120).map((p) => {
      const reste = p.quantite - unitesProduit(p.id);
      const cls = reste <= 0 ? 'zero' : reste <= p.seuil_alerte ? 'bas' : '';
      return `<button type="button" class="tuile" data-p="${p.id}" ${reste <= 0 ? 'disabled' : ''} aria-label="${esc(`${p.designation}, ${fcfa(p.prix_vente)}, ${reste} en stock`)}">
        <span class="t-stock ${cls}">${reste <= 0 ? 'Rupture' : nf.format(reste)}</span>
        ${p.photo_url ? `<img src="${esc(p.photo_url)}" alt="" loading="lazy">` : `<span class="sans-image">${icone('produits')}</span>`}
        <span class="t-nom">${esc(p.designation)}</span>
        <span class="note">${esc([p.contenance, p.emballage].filter(Boolean).join(' · ') || p.categorie || '')}</span>
        <span class="t-prix">${fcfa(p.prix_vente)}${p.conditionnements.length ? ` <span class="note">· ${p.conditionnements.length} pack${p.conditionnements.length > 1 ? 's' : ''}</span>` : ''}</span>
      </button>`;
    }).join('') + (liste.length > 120 ? `<p class="note">${liste.length - 120} autres produits : précisez la recherche.</p>` : '');
    $$('.tuile', zone).forEach((b) => (b.onclick = () => { ajouter(Number(b.dataset.p)); b.classList.remove('ajoute'); void b.offsetWidth; b.classList.add('ajoute'); }));
  }

  function validerRecherche() {
    const v = $('#caisse-q').value.trim();
    if (!v) return;
    // code-barres exact (produit ou conditionnement)
    for (const p of etat.produits) {
      if (p.code_barres && p.code_barres === v) { ajouter(p.id); $('#caisse-q').value = ''; dessinerTuiles(); return; }
      const c = p.conditionnements.find((x) => x.code_barres === v);
      if (c) { ajouter(p.id, c.id); $('#caisse-q').value = ''; dessinerTuiles(); return; }
    }
    const liste = produitsFiltres();
    if (liste.length === 1) { ajouter(liste[0].id); $('#caisse-q').select(); }
    else if (!liste.length) toast(`Aucun produit pour « ${v} »`, true);
  }

  function ajouter(pid, cid = null, q = 1) {
    synchroniser();
    const p = produit(pid);
    if (!p) return;
    const unites = (cond(p, cid)?.unites || 1) * q;
    if (unitesProduit(pid) + unites > p.quantite) { toast(`Stock insuffisant : ${p.quantite} ${p.designation} en stock`, true); return; }
    const l = etat.panier.find((x) => x.produit_id === pid && (x.cond || null) === cid);
    if (l) l.q += q; else etat.panier.push({ produit_id: pid, cond: cid, q });
    sauverPanier(); dessinerPanier(); dessinerTuiles();
  }

  function changerQuantite(l, q) {
    synchroniser();
    q = Math.max(0, Math.min(10000, Math.floor(Number(q) || 0)));
    const p = produit(l.produit_id);
    const parUnite = cond(p, l.cond)?.unites || 1;
    const max = Math.floor((p.quantite - unitesProduit(p.id, l)) / parUnite);
    if (q > max) { toast(`Stock insuffisant : ${max} au maximum pour cette ligne`, true); q = max; }
    if (q <= 0) etat.panier.splice(etat.panier.indexOf(l), 1); else l.q = q;
    sauverPanier(); dessinerPanier(); dessinerTuiles();
  }

  function changerConditionnement(l, cid) {
    synchroniser();
    const p = produit(l.produit_id);
    const parUnite = cond(p, cid)?.unites || 1;
    if (unitesProduit(p.id, l) + l.q * parUnite > p.quantite) { toast(`Stock insuffisant pour passer en ${cond(p, cid)?.nom || 'unité'} : ${p.quantite} unité(s) en stock`, true); dessinerPanier(); return; }
    const autre = etat.panier.find((x) => x !== l && x.produit_id === l.produit_id && (x.cond || null) === cid);
    if (autre) { autre.q += l.q; etat.panier.splice(etat.panier.indexOf(l), 1); } else l.cond = cid;
    sauverPanier(); dessinerPanier(); dessinerTuiles();
  }

  function dessinerPanier() {
    const ul = $('#panier-lignes');
    if (!ul) return;
    ul.innerHTML = etat.panier.length ? etat.panier.map((l, i) => {
      const p = produit(l.produit_id);
      return `<li class="panier-ligne">
        <span class="pl-nom">${esc(p.designation)}<small>${fcfa(prixLigne(l))} ${l.cond ? `le ${esc(cond(p, l.cond).nom.toLowerCase())} de ${cond(p, l.cond).unites}` : 'l’unité'}</small></span>
        <span class="pl-total">${fcfa(l.q * prixLigne(l))}</span>
        <span class="pl-actions">
          <span class="quantite" role="group" aria-label="Quantité de ${esc(p.designation)}">
            <button type="button" data-moins="${i}" aria-label="Retirer un">${icone('moins')}</button>
            <input type="number" inputmode="numeric" min="0" value="${l.q}" data-q="${i}" aria-label="Quantité">
            <button type="button" data-plus="${i}" aria-label="Ajouter un">${icone('plus')}</button>
          </span>
          ${p.conditionnements.length ? `<select data-cond="${i}" aria-label="Vendu à l’unité ou en pack">
            <option value="">Unité</option>${p.conditionnements.map((c) => `<option value="${c.id}" ${c.id === l.cond ? 'selected' : ''}>${esc(c.nom)} de ${c.unites}</option>`).join('')}</select>` : ''}
          <button type="button" class="btn-icone petit danger supprimer" data-suppr="${i}" aria-label="Supprimer ${esc(p.designation)}" title="Supprimer">${icone('corbeille')}</button>
        </span>
      </li>`;
    }).join('') : `<li class="vide">Touchez un produit ou scannez son code-barres pour l’ajouter.</li>`;
    $$('[data-moins]', ul).forEach((b) => (b.onclick = () => { const l = etat.panier[b.dataset.moins]; changerQuantite(l, l.q - 1); $(`[data-moins="${b.dataset.moins}"]`)?.focus(); }));
    $$('[data-plus]', ul).forEach((b) => (b.onclick = () => { const l = etat.panier[b.dataset.plus]; changerQuantite(l, l.q + 1); $(`[data-plus="${b.dataset.plus}"]`)?.focus(); }));
    $$('[data-q]', ul).forEach((inp) => (inp.onchange = () => changerQuantite(etat.panier[inp.dataset.q], inp.value)));
    $$('[data-cond]', ul).forEach((s) => (s.onchange = () => changerConditionnement(etat.panier[s.dataset.cond], s.value ? Number(s.value) : null)));
    $$('[data-suppr]', ul).forEach((b) => (b.onclick = () => changerQuantite(etat.panier[b.dataset.suppr], 0)));
    dessinerPied();
  }

  function dessinerPied() {
    const pied = $('#ticket-pied');
    const st = sousTotal(), rem = remiseFCFA(), tot = total();
    const nb = etat.panier.reduce((s, l) => s + l.q, 0);
    $('#bcm-total').innerHTML = `${fcfa(tot)}<small>${nb} article${nb > 1 ? 's' : ''}</small>`;
    if (!etat.panier.length) { pied.innerHTML = `<div class="ligne-montant total"><span>Total</span><strong>${fcfa(0)}</strong></div>`; return; }
    const credit = etat.mode === 'Crédit';
    const caissier = GP.estCaissier();
    const recu = Number(String(etat.recu).replace(',', '.')) || 0;
    const rapides = [...new Set([tot, ...[500, 1000, 2000, 5000, 10000].map((m) => Math.ceil(tot / m) * m)])].filter((v) => v >= tot).slice(0, 5);
    const taux = Number(String(etat.credit.taux).replace(',', '.')) || 0;
    const du = Math.round(tot * (1 + taux / 100) * 100) / 100;
    const acompte = Number(etat.credit.acompte) || 0;
    const nbE = Math.max(1, Math.min(36, Number(etat.credit.nb) || 1));
    if (!etat.credit.premiere) etat.credit.premiere = plusMois(aujourdhui(), 1);
    pied.innerHTML = `
      <div class="ligne-montant"><span>Sous-total</span><span class="num">${fcfa(st)}</span></div>
      <div class="champs-2">
        <label>Remise${caissier ? ' (10 % max.)' : ''}<input id="c-remise" type="number" min="0" step="any" inputmode="decimal" value="${esc(etat.remise)}" placeholder="0"></label>
        <label>Type<select id="c-remise-type"><option value="fcfa" ${etat.remiseType === 'fcfa' ? 'selected' : ''}>FCFA</option><option value="%" ${etat.remiseType === '%' ? 'selected' : ''}>%</option></select></label>
      </div>
      ${rem ? `<div class="ligne-montant"><span>Remise</span><span class="num">− ${fcfa(rem)}</span></div>` : ''}
      <div class="ligne-montant total"><span>Total</span><strong class="num">${fcfa(tot)}</strong></div>
      <label>Client ${credit ? '*' : '(facultatif)'}
        <span class="ligne-client"><input id="c-client" list="dl-clients" value="${esc(etat.client)}" placeholder="Vente au comptoir" autocomplete="off">
        <button class="btn petit" type="button" id="btn-nouveau-client" title="Nouveau client">${icone('plus')}</button></span>
        <datalist id="dl-clients">${etat.clients.map((c) => `<option value="${esc(c.nom)}">${esc(c.telephone || '')}</option>`).join('')}</datalist>
      </label>
      <div class="modes" role="group" aria-label="Mode de paiement">${MODES.map((m) => `<button type="button" class="mode" data-mode="${m}" aria-pressed="${etat.mode === m}">${esc(m)}</button>`).join('')}</div>
      ${etat.mode === 'Espèces' ? `
        <label>Montant reçu<input id="c-recu" type="number" min="0" step="any" inputmode="decimal" value="${esc(etat.recu)}" placeholder="${nf.format(tot)}"></label>
        <div class="rapides">${rapides.map((v) => `<button type="button" data-recu="${v}">${v === tot ? 'Exact' : nf.format(v)}</button>`).join('')}</div>
        ${etat.recu !== '' ? `<div class="ligne-montant monnaie ${recu < tot ? 'manque' : ''}"><span>${recu < tot ? 'Il manque' : 'Monnaie à rendre'}</span><strong class="num">${fcfa(Math.abs(recu - tot))}</strong></div>` : ''}` : ''}
      ${credit ? `
        <div class="champs-2">
          <label>Intérêts (%)<input id="cr-taux" type="number" min="0" max="100" step="any" inputmode="decimal" value="${esc(etat.credit.taux)}" placeholder="0"></label>
          <label>Échéances (mois)<input id="cr-nb" type="number" min="1" max="36" step="1" inputmode="numeric" value="${esc(etat.credit.nb)}"></label>
          <label>1re échéance<input id="cr-premiere" type="date" min="${aujourdhui()}" value="${esc(etat.credit.premiere)}"></label>
          <label>Acompte versé<input id="cr-acompte" type="number" min="0" step="any" inputmode="decimal" value="${esc(etat.credit.acompte)}" placeholder="0"></label>
        </div>
        ${acompte > 0 ? `<label>Acompte payé en<select id="cr-mode-acompte">${MODES.filter((m) => m !== 'Crédit').map((m) => `<option ${m === etat.credit.modeAcompte ? 'selected' : ''}>${m}</option>`).join('')}</select></label>` : ''}
        <div class="encart">Montant dû : <strong>${fcfa(du)}</strong>${taux ? ` (dont ${fcfa(du - tot)} d’intérêts)` : ''}<br>${acompte ? `Acompte ${fcfa(acompte)}, puis ` : ''}${nbE} × <strong>${fcfa((du - acompte) / nbE)}</strong> par mois à partir du ${dateFr(etat.credit.premiere)}</div>` : ''}
      <button class="btn primaire grand large" type="button" id="btn-encaisser">${credit ? `Enregistrer le crédit · ${fcfa(du)}` : `Encaisser ${fcfa(tot)}`}</button>`;
    const relire = (fn) => () => { synchroniser(); fn(); dessinerPied(); };
    // champ mis à jour pendant la frappe : on redessine puis on rend le focus au même champ
    const vif = (id, fn) => {
      const el = $(`#${id}`);
      if (!el) return;
      const maj = () => { fn(el.value); const pos = el.selectionStart; dessinerPied(); const n = $(`#${id}`); if (n && document.activeElement !== n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* champ numérique */ } } };
      el.oninput = attendre(maj, 350);
      el.onchange = () => { if (fn(el.value) !== false) dessinerPied(); };
    };
    vif('c-remise', (x) => (etat.remise = x));
    $('#c-remise-type').onchange = relire(() => (etat.remiseType = $('#c-remise-type').value));
    $('#c-client').oninput = () => (etat.client = $('#c-client').value);
    $('#c-client').onchange = () => (etat.client = $('#c-client').value);
    $('#btn-nouveau-client').onclick = nouveauClient;
    $$('[data-mode]', pied).forEach((b) => (b.onclick = () => { synchroniser(); etat.mode = b.dataset.mode; dessinerPied(); $(`[data-mode="${etat.mode}"]`).focus(); }));
    if ($('#c-recu')) {
      vif('c-recu', (x) => (etat.recu = x));
      $('#c-recu').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); etat.recu = $('#c-recu').value; encaisser(); } };
      $$('[data-recu]', pied).forEach((b) => (b.onclick = () => { etat.recu = b.dataset.recu; dessinerPied(); $('#btn-encaisser').focus(); }));
    }
    if (credit) {
      for (const [id, k] of [['cr-taux', 'taux'], ['cr-nb', 'nb'], ['cr-acompte', 'acompte']]) vif(id, (x) => (etat.credit[k] = x));
      $('#cr-premiere').onchange = relire(() => (etat.credit.premiere = $('#cr-premiere').value));
      if ($('#cr-mode-acompte')) $('#cr-mode-acompte').onchange = () => (etat.credit.modeAcompte = $('#cr-mode-acompte').value);
    }
    $('#btn-encaisser').onclick = encaisser;
  }

  // relit les champs du ticket (frappe en cours non encore prise en compte)
  function synchroniser() {
    const val = (id) => $(`#${id}`)?.value;
    if (val('c-remise') !== undefined) etat.remise = val('c-remise');
    if (val('c-recu') !== undefined) etat.recu = val('c-recu');
    if (val('c-client') !== undefined) etat.client = val('c-client');
    for (const [id, k] of [['cr-taux', 'taux'], ['cr-nb', 'nb'], ['cr-acompte', 'acompte'], ['cr-premiere', 'premiere']]) if (val(id) !== undefined) etat.credit[k] = val(id);
  }

  function nouveauClient() {
    ouvrirDialogue({
      titre: 'Nouveau client', ok: 'Enregistrer le client',
      corps: `<div class="large"><label for="nc-nom">Nom / raison sociale *</label><input id="nc-nom" name="nom" required maxlength="120" data-focus></div>
        <div><label for="nc-tel">Téléphone</label><input id="nc-tel" name="telephone" type="tel" inputmode="tel"></div>
        <div><label for="nc-type">Type</label><select id="nc-type" name="type_client"><option>Particulier</option><option>Professionnel</option><option>Revendeur</option></select></div>`,
      onOk: async (f) => {
        const { data, error } = await GP.sb.from('clients').insert({ nom: f.nom.value.trim(), telephone: f.telephone.value.trim() || null, type_client: f.type_client.value }).select('id, nom, telephone').single();
        if (error) throw error;
        etat.clients.push(data); etat.clients.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
        etat.client = data.nom;
        toast(`Client « ${data.nom} » enregistré`, 'ok');
        dessinerPied();
      },
    });
  }

  function clientChoisi() {
    const v = normaliser(etat.client);
    if (!v) return null;
    const trouves = etat.clients.filter((c) => normaliser(c.nom) === v);
    if (trouves.length > 1) throw new Error(`Plusieurs clients s’appellent « ${etat.client} » : précisez (téléphone) ou renommez-les dans Clients.`);
    if (!trouves.length) throw new Error(`Client « ${etat.client} » inconnu : choisissez-le dans la liste ou créez-le avec le bouton +.`);
    return trouves[0];
  }

  async function encaisser() {
    if (etat.envoi || !etat.panier.length) return;
    synchroniser();
    const b = $('#btn-encaisser');
    let client;
    try { client = clientChoisi(); } catch (e) { toast(e.message, true); $('#c-client').focus(); return; }
    const credit = etat.mode === 'Crédit';
    if (credit && !client) { toast('Choisissez le client pour une vente à crédit.', true); $('#c-client').focus(); return; }
    const tot = total();
    const recu = etat.mode === 'Espèces' && etat.recu !== '' ? Number(String(etat.recu).replace(',', '.')) : null;
    if (recu != null && recu < tot) { toast(`Montant reçu insuffisant : il manque ${fcfa(tot - recu)}`, true); $('#c-recu')?.focus(); return; }
    etat.envoi = true; b.disabled = true; b.classList.add('occupe');
    const p = {
      p_lignes: etat.panier.map((l) => ({ produit_id: l.produit_id, conditionnement_id: l.cond || null, quantite: l.q })),
      p_mode: credit ? 'Espèces' : etat.mode,
      p_remise: remiseFCFA(),
      p_montant_recu: recu,
      p_client_id: client?.id ?? null,
      p_credit: credit ? { taux: Number(String(etat.credit.taux).replace(',', '.')) || 0, nb_echeances: Number(etat.credit.nb) || 1, premiere_echeance: etat.credit.premiere, acompte: Number(etat.credit.acompte) || 0, mode_acompte: etat.credit.modeAcompte } : null,
      p_cle: etat.cle,
    };
    try {
      const { data: t, error } = await GP.sb.rpc('enregistrer_vente', p);
      if (error) throw error;
      const noms = await GP.equipe();
      const vendeur = t.vendeur || noms[GP.moi.id] || GP.moi.nom || GP.moi.identifiant;
      etat.panier = []; etat.remise = ''; etat.recu = ''; etat.client = ''; etat.mode = 'Espèces';
      etat.credit = { taux: '', nb: 3, premiere: '', acompte: '', modeAcompte: 'Espèces' };
      etat.cle = cleNeuve();
      sauverPanier();
      toast(t.deja ? `Ticket n°${t.id} déjà enregistré` : `Vente enregistrée · ticket n°${t.id}${t.monnaie ? ` · monnaie ${fcfa(t.monnaie)}` : ''}`, 'ok');
      $('#ticket-panneau')?.classList.remove('ouvert');
      chargerCaisse().then(() => { dessinerTuiles(); dessinerPanier(); });
      dessinerPanier();
      GP.chargerNotifications();
      const html = recuHTML({ ...t, statut: 'validée' }, { vendeur, client: client?.nom });
      ouvrirDialogue({
        titre: `Vente enregistrée · ticket n°${t.id}`, simple: true, ok: 'Imprimer le ticket', annuler: 'Nouvelle vente',
        corps: `${Number(t.monnaie) ? `<p class="encart">Monnaie à rendre : <strong>${fcfa(t.monnaie)}</strong></p><br>` : ''}${html}`,
        onOk: () => { GP.imprimer(html); return false; },
      });
      $('#dialogue').addEventListener('close', () => $('#caisse-q')?.focus(), { once: true });
    } catch (e) {
      toast(`Vente non enregistrée : ${messageErreur(e)}`, true);
      // en cas de stock modifié entre-temps, on recharge les quantités
      if (/stock|disponible|prix/i.test(e?.message || '')) chargerCaisse().then(() => { dessinerTuiles(); dessinerPanier(); });
    } finally {
      etat.envoi = false;
      const bb = $('#btn-encaisser'); if (bb) { bb.disabled = false; bb.classList.remove('occupe'); }
    }
  }

  /* ------------------------------------------------------------------
   * Tickets de caisse
   * ------------------------------------------------------------------ */
  const filtreTickets = { du: '', au: '', statut: '', mode: '', q: '' };
  GP.vues.tickets = async (silencieux) => {
    if (!filtreTickets.du) { filtreTickets.du = aujourdhui(); filtreTickets.au = aujourdhui(); }
    if (!silencieux) {
      $('#actions-vue').innerHTML = `<button class="btn" type="button" id="btn-csv-tickets">${icone('export')} Exporter CSV</button>${GP.peutVendre() ? `<button class="btn primaire" type="button" id="btn-aller-caisse">${icone('caisse')} Nouvelle vente</button>` : ''}`;
      $('#vue').innerHTML = `
        <div class="outils">
          <span class="dates-perso"><label class="visuellement-cache" for="t-du">Du</label><input type="date" id="t-du" value="${filtreTickets.du}"> → <label class="visuellement-cache" for="t-au">Au</label><input type="date" id="t-au" value="${filtreTickets.au}"></span>
          <select id="t-statut" aria-label="Statut"><option value="">Tous les tickets</option><option value="validée">Validés</option><option value="annulée">Annulés</option></select>
          <select id="t-mode" aria-label="Paiement"><option value="">Tous les paiements</option>${MODES.map((m) => `<option>${m}</option>`).join('')}</select>
          <input type="search" id="t-q" placeholder="N° de ticket, client, produit…" aria-label="Rechercher un ticket" class="champ-outil">
        </div>
        <div id="liste">${chargement(5)}</div>`;
      $('#t-statut').value = filtreTickets.statut; $('#t-mode').value = filtreTickets.mode; $('#t-q').value = filtreTickets.q;
      for (const [id, k] of [['t-du', 'du'], ['t-au', 'au'], ['t-statut', 'statut'], ['t-mode', 'mode']]) $(`#${id}`).onchange = () => { filtreTickets[k] = $(`#${id}`).value; GP.vues.tickets(true); };
      $('#t-q').oninput = attendre(() => { filtreTickets.q = $('#t-q').value; dessinerTickets(); }, 150);
      $('#btn-aller-caisse')?.addEventListener('click', () => GP.afficher('caisse'));
      $('#btn-csv-tickets').onclick = () => GP.telechargerCSV('tickets', ['N°', 'Date', 'Client', 'Articles', 'Paiement', 'Sous-total', 'Remise', 'Total', 'Statut', 'Vendeur'],
        ticketsFiltres().map((t) => [t.id, dateHeureFr(t.created_at), t.client?.nom || '', t.lignes.map((l) => `${l.quantite} x ${l.designation}${l.conditionnement ? ` (${l.conditionnement})` : ''}`).join(' | '), t.mode_paiement, t.sous_total, t.remise, t.total, t.statut, noms[t.created_by] || '']));
    }
    let q = GP.sb.from('tickets').select('*, client:clients!client_id(nom)').order('created_at', { ascending: false }).limit(2000);
    if (filtreTickets.du) q = q.gte('date', filtreTickets.du);
    if (filtreTickets.au) q = q.lte('date', filtreTickets.au);
    if (filtreTickets.statut) q = q.eq('statut', filtreTickets.statut);
    if (filtreTickets.mode) q = q.eq('mode_paiement', filtreTickets.mode);
    const [{ data, error }, n] = await Promise.all([q, GP.equipe()]);
    if (error) throw error;
    if (GP.vue !== 'tickets') return;
    tickets = data; noms = n;
    dessinerTickets();
  };
  let tickets = [], noms = {};
  const ticketsFiltres = () => {
    const mots = normaliser(filtreTickets.q).split(' ').filter(Boolean);
    return tickets.filter((t) => mots.every((m) => normaliser(`n°${t.id} ${t.id} ${t.client?.nom || ''} ${t.lignes.map((l) => l.designation).join(' ')} ${noms[t.created_by] || ''}`).includes(m)));
  };
  function dessinerTickets() {
    const zone = $('#liste');
    if (!zone) return;
    const liste = ticketsFiltres();
    const valides = liste.filter((t) => t.statut === 'validée');
    if (!liste.length) { zone.innerHTML = `<div class="table-wrap"><p class="vide">Aucun ticket sur cette période.</p></div>`; return; }
    zone.innerHTML = `
      <div class="kpis">
        <div class="kpi accent"><div class="lib">Ventes validées</div><div class="val">${fcfa(valides.reduce((s, t) => s + Number(t.total), 0))}</div><div class="sous">${valides.length} ticket(s)</div></div>
        <div class="kpi or"><div class="lib">Panier moyen</div><div class="val">${fcfa(valides.length ? valides.reduce((s, t) => s + Number(t.total), 0) / valides.length : 0)}</div></div>
        <div class="kpi"><div class="lib">Remises accordées</div><div class="val">${fcfa(valides.reduce((s, t) => s + Number(t.remise), 0))}</div></div>
        <div class="kpi rouge"><div class="lib">Annulations</div><div class="val">${liste.length - valides.length}</div><div class="sous">${fcfa(liste.filter((t) => t.statut === 'annulée').reduce((s, t) => s + Number(t.total), 0))}</div></div>
      </div>
      <div class="table-wrap"><table class="cartes">
        <thead><tr><th>Ticket</th><th>Date</th><th>Client</th><th>Articles</th><th>Paiement</th><th class="num">Total</th><th>Statut</th>${GP.estCaissier() ? '' : '<th>Vendeur</th>'}<th></th></tr></thead>
        <tbody>${liste.slice(0, 500).map((t) => `
          <tr class="${t.statut === 'annulée' ? 'annulee' : ''}">
            <td class="principal-cellule" data-label="Ticket"><strong>n°${t.id}</strong></td>
            <td data-label="Date">${esc(dateHeureFr(t.created_at))}</td>
            <td data-label="Client">${esc(t.client?.nom || '—')}</td>
            <td class="texte" data-label="Articles"><span>${t.lignes.slice(0, 3).map((l) => `${nf.format(l.quantite)} × ${esc(l.designation)}${l.conditionnement ? ` <span class="note">(${esc(l.conditionnement)})</span>` : ''}`).join('<br>')}${t.lignes.length > 3 ? `<br><span class="note">+ ${t.lignes.length - 3} autre(s)</span>` : ''}</span></td>
            <td data-label="Paiement">${badge(t.mode_paiement, t.est_credit ? 'or' : '')}</td>
            <td class="num" data-label="Total"><strong>${fcfa(t.total)}</strong>${Number(t.remise) ? `<br><span class="note">remise ${fcfa(t.remise)}</span>` : ''}</td>
            <td data-label="Statut">${badge(t.statut === 'annulée' ? 'Annulé' : 'Validé', t.statut === 'annulée' ? 'rouge' : 'vert')}</td>
            ${GP.estCaissier() ? '' : `<td data-label="Vendeur">${esc(noms[t.created_by] || '—')}</td>`}
            <td class="acts" data-label=""><button class="btn petit" type="button" data-ticket="${t.id}">${icone('ticket')} Voir</button></td>
          </tr>`).join('')}
        </tbody></table></div>
      <div class="compteur">${nf.format(liste.length)} ticket(s)${liste.length > 500 ? ' · 500 premiers affichés : réduisez la période' : ''}</div>`;
    $$('[data-ticket]', zone).forEach((b) => (b.onclick = () => ouvrirTicket(Number(b.dataset.ticket))));
  }

  /* ------------------------------------------------------------------
   * Crédits clients (échéancier, paiements, relances)
   * ------------------------------------------------------------------ */
  let filtreCredits = 'à encaisser';
  let credits = [];
  GP.vues.credits = async (silencieux) => {
    if (!silencieux) {
      $('#actions-vue').innerHTML = `<div class="segments" role="group" aria-label="Afficher">${['à encaisser', 'en retard', 'soldés', 'tous'].map((f) => `<button type="button" data-fc="${f}" aria-pressed="${f === filtreCredits}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>`;
      $$('[data-fc]').forEach((b) => (b.onclick = () => { filtreCredits = b.dataset.fc; $$('[data-fc]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); GP.vues.credits(true); }));
      $('#vue').innerHTML = `<p class="encart info">Ventes à crédit : les intérêts sont ajoutés une seule fois au montant de la vente, puis le client rembourse par échéances mensuelles. Les montants « en retard » correspondent aux échéances passées non encore payées.</p><br><div id="liste">${chargement(4, true)}</div>`;
    }
    const { data, error } = await GP.sb.rpc('liste_credits', { p_tous: filtreCredits === 'soldés' || filtreCredits === 'tous' });
    if (error) throw error;
    if (GP.vue !== 'credits') return;
    credits = data.filter((c) => ({ 'à encaisser': c.statut !== 'soldé' && c.statut !== 'annulée', 'en retard': c.statut === 'en retard', 'soldés': c.statut === 'soldé' || c.statut === 'annulée', 'tous': true }[filtreCredits]));
    const actifs = data.filter((c) => c.statut === 'en cours' || c.statut === 'en retard');
    const zone = $('#liste');
    zone.innerHTML = `
      <div class="kpis">
        <div class="kpi accent"><div class="lib">Reste à encaisser</div><div class="val">${fcfa(actifs.reduce((s, c) => s + Number(c.solde), 0))}</div><div class="sous">${actifs.length} crédit(s) en cours</div></div>
        <div class="kpi rouge"><div class="lib">En retard</div><div class="val">${fcfa(actifs.reduce((s, c) => s + Number(c.retard), 0))}</div><div class="sous">${actifs.filter((c) => c.statut === 'en retard').length} client(s)</div></div>
        <div class="kpi or"><div class="lib">Intérêts prévus</div><div class="val">${fcfa(actifs.reduce((s, c) => s + Number(c.interets), 0))}</div></div>
      </div>
      ${credits.length ? `<div class="table-wrap"><table class="cartes">
        <thead><tr><th>Vente</th><th>Client</th><th class="num">Montant dû</th><th class="num">Payé</th><th class="num">Reste</th><th>Prochaine échéance</th><th>État</th><th></th></tr></thead>
        <tbody>${credits.map((c) => `
          <tr class="${c.statut === 'en retard' ? 'attention' : ''}">
            <td class="principal-cellule" data-label="Vente">n°${c.id} <span class="note">du ${dateFr(c.date)}</span></td>
            <td data-label="Client"><strong>${esc(c.client || '—')}</strong>${c.telephone ? `<br><span class="note">${esc(c.telephone)}</span>` : ''}</td>
            <td class="num" data-label="Montant dû">${fcfa(c.montant_du)}${Number(c.interets) ? `<br><span class="note">dont ${fcfa(c.interets)} d’intérêts</span>` : ''}</td>
            <td class="num" data-label="Payé">${fcfa(c.paye)}</td>
            <td class="num" data-label="Reste"><strong>${fcfa(c.solde)}</strong>${Number(c.retard) ? `<br><span class="qte-moins">${fcfa(c.retard)} en retard</span>` : ''}</td>
            <td data-label="Prochaine échéance">${c.prochaine_echeance ? `${dateFr(c.prochaine_echeance)}<br><span class="note">${fcfa(c.montant_echeance)}</span>` : '—'}</td>
            <td data-label="État">${badge(c.statut, { 'en retard': 'rouge', 'en cours': 'bleu', 'soldé': 'vert', 'annulée': '' }[c.statut])}</td>
            <td class="acts" data-label=""><span class="acts-groupe">
              ${GP.peutVendre() && Number(c.solde) > 0 && c.statut !== 'annulée' ? `<button class="btn petit primaire" type="button" data-encaisser="${c.id}">Encaisser</button>` : ''}
              <button class="btn-icone petit" type="button" data-detail="${c.id}" title="Échéancier et paiements" aria-label="Échéancier et paiements">${icone('historique')}</button>
              ${c.telephone && Number(c.solde) > 0 ? `<a class="btn-icone petit" href="${esc(GP.lienWhatsApp(c.telephone, `Bonjour ${c.client}, petit rappel de ${GP.cfg.nomEntreprise || 'la cave'} : il reste ${fcfa(c.solde)} à régler sur votre achat n°${c.id}${Number(c.retard) ? `, dont ${fcfa(c.retard)} d’échéances passées` : ''}. Merci !`))}" target="_blank" rel="noopener" title="Relancer sur WhatsApp" aria-label="Relancer ${esc(c.client)} sur WhatsApp">${icone('whatsapp')}</a>` : ''}
            </span></td>
          </tr>`).join('')}
        </tbody></table></div>` : `<div class="table-wrap"><p class="vide">Aucun crédit dans cette catégorie.</p></div>`}`;
    $$('[data-encaisser]', zone).forEach((b) => (b.onclick = () => encaisserCredit(credits.find((c) => c.id == b.dataset.encaisser))));
    $$('[data-detail]', zone).forEach((b) => (b.onclick = () => detailCredit(credits.find((c) => c.id == b.dataset.detail))));
  };

  function encaisserCredit(c) {
    const suggestion = Math.min(Number(c.solde), Number(c.retard) || Number(c.montant_echeance) || Number(c.solde));
    ouvrirDialogue({
      titre: `Paiement de ${c.client || 'client'} · crédit n°${c.id}`, ok: 'Enregistrer le paiement',
      corps: `<p class="encart large">Reste à payer : <strong>${fcfa(c.solde)}</strong>${Number(c.retard) ? ` · en retard : <strong>${fcfa(c.retard)}</strong>` : ''}</p>
        <div><label for="pc-montant">Montant reçu *</label><input id="pc-montant" name="montant" type="number" min="1" max="${c.solde}" step="any" inputmode="decimal" required value="${Math.round(suggestion * 100) / 100}" data-focus></div>
        <div><label for="pc-mode">Mode de paiement</label><select id="pc-mode" name="mode">${MODES.filter((m) => m !== 'Crédit').map((m) => `<option>${m}</option>`).join('')}</select></div>
        <div class="large"><label for="pc-notes">Note</label><input id="pc-notes" name="notes" maxlength="200"></div>`,
      onOk: async (f) => {
        const { data, error } = await GP.sb.rpc('enregistrer_paiement', { p_ticket: c.id, p_montant: Number(f.montant.value), p_mode: f.mode.value, p_notes: f.notes.value || null });
        if (error) throw error;
        toast(`Paiement enregistré · reste ${fcfa(data.solde)}`, 'ok');
        const recu = `<div class="recu"><h4>${esc(GP.cfg.nomEntreprise || 'La cave')}</h4><p class="centre">Reçu de paiement · ${esc(dateHeureFr(new Date().toISOString()))}</p><hr>
          <div class="l"><span>Client</span><span>${esc(c.client || '')}</span></div><div class="l"><span>Crédit n°</span><span>${c.id}</span></div>
          <div class="l gros"><span>Montant reçu</span><span>${fcfa(f.montant.value)}</span></div><div class="l"><span>Mode</span><span>${esc(f.mode.value)}</span></div>
          <div class="l"><span>Total déjà payé</span><span>${fcfa(data.paye)}</span></div><div class="l gros"><span>Reste à payer</span><span>${fcfa(data.solde)}</span></div><hr><p class="centre">Merci !</p></div>`;
        setTimeout(() => ouvrirDialogue({ titre: 'Paiement enregistré', simple: true, corps: recu, ok: 'Imprimer le reçu', annuler: 'Fermer', onOk: () => { GP.imprimer(recu); return false; } }), 0);
        GP.chargerNotifications();
        GP.vues.credits(true);
      },
    });
  }

  async function detailCredit(c) {
    const { data: paiements } = await GP.sb.from('paiements_credit').select('*').eq('ticket_id', c.id).order('date');
    const acompte = (paiements || []).filter((p) => p.notes === 'Acompte à la vente').reduce((s, p) => s + Number(p.montant), 0);
    let payeHorsAcompte = Number(c.paye) - acompte;
    const lignesEch = Array.from({ length: c.nb_echeances }, (_, i) => {
      const montant = i === c.nb_echeances - 1 ? Math.round((Number(c.montant_du) - acompte - c.montant_echeance * (c.nb_echeances - 1)) * 100) / 100 : Number(c.montant_echeance);
      const date = plusMois(c.premiere_echeance, i);
      const couvert = Math.max(0, Math.min(montant, payeHorsAcompte)); payeHorsAcompte -= couvert;
      const etatE = couvert >= montant - 0.005 ? ['payée', 'vert'] : date < aujourdhui() ? [couvert ? 'partielle, en retard' : 'en retard', 'rouge'] : [couvert ? 'partielle' : 'à venir', couvert ? 'orange' : ''];
      return `<tr><td>${i + 1}</td><td>${dateFr(date)}</td><td class="num">${fcfa(montant)}</td><td class="num">${fcfa(couvert)}</td><td>${badge(etatE[0], etatE[1])}</td></tr>`;
    }).join('');
    ouvrirDialogue({
      titre: `Crédit n°${c.id} · ${c.client || ''}`, large: true, simple: true, sansOk: true, annuler: 'Fermer',
      boutons: `<button type="button" class="btn supp" id="btn-voir-ticket-credit">${icone('ticket')} Voir le ticket</button>`,
      corps: `<div class="kpis">
          <div class="kpi"><div class="lib">Vente</div><div class="val">${fcfa(c.total)}</div><div class="sous">le ${dateFr(c.date)}</div></div>
          <div class="kpi or"><div class="lib">Intérêts (${nf.format(c.taux_interet)} %)</div><div class="val">${fcfa(c.interets)}</div></div>
          <div class="kpi accent"><div class="lib">Montant dû</div><div class="val">${fcfa(c.montant_du)}</div></div>
          <div class="kpi ${Number(c.solde) ? 'rouge' : 'vert'}"><div class="lib">Reste à payer</div><div class="val">${fcfa(c.solde)}</div></div>
        </div>
        <h4>Échéancier${acompte ? ` (après un acompte de ${fcfa(acompte)})` : ''}</h4><br>
        <div class="table-wrap"><table class="echeancier"><thead><tr><th>N°</th><th>Date</th><th class="num">Montant</th><th class="num">Couvert</th><th>État</th></tr></thead><tbody>${lignesEch}</tbody></table></div><br>
        <h4>Paiements reçus</h4><br>
        ${(paiements || []).length ? `<div class="table-wrap"><table class="echeancier"><thead><tr><th>Date</th><th>Mode</th><th class="num">Montant</th><th>Note</th></tr></thead><tbody>${paiements.map((p) => `<tr><td>${dateFr(p.date)}</td><td>${esc(p.mode_paiement)}</td><td class="num">${fcfa(p.montant)}</td><td>${esc(p.notes || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vide">Aucun paiement pour le moment.</p>'}`,
      apres: () => { $('#btn-voir-ticket-credit').onclick = () => ouvrirTicket(c.id); },
    });
  }

  /* ------------------------------------------------------------------
   * Historique d'un client (tickets, crédits)
   * ------------------------------------------------------------------ */
  GP.historiqueClient = async (client) => {
    const [{ data: tks }, { data: crs }] = await Promise.all([
      GP.sb.from('tickets').select('id, created_at, total, mode_paiement, statut, lignes').eq('client_id', client.id).order('created_at', { ascending: false }).limit(300),
      GP.sb.rpc('liste_credits', { p_tous: true }),
    ]);
    const sesCredits = (crs || []).filter((c) => c.client_id === client.id);
    const valides = (tks || []).filter((t) => t.statut === 'validée');
    ouvrirDialogue({
      titre: `Historique de ${client.nom}`, large: true, simple: true, sansOk: true, annuler: 'Fermer',
      corps: `<div class="kpis">
          <div class="kpi accent"><div class="lib">Achats (caisse)</div><div class="val">${fcfa(valides.reduce((s, t) => s + Number(t.total), 0))}</div><div class="sous">${valides.length} ticket(s)</div></div>
          <div class="kpi ${sesCredits.some((c) => Number(c.solde) > 0) ? 'rouge' : 'vert'}"><div class="lib">Crédit restant</div><div class="val">${fcfa(sesCredits.filter((c) => c.statut !== 'annulée').reduce((s, c) => s + Number(c.solde), 0))}</div><div class="sous">${sesCredits.length} crédit(s)</div></div>
          <div class="kpi"><div class="lib">Type</div><div class="val">${esc(client.type_client || 'Particulier')}</div><div class="sous">${esc(client.telephone || '')}</div></div>
        </div>
        ${(tks || []).length ? `<div class="table-wrap"><table class="echeancier"><thead><tr><th>Ticket</th><th>Date</th><th>Articles</th><th>Paiement</th><th class="num">Total</th><th></th></tr></thead><tbody>
          ${tks.map((t) => `<tr class="${t.statut === 'annulée' ? 'annulee' : ''}"><td>n°${t.id}</td><td>${esc(dateHeureFr(t.created_at))}</td><td>${t.lignes.reduce((s, l) => s + l.quantite, 0)} article(s)</td><td>${esc(t.mode_paiement)}</td><td class="num">${fcfa(t.total)}</td><td><button class="btn petit" type="button" data-hticket="${t.id}">Voir</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="vide">Aucun ticket de caisse pour ce client.</p>'}`,
      apres: () => $$('[data-hticket]').forEach((b) => (b.onclick = () => ouvrirTicket(Number(b.dataset.hticket)))),
    });
  };

  GP.ouvrirTicket = ouvrirTicket;
  GP.recuHTML = recuHTML;
})();
