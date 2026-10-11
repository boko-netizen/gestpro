/* Le Paradis des Bavins – boutique en ligne (visiteurs)
 * Catalogue réel (fonction catalogue_public de Supabase), recherche, filtres,
 * tri, fiche produit, panier et envoi de commande (enregistrée + WhatsApp).
 * Aucun paiement en ligne : la cave rappelle le client pour confirmer. */
(() => {
  'use strict';
  const V = window.Vitrine;
  if (!V) return;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const t = (fr, en) => V.t(fr, en);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const prix = (n) => `${nf.format(Number(n) || 0)} FCFA`;
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const normaliser = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  // Noms anglais des catégories courantes (les produits gardent leur nom)
  const CAT_EN = {
    'champagnes': 'Champagne', 'vins': 'Wine', 'vin': 'Wine', 'spiritueux': 'Spirits', 'liqueurs': 'Liqueurs', 'bieres': 'Beer', 'biere': 'Beer',
    'sodas & jus': 'Sodas & juices', 'energie & sport': 'Energy & sport', 'epicerie fine': 'Fine foods', 'confiseries': 'Sweets',
    'snacks': 'Snacks', 'cadeaux': 'Gifts', 'alcools': 'Spirits', 'divers': 'Other',
  };
  const nomCat = (c) => (c ? (V.langue === 'en' ? CAT_EN[normaliser(c)] || c : c) : t('Autres', 'Other'));

  /* ---------------- Connexion à la base (chargée seulement si besoin) ---------------- */
  let clientP = null;
  function charger(src) {
    return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error(src)); document.head.append(s); });
  }
  function client() {
    if (!clientP) {
      clientP = (async () => {
        if (!window.GESTPRO_CONFIG) await charger('config.js');
        if (!window.supabase) await charger('vendor/supabase.js');
        const c = window.GESTPRO_CONFIG;
        return window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      })();
    }
    return clientP;
  }
  let catalogueP = null;
  function catalogue() {
    if (!catalogueP) {
      catalogueP = client().then(async (sb) => {
        const { data, error } = await sb.rpc('catalogue_public');
        if (error) throw error;
        return data.map((p) => ({ ...p, prix_vente: Number(p.prix_vente) }));
      });
      catalogueP.catch(() => { catalogueP = null; });
    }
    return catalogueP;
  }

  /* ---------------- Annonces accessibles (toast) ---------------- */
  const toast = document.createElement('div');
  toast.className = 'toast-boutique'; toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite');
  document.body.append(toast);
  let minuteurToast = 0;
  function annoncer(msg) {
    toast.textContent = msg; toast.classList.add('visible');
    clearTimeout(minuteurToast); minuteurToast = setTimeout(() => toast.classList.remove('visible'), 2600);
  }

  /* ---------------- Panier (conservé sur cet appareil) ---------------- */
  const CLE = 'panier-paradis-des-bavins';
  let memoire = [];
  const lirePanier = () => { try { const v = JSON.parse(localStorage.getItem(CLE) || '[]'); return Array.isArray(v) ? v : []; } catch { return memoire; } };
  const ecrirePanier = (p) => { memoire = p; try { localStorage.setItem(CLE, JSON.stringify(p)); } catch { /* stockage indisponible : panier en mémoire */ } majCompteur(); dessinerPanier(); };
  const nbArticles = () => lirePanier().reduce((n, l) => n + l.q, 0);
  const sousTotal = () => lirePanier().reduce((s, l) => s + l.q * l.prix, 0);

  function ajouter(p, q = 1) {
    if (!p.disponible) { annoncer(t('Ce produit est en rupture de stock.', 'This product is out of stock.')); return; }
    const panier = lirePanier();
    const l = panier.find((x) => x.id === p.id);
    if (l) l.q = Math.min(99, l.q + q);
    else panier.push({ id: p.id, q: Math.min(99, q), nom: p.designation, prix: p.prix_vente, photo: p.photo_url || '' });
    ecrirePanier(panier);
    annoncer(t(`« ${p.designation} » ajouté au panier`, `"${p.designation}" added to cart`));
    const b = $('.panier-btn');
    if (b && !reduit) { b.classList.remove('rebond'); void b.offsetWidth; b.classList.add('rebond'); }
  }
  function changerQuantite(id, q) {
    const panier = lirePanier().map((l) => (l.id === id ? { ...l, q: Math.max(0, Math.min(99, q)) } : l)).filter((l) => l.q > 0);
    ecrirePanier(panier);
  }
  // Met à jour noms et prix du panier avec le catalogue (le serveur recalcule de toute façon)
  async function actualiserPanier() {
    const panier = lirePanier();
    if (!panier.length) return;
    try {
      const cat = await catalogue();
      let change = false;
      const nouveau = panier.map((l) => {
        const p = cat.find((x) => x.id === l.id);
        if (!p) { change = true; return { ...l, retire: true }; }
        if (p.prix_vente !== l.prix || p.designation !== l.nom || !p.disponible !== !!l.rupture) change = true;
        return { ...l, nom: p.designation, prix: p.prix_vente, photo: p.photo_url || '', rupture: !p.disponible, retire: false };
      });
      if (change) ecrirePanier(nouveau);
    } catch { /* hors ligne : on garde le panier tel quel */ }
  }

  function majCompteur() {
    const n = nbArticles();
    $$('.panier-nb').forEach((el) => { el.textContent = n > 99 ? '99+' : n; el.hidden = n === 0; });
    $$('.panier-btn').forEach((b) => b.setAttribute('aria-label', n ? t(`Ouvrir le panier (${n} article${n > 1 ? 's' : ''})`, `Open cart (${n} item${n > 1 ? 's' : ''})`) : t('Ouvrir le panier', 'Open cart')));
  }

  /* ---------------- Fenêtre du panier ---------------- */
  const voile = document.createElement('div');
  voile.className = 'panier-voile'; voile.hidden = true;
  const tiroir = document.createElement('aside');
  tiroir.className = 'panier'; tiroir.id = 'panier'; tiroir.hidden = true;
  tiroir.setAttribute('role', 'dialog'); tiroir.setAttribute('aria-modal', 'true'); tiroir.setAttribute('aria-labelledby', 'panier-titre');
  tiroir.dataset.dynamique = '';
  document.body.append(voile, tiroir);
  let etapePanier = 'liste';   // liste | commande | merci
  let derniereCommande = null;
  let retourFocus = null;

  function ouvrirPanier() {
    retourFocus = document.activeElement;
    actualiserPanier();
    if (etapePanier === 'merci' && !derniereCommande) etapePanier = 'liste';
    dessinerPanier();
    voile.hidden = false; tiroir.hidden = false;
    document.body.classList.add('panier-ouvert');
    requestAnimationFrame(() => { voile.classList.add('visible'); tiroir.classList.add('visible'); });
    setTimeout(() => ($('[data-premier]', tiroir) || $('button', tiroir))?.focus(), 30);
  }
  function fermerPanier() {
    voile.classList.remove('visible'); tiroir.classList.remove('visible');
    document.body.classList.remove('panier-ouvert');
    setTimeout(() => { voile.hidden = true; tiroir.hidden = true; }, reduit ? 0 : 280);
    if (etapePanier === 'merci') { etapePanier = 'liste'; derniereCommande = null; }
    retourFocus?.focus?.();
  }
  voile.addEventListener('click', fermerPanier);
  tiroir.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); fermerPanier(); return; }
    if (e.key !== 'Tab') return;
    const f = $$('button:not([disabled]), a[href], input, textarea, select', tiroir).filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  $$('.panier-btn').forEach((b) => b.addEventListener('click', ouvrirPanier));

  const photoHTML = (url, alt, classe = '') => (url
    ? `<img class="${classe}" src="${esc(url)}" alt="${esc(alt)}" loading="lazy" decoding="async">`
    : `<span class="${classe} sans-photo-produit" aria-hidden="true"><img src="img/logo-pb.jpg" alt="" width="60" height="60"></span>`);

  function dessinerPanier() {
    if (tiroir.hidden && etapePanier !== 'merci') { /* rien d'ouvert : on redessinera à l'ouverture */ }
    const panier = lirePanier();
    const entete = `<div class="panier-tete"><h2 id="panier-titre">${esc(etapePanier === 'commande' ? t('Vos coordonnées', 'Your details') : etapePanier === 'merci' ? t('Commande envoyée', 'Order sent') : t('Votre panier', 'Your cart'))}</h2>
      <button class="outil-btn" type="button" data-fermer aria-label="${esc(t('Fermer le panier', 'Close cart'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`;
    if (etapePanier === 'merci' && derniereCommande) {
      const c = derniereCommande;
      tiroir.innerHTML = `${entete}<div class="panier-corps merci">
        <p class="merci-num">${esc(t(`Commande n°${c.id}`, `Order no. ${c.id}`))}</p>
        <p>${esc(t('Merci ! Votre commande est bien enregistrée. Nous vous contactons rapidement pour confirmer la disponibilité, la livraison ou le retrait, et le paiement.', 'Thank you! Your order has been received. We will contact you shortly to confirm availability, delivery or pick-up, and payment.'))}</p>
        <p class="merci-total">${esc(t('Total', 'Total'))} : <strong>${prix(c.total)}</strong></p>
        <a class="btn btn-or" data-premier href="${esc(c.lienWa)}" target="_blank" rel="noopener">${esc(t('Confirmer aussi sur WhatsApp', 'Also confirm on WhatsApp'))}</a>
        <button class="btn btn-ligne" type="button" data-fermer>${esc(t('Continuer mes achats', 'Continue shopping'))}</button>
      </div>`;
    } else if (!panier.length) {
      etapePanier = 'liste';
      tiroir.innerHTML = `${entete}<div class="panier-corps panier-vide">
        <p>${esc(t('Votre panier est vide.', 'Your cart is empty.'))}</p>
        <a class="btn btn-or" data-premier href="produits">${esc(t('Découvrir la boutique', 'Browse the shop'))}</a>
      </div>`;
    } else if (etapePanier === 'commande') {
      tiroir.innerHTML = `${entete}<form class="panier-corps panier-form" novalidate>
        <p class="note-panier">${esc(t(`${nbArticles()} article(s) · ${prix(sousTotal())}`, `${nbArticles()} item(s) · ${prix(sousTotal())}`))}</p>
        <label for="pc-nom">${esc(t('Votre nom', 'Your name'))}</label>
        <input id="pc-nom" name="nom" autocomplete="name" required maxlength="80" data-premier>
        <label for="pc-tel">${esc(t('Votre téléphone (WhatsApp de préférence)', 'Your phone (WhatsApp preferred)'))}</label>
        <input id="pc-tel" name="tel" type="tel" autocomplete="tel" inputmode="tel" required maxlength="20" placeholder="07 07 07 07 07">
        <label for="pc-note">${esc(t('Précisions (livraison, horaire…)', 'Details (delivery, time…)'))} <span class="facultatif">${esc(t('facultatif', 'optional'))}</span></label>
        <textarea id="pc-note" name="note" rows="3" maxlength="500"></textarea>
        <p class="note-panier">${esc(t('Pas de paiement en ligne : nous vous contactons pour confirmer la commande, la livraison ou le retrait, et le paiement.', 'No online payment: we will contact you to confirm the order, delivery or pick-up, and payment.'))}</p>
        <p class="erreur" role="alert" id="pc-erreur"></p>
        <div class="panier-actions">
          <button class="btn btn-ligne" type="button" data-retour>${esc(t('Retour au panier', 'Back to cart'))}</button>
          <button class="btn btn-or" type="submit">${esc(t('Envoyer ma commande', 'Send my order'))}</button>
        </div>
        <a class="btn-lien" id="pc-wa" hidden target="_blank" rel="noopener">${esc(t('Envoyer plutôt par WhatsApp', 'Send by WhatsApp instead'))}</a>
      </form>`;
      $('form', tiroir).addEventListener('submit', envoyerCommande);
    } else {
      const retires = panier.filter((l) => l.retire || l.rupture);
      tiroir.innerHTML = `${entete}<div class="panier-corps">
        <ul class="panier-lignes">${panier.map((l) => `
          <li class="${l.retire || l.rupture ? 'indispo' : ''}">
            ${photoHTML(l.photo, '', 'panier-photo')}
            <div class="panier-info">
              <p class="panier-nom">${esc(l.nom)}</p>
              <p class="panier-prix">${prix(l.prix)}${l.retire ? ` · <span class="etat-rupture">${esc(t('plus proposé', 'no longer available'))}</span>` : l.rupture ? ` · <span class="etat-rupture">${esc(t('rupture', 'out of stock'))}</span>` : ''}</p>
              <div class="quantite" role="group" aria-label="${esc(t(`Quantité de ${l.nom}`, `Quantity of ${l.nom}`))}">
                <button type="button" data-moins="${l.id}" aria-label="${esc(t('Retirer un', 'Remove one'))}">−</button>
                <input type="number" min="1" max="99" value="${l.q}" data-q="${l.id}" aria-label="${esc(t('Quantité', 'Quantity'))}">
                <button type="button" data-plus="${l.id}" aria-label="${esc(t('Ajouter un', 'Add one'))}">+</button>
              </div>
            </div>
            <div class="panier-droite">
              <p class="panier-ligne-total">${prix(l.q * l.prix)}</p>
              <button class="btn-lien" type="button" data-suppr="${l.id}">${esc(t('Retirer', 'Remove'))}</button>
            </div>
          </li>`).join('')}
        </ul>
        <div class="panier-pied">
          <p class="panier-sous-total"><span>${esc(t('Sous-total', 'Subtotal'))}</span><strong>${prix(sousTotal())}</strong></p>
          <p class="note-panier">${esc(t('Livraison et paiement à convenir avec la cave. Prix confirmés à l’envoi de la commande.', 'Delivery and payment arranged with the shop. Prices confirmed when the order is sent.'))}</p>
          ${retires.length ? `<p class="erreur">${esc(t('Retirez les produits indisponibles pour continuer.', 'Remove unavailable products to continue.'))}</p>` : ''}
          <button class="btn btn-or bouton-large" type="button" data-commander data-premier ${retires.length ? 'disabled' : ''}>${esc(t('Commander', 'Place order'))}</button>
        </div>
      </div>`;
    }
    $$('[data-fermer]', tiroir).forEach((b) => b.addEventListener('click', fermerPanier));
    $('[data-retour]', tiroir)?.addEventListener('click', () => { etapePanier = 'liste'; dessinerPanier(); $('[data-premier]', tiroir)?.focus(); });
    $('[data-commander]', tiroir)?.addEventListener('click', () => { etapePanier = 'commande'; dessinerPanier(); $('#pc-nom', tiroir)?.focus(); });
    $$('[data-moins]', tiroir).forEach((b) => b.addEventListener('click', () => { const l = lirePanier().find((x) => x.id == b.dataset.moins); changerQuantite(l.id, l.q - 1); focusApres(`[data-moins="${l.id}"]`); }));
    $$('[data-plus]', tiroir).forEach((b) => b.addEventListener('click', () => { const l = lirePanier().find((x) => x.id == b.dataset.plus); changerQuantite(l.id, l.q + 1); focusApres(`[data-plus="${l.id}"]`); }));
    $$('[data-q]', tiroir).forEach((i) => i.addEventListener('change', () => changerQuantite(Number(i.dataset.q), parseInt(i.value, 10) || 0)));
    $$('[data-suppr]', tiroir).forEach((b) => b.addEventListener('click', () => { const l = lirePanier().find((x) => x.id == b.dataset.suppr); changerQuantite(l.id, 0); annoncer(t(`« ${l.nom} » retiré du panier`, `"${l.nom}" removed from cart`)); $('[data-premier]', tiroir)?.focus(); }));
  }
  const focusApres = (sel) => { const el = $(sel, tiroir); (el || $('[data-premier]', tiroir))?.focus(); };

  function messageWhatsApp(c, nom, note) {
    const lignes = c.lignes.map((l) => `• ${l.quantite} × ${l.designation} (${prix(l.prix_unitaire)})`).join('\n');
    return t(
      `Bonjour, je suis ${nom}.\nJe viens d'envoyer la commande n°${c.id} sur votre site :\n${lignes}\nTotal : ${prix(c.total)}${note ? `\nPrécisions : ${note}` : ''}`,
      `Hello, my name is ${nom}.\nI have just sent order no. ${c.id} on your website:\n${lignes}\nTotal: ${prix(c.total)}${note ? `\nDetails: ${note}` : ''}`);
  }

  async function envoyerCommande(e) {
    e.preventDefault();
    const f = e.target, erreur = $('#pc-erreur', f), bouton = $('button[type=submit]', f);
    const nom = f.nom.value.trim(), tel = f.tel.value.trim(), note = f.note.value.trim();
    erreur.textContent = '';
    if (nom.length < 2) { erreur.textContent = t('Indiquez votre nom.', 'Enter your name.'); f.nom.focus(); return; }
    if (!/^[0-9 +().-]{8,20}$/.test(tel)) { erreur.textContent = t('Indiquez un numéro de téléphone valide (8 à 20 chiffres).', 'Enter a valid phone number (8 to 20 digits).'); f.tel.focus(); return; }
    bouton.disabled = true; bouton.textContent = t('Envoi…', 'Sending…');
    const panier = lirePanier();
    try {
      const sb = await client();
      const { data, error } = await sb.rpc('passer_commande', {
        p_nom: nom, p_telephone: tel, p_note: note || null, p_langue: V.langue,
        p_lignes: panier.map((l) => ({ produit_id: l.id, quantite: l.q })),
      });
      if (error) throw error;
      derniereCommande = { ...data, lienWa: V.lienWa(messageWhatsApp(data, nom, note)) };
      ecrirePanier([]);
      etapePanier = 'merci';
      catalogueP = null;
      dessinerPanier();
      $('[data-premier]', tiroir)?.focus();
    } catch (err) {
      bouton.disabled = false; bouton.textContent = t('Envoyer ma commande', 'Send my order');
      const msg = err?.message && !/fetch|network/i.test(err.message) ? err.message : t('Envoi impossible pour le moment (connexion ?).', 'Could not send right now (connection?).');
      erreur.textContent = `${msg} ${t('Vous pouvez aussi nous envoyer la commande par WhatsApp.', 'You can also send us the order on WhatsApp.')}`;
      const wa = $('#pc-wa', f);
      const texte = t(`Bonjour, je suis ${nom} (${tel}). Je voudrais commander :\n`, `Hello, my name is ${nom} (${tel}). I would like to order:\n`)
        + panier.map((l) => `• ${l.q} × ${l.nom}`).join('\n') + (note ? `\n${note}` : '');
      wa.href = V.lienWa(texte); wa.hidden = false;
      if (/plus proposé|rupture|no longer|stock/i.test(msg)) { catalogueP = null; actualiserPanier(); }
    }
  }

  /* ---------------- Recherche dans l'en-tête ---------------- */
  const formRech = $('#recherche-entete'), btnRech = $('.recherche-btn');
  if (formRech && btnRech) {
    const fermerRech = () => { formRech.hidden = true; btnRech.setAttribute('aria-expanded', 'false'); };
    btnRech.addEventListener('click', () => {
      const ouvrir = formRech.hidden;
      formRech.hidden = !ouvrir; btnRech.setAttribute('aria-expanded', String(ouvrir));
      if (ouvrir) { $('input', formRech).value = new URLSearchParams(location.search).get('q') || ''; $('input', formRech).focus(); }
    });
    $('.fermer-recherche', formRech).addEventListener('click', () => { fermerRech(); btnRech.focus(); });
    formRech.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fermerRech(); btnRech.focus(); } });
    // sur la page Boutique : la recherche filtre directement sans recharger
    if ($('#boutique')) formRech.addEventListener('submit', (e) => { e.preventDefault(); etat.q = $('input', formRech).value.trim(); $('#q').value = etat.q; fermerRech(); appliquer(); $('#grille').scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'start' }); });
  }

  /* ---------------- Carte produit (réutilisée partout) ---------------- */
  function carteHTML(p) {
    return `<article class="carte-produit${p.disponible ? '' : ' rupture'}">
      <a class="carte-produit-lien" href="produit?id=${p.id}" aria-label="${esc(`${p.designation}, ${prix(p.prix_vente)}`)}">
        <div class="carte-produit-image">${photoHTML(p.photo_url, p.designation)}
          ${p.nouveau ? `<span class="pastille-produit nouveau">${esc(t('Nouveau', 'New'))}</span>` : ''}
          ${!p.disponible ? `<span class="pastille-produit rupture">${esc(t('Rupture', 'Out of stock'))}</span>` : ''}
        </div>
        <p class="carte-produit-cat">${esc(nomCat(p.categorie))}</p>
        <h3 class="carte-produit-nom">${esc(p.designation)}</h3>
      </a>
      <div class="carte-produit-bas">
        <p class="carte-produit-prix">${prix(p.prix_vente)}</p>
        <button class="btn btn-or btn-ajout" type="button" data-ajout="${p.id}" ${p.disponible ? '' : 'disabled'}>${esc(p.disponible ? t('Ajouter', 'Add') : t('Indisponible', 'Unavailable'))}</button>
      </div>
    </article>`;
  }
  function brancherAjouts(zone, liste) {
    $$('[data-ajout]', zone).forEach((b) => b.addEventListener('click', () => {
      const p = liste.find((x) => x.id == b.dataset.ajout);
      if (p) ajouter(p, 1);
    }));
  }
  const squelettes = (n) => Array.from({ length: n }, () => '<div class="carte-produit squelette" aria-hidden="true"><div class="carte-produit-image"></div><p></p><p></p></div>').join('');

  /* ---------------- Page Boutique : recherche, filtres, tri ---------------- */
  const etat = { q: '', cat: '', dispo: false, tri: 'nom' };
  let toutes = [];
  const zoneBoutique = $('#boutique');

  function lireURL() {
    const p = new URLSearchParams(location.search);
    etat.q = p.get('q') || ''; etat.cat = p.get('cat') || ''; etat.dispo = p.get('dispo') === '1';
    etat.tri = ['nom', 'prix-asc', 'prix-desc', 'nouveautes'].includes(p.get('tri')) ? p.get('tri') : 'nom';
  }
  function ecrireURL() {
    const p = new URLSearchParams(location.search);
    for (const [k, v] of [['q', etat.q], ['cat', etat.cat], ['dispo', etat.dispo ? '1' : ''], ['tri', etat.tri === 'nom' ? '' : etat.tri]]) { if (v) p.set(k, v); else p.delete(k); }
    const s = p.toString();
    history.replaceState(null, '', location.pathname + (s ? `?${s}` : ''));
  }
  function libellesBoutique() {
    $('label[for="q"]').textContent = t('Rechercher un produit', 'Search for a product');
    $('#q').placeholder = t('Nom, catégorie ou référence', 'Name, category or reference');
    $('.lib-tri').textContent = t('Trier', 'Sort');
    $('.lib-dispo').textContent = t('Disponibles uniquement', 'In stock only');
    $('#tri').innerHTML = [['nom', t('Nom (A → Z)', 'Name (A → Z)')], ['prix-asc', t('Prix croissant', 'Price: low to high')], ['prix-desc', t('Prix décroissant', 'Price: high to low')], ['nouveautes', t('Nouveautés', 'Newest')]]
      .map(([v, l]) => `<option value="${v}" ${v === etat.tri ? 'selected' : ''}>${esc(l)}</option>`).join('');
    $('#reinitialiser').textContent = t('Réinitialiser les filtres', 'Reset filters');
    $('#filtres-cat').setAttribute('aria-label', t('Catégories', 'Categories'));
  }
  function dessinerFiltresCat() {
    const cats = [...new Set(toutes.map((p) => p.categorie || ''))].sort((a, b) => a.localeCompare(b, 'fr'));
    $('#filtres-cat').innerHTML = [['', t('Tout', 'All')], ...cats.map((c) => [c, nomCat(c)])]
      .map(([v, l]) => `<button type="button" class="puce" data-cat="${esc(v)}" aria-pressed="${etat.cat === v}">${esc(l)}<span class="puce-nb">${v ? toutes.filter((p) => (p.categorie || '') === v).length : toutes.length}</span></button>`).join('');
    $$('[data-cat]', zoneBoutique).forEach((b) => b.addEventListener('click', () => { etat.cat = b.dataset.cat; appliquer(); }));
  }
  function appliquer() {
    if (!zoneBoutique) return;
    ecrireURL();
    $$('[data-cat]', zoneBoutique).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === etat.cat)));
    const mots = normaliser(etat.q).split(/\s+/).filter(Boolean);
    let liste = toutes.filter((p) => {
      if (etat.cat && (p.categorie || '') !== etat.cat) return false;
      if (etat.dispo && !p.disponible) return false;
      const texte = normaliser(`${p.designation} ${p.reference || ''} ${p.categorie || ''} ${nomCat(p.categorie)} ${p.description || ''}`);
      return mots.every((m) => texte.includes(m));
    });
    const cmp = { 'nom': (a, b) => a.designation.localeCompare(b.designation, 'fr'), 'prix-asc': (a, b) => a.prix_vente - b.prix_vente, 'prix-desc': (a, b) => b.prix_vente - a.prix_vente, 'nouveautes': (a, b) => (b.nouveau - a.nouveau) || b.id - a.id }[etat.tri];
    liste = liste.sort((a, b) => (b.disponible - a.disponible) || cmp(a, b));
    const filtre = etat.q || etat.cat || etat.dispo;
    $('#reinitialiser').hidden = !filtre;
    $('#nb-resultats').textContent = t(`${liste.length} produit${liste.length > 1 ? 's' : ''}`, `${liste.length} product${liste.length !== 1 ? 's' : ''}`) + (etat.q ? t(` pour « ${etat.q} »`, ` for "${etat.q}"`) : '');
    const grille = $('#grille');
    if (!liste.length) {
      grille.innerHTML = `<div class="vide-boutique"><p>${esc(t('Aucun produit ne correspond à votre recherche.', 'No product matches your search.'))}</p>
        <div class="vide-actions"><button class="btn btn-ligne" type="button" data-reinit>${esc(t('Voir tous les produits', 'See all products'))}</button>
        <a class="btn btn-or" href="${esc(V.lienWa(t(`Bonjour, avez-vous ${etat.q || 'ce produit'} ?`, `Hello, do you have ${etat.q || 'this product'}?`)))}" target="_blank" rel="noopener">${esc(t('Demander sur WhatsApp', 'Ask on WhatsApp'))}</a></div></div>`;
      $('[data-reinit]', grille).addEventListener('click', reinitialiser);
      return;
    }
    grille.innerHTML = liste.map((p) => carteHTML(p)).join('');
    brancherAjouts(grille, toutes);
  }
  function reinitialiser() { etat.q = ''; etat.cat = ''; etat.dispo = false; etat.tri = 'nom'; $('#q').value = ''; $('#dispo').checked = false; libellesBoutique(); appliquer(); $('#q').focus(); }

  async function initBoutique() {
    if (!zoneBoutique) return;
    lireURL(); libellesBoutique();
    $('#q').value = etat.q; $('#dispo').checked = etat.dispo;
    $('#grille').innerHTML = squelettes(8);
    $('#nb-resultats').textContent = t('Chargement du catalogue…', 'Loading catalogue…');
    let attente = 0;
    $('#q').addEventListener('input', () => { clearTimeout(attente); attente = setTimeout(() => { etat.q = $('#q').value.trim(); appliquer(); }, 180); });
    $('#tri').addEventListener('change', () => { etat.tri = $('#tri').value; appliquer(); });
    $('#dispo').addEventListener('change', () => { etat.dispo = $('#dispo').checked; appliquer(); });
    $('#reinitialiser').addEventListener('click', reinitialiser);
    try {
      toutes = await catalogue();
    } catch {
      $('#nb-resultats').textContent = '';
      $('#grille').innerHTML = `<div class="vide-boutique"><p>${esc(t('Le catalogue ne peut pas être chargé pour le moment. Vérifiez votre connexion ou commandez-nous sur WhatsApp.', 'The catalogue cannot be loaded right now. Check your connection or order from us on WhatsApp.'))}</p>
        <div class="vide-actions"><button class="btn btn-ligne" type="button" data-reessayer>${esc(t('Réessayer', 'Try again'))}</button></div></div>`;
      $('[data-reessayer]').addEventListener('click', initBoutique);
      return;
    }
    if (!toutes.length) {
      $('.outils-boutique').hidden = true;
      $('#nb-resultats').textContent = '';
      $('#grille').innerHTML = `<div class="vide-boutique"><p>${esc(t('Notre boutique en ligne se remplit : les produits arrivent très bientôt. En attendant, consultez nos rayons ci-dessous et commandez sur WhatsApp.', 'Our online shop is filling up: products are coming very soon. Meanwhile, see our aisles below and order on WhatsApp.'))}</p></div>`;
      return;
    }
    $('.outils-boutique').hidden = false;
    if (etat.cat && !toutes.some((p) => (p.categorie || '') === etat.cat)) etat.cat = '';
    dessinerFiltresCat(); appliquer();
  }

  /* ---------------- Fiche produit ---------------- */
  const zoneFiche = $('#fiche');
  let produitActuel = null;
  async function initFiche() {
    if (!zoneFiche) return;
    const id = Number(new URLSearchParams(location.search).get('id'));
    let liste;
    try { liste = await catalogue(); } catch {
      zoneFiche.innerHTML = `<p class="vide-boutique">${esc(t('Ce produit ne peut pas être chargé pour le moment.', 'This product cannot be loaded right now.'))} <a href="produits">${esc(t('Retour à la boutique', 'Back to the shop'))}</a></p>`;
      return;
    }
    produitActuel = liste.find((p) => p.id === id) || null;
    dessinerFiche(liste);
  }
  function dessinerFiche(liste) {
    const p = produitActuel;
    if (!p) {
      document.title = t('Produit introuvable – Le Paradis des Bavins', 'Product not found – Le Paradis des Bavins');
      zoneFiche.innerHTML = `<div class="vide-boutique"><h1 class="titre-sobre">${esc(t('Produit introuvable', 'Product not found'))}</h1><p>${esc(t('Ce produit n’est plus proposé en ligne.', 'This product is no longer available online.'))}</p><a class="btn btn-or" href="produits">${esc(t('Retour à la boutique', 'Back to the shop'))}</a></div>`;
      return;
    }
    document.title = `${p.designation} – Le Paradis des Bavins`;
    const meta = $('meta[name="description"]');
    if (meta) meta.content = `${p.designation} : ${prix(p.prix_vente)}. ${p.description || nomCat(p.categorie)}`.slice(0, 160);
    const qAvant = Number($('#fiche-q')?.value) || 1;
    zoneFiche.innerHTML = `
      <nav class="fil" aria-label="${esc(t('Fil d’Ariane', 'Breadcrumb'))}"><a href="produits">${esc(t('Boutique', 'Shop'))}</a> <span aria-hidden="true">›</span> <a href="produits?cat=${encodeURIComponent(p.categorie || '')}">${esc(nomCat(p.categorie))}</a></nav>
      <div class="fiche-grille">
        <div class="fiche-visuel">
          ${p.photo_url ? `<button type="button" class="fiche-zoom" aria-label="${esc(t('Agrandir la photo', 'Enlarge photo'))}">${photoHTML(p.photo_url, p.designation, 'fiche-photo')}</button>` : photoHTML('', '', 'fiche-photo')}
        </div>
        <div class="fiche-infos">
          <p class="carte-produit-cat">${esc(nomCat(p.categorie))}${p.reference ? ` · ${esc(t('Réf.', 'Ref.'))} ${esc(p.reference)}` : ''}</p>
          <h1 class="fiche-nom">${esc(p.designation)}</h1>
          <p class="fiche-prix">${prix(p.prix_vente)}</p>
          <p class="fiche-dispo ${p.disponible ? 'ok' : 'non'}">${esc(p.disponible ? t('En stock', 'In stock') : t('En rupture de stock', 'Out of stock'))}</p>
          ${p.description ? `<p class="fiche-desc">${esc(p.description)}</p>` : ''}
          <div class="fiche-achat">
            <div class="quantite" role="group" aria-label="${esc(t('Quantité', 'Quantity'))}">
              <button type="button" data-fq="-1" aria-label="${esc(t('Retirer un', 'Remove one'))}" ${p.disponible ? '' : 'disabled'}>−</button>
              <input id="fiche-q" type="number" min="1" max="99" value="${qAvant}" aria-label="${esc(t('Quantité', 'Quantity'))}" ${p.disponible ? '' : 'disabled'}>
              <button type="button" data-fq="1" aria-label="${esc(t('Ajouter un', 'Add one'))}" ${p.disponible ? '' : 'disabled'}>+</button>
            </div>
            <button class="btn btn-or" type="button" id="fiche-ajout" ${p.disponible ? '' : 'disabled'}>${esc(p.disponible ? t('Ajouter au panier', 'Add to cart') : t('Indisponible', 'Unavailable'))}</button>
          </div>
          <a class="btn-lien" href="${esc(V.lienWa(t(`Bonjour, je suis intéressé(e) par : ${p.designation} (${prix(p.prix_vente)}).`, `Hello, I am interested in: ${p.designation} (${prix(p.prix_vente)}).`)))}" target="_blank" rel="noopener">${esc(t('Une question ? Écrivez-nous sur WhatsApp', 'A question? Message us on WhatsApp'))}</a>
          <p class="note-panier">${esc(t('Livraison et paiement à convenir avec la cave après votre commande.', 'Delivery and payment arranged with the shop after your order.'))}</p>
        </div>
      </div>`;
    const champQ = $('#fiche-q');
    $$('[data-fq]', zoneFiche).forEach((b) => b.addEventListener('click', () => { champQ.value = Math.max(1, Math.min(99, (parseInt(champQ.value, 10) || 1) + Number(b.dataset.fq))); }));
    $('#fiche-ajout').addEventListener('click', () => ajouter(p, Math.max(1, Math.min(99, parseInt(champQ.value, 10) || 1))));
    $('.fiche-zoom', zoneFiche)?.addEventListener('click', () => zoom(p));
    // Produits similaires (même catégorie)
    const sim = liste.filter((x) => x.id !== p.id && (x.categorie || '') === (p.categorie || '')).sort((a, b) => b.disponible - a.disponible).slice(0, 4);
    const zs = $('#similaires');
    zs.hidden = !sim.length;
    if (sim.length) {
      $('h2', zs).textContent = t('Dans le même rayon', 'From the same aisle');
      $('#grille-similaires').innerHTML = sim.map((p) => carteHTML(p)).join('');
      brancherAjouts(zs, liste);
    }
  }
  // Agrandissement de la photo (fenêtre accessible, fermeture par Échap ou clic)
  function zoom(p) {
    const d = document.createElement('dialog');
    d.className = 'zoom-photo'; d.dataset.dynamique = '';
    d.setAttribute('aria-label', p.designation);
    d.innerHTML = `<img src="${esc(p.photo_url)}" alt="${esc(p.designation)}"><button class="outil-btn" type="button" aria-label="${esc(t('Fermer', 'Close'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
    document.body.append(d);
    d.addEventListener('close', () => { d.remove(); $('.fiche-zoom')?.focus(); });
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('button')) d.close(); });
    d.showModal();
    $('button', d).focus();
  }

  /* ---------------- Accueil : produits vedettes et rayons ---------------- */
  const zoneVedettes = $('#vedettes');
  async function initVedettes() {
    if (!zoneVedettes) return;
    let liste;
    try { liste = await catalogue(); } catch { return; }
    const dispo = liste.filter((p) => p.disponible);
    if (!dispo.length) return;   // rien d'inventé : la section reste cachée tant que la boutique est vide
    const choix = [...dispo].sort((a, b) => (b.nouveau - a.nouveau) || (!!b.photo_url - !!a.photo_url) || b.id - a.id).slice(0, 8);
    zoneVedettes.hidden = false;
    $('h2', zoneVedettes).textContent = t('À découvrir', 'Featured');
    $('.intro-section', zoneVedettes).textContent = t('Une sélection de produits disponibles en ce moment à la cave.', 'A selection of products available right now at the shop.');
    $('.lien-boutique', zoneVedettes).textContent = t('Voir toute la boutique', 'See the whole shop');
    $('#grille-vedettes').innerHTML = choix.map((p) => carteHTML(p)).join('');
    brancherAjouts(zoneVedettes, liste);
    const cats = [...new Set(liste.map((p) => p.categorie).filter(Boolean))];
    const zc = $('#rayons');
    if (zc && cats.length > 1) {
      zc.hidden = false;
      $('h2', zc).textContent = t('Nos rayons', 'Our aisles');
      $('.puces', zc).innerHTML = cats.map((c) => `<a class="puce" href="produits?cat=${encodeURIComponent(c)}">${esc(nomCat(c))}<span class="puce-nb">${liste.filter((p) => p.categorie === c).length}</span></a>`).join('');
    }
  }

  /* ---------------- Langue et démarrage ---------------- */
  V.surLangue(() => {
    majCompteur();
    if (!tiroir.hidden) dessinerPanier();
    if (zoneBoutique && toutes.length) { libellesBoutique(); dessinerFiltresCat(); appliquer(); }
    if (zoneFiche && produitActuel) catalogue().then(dessinerFiche).catch(() => {});
    if (zoneVedettes && !zoneVedettes.hidden) initVedettes();
  });
  majCompteur();
  initBoutique();
  initFiche();
  initVedettes();
  addEventListener('storage', (e) => { if (e.key === CLE) { majCompteur(); if (!tiroir.hidden) dessinerPanier(); } });
})();
