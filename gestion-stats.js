/* GestPro – tableau de bord (administrateur), rapports et journal.
 * Tous les chiffres viennent de la base (fonction statistiques et tables
 * réelles) : aucun chiffre n'est inventé. Les graphiques sont dessinés en
 * SVG, sans bibliothèque externe, avec infobulles au survol et au clavier. */
(() => {
  'use strict';
  const GP = window.GP;
  const { $, $$, esc, nf, fcfa, dateFr, dateHeureFr, aujourdhui, isoLocal, normaliser, icone, attendre, badge, toast, messageErreur, chargement } = GP;
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const jour = (iso) => new Date(iso + 'T00:00:00');
  const court = (n) => { const v = Math.abs(n); return v >= 1e6 ? `${nf.format(Math.round(n / 1e5) / 10)} M` : v >= 1e3 ? `${nf.format(Math.round(n / 100) / 10)} k` : nf.format(Math.round(n)); };

  /* ------------------------------------------------------------------
   * Périodes
   * ------------------------------------------------------------------ */
  const PERIODES = {
    jour: ['Aujourd’hui', () => [aujourdhui(), aujourdhui()]],
    '7j': ['7 jours', () => [isoLocal(new Date(Date.now() - 6 * 864e5)), aujourdhui()]],
    '30j': ['30 jours', () => [isoLocal(new Date(Date.now() - 29 * 864e5)), aujourdhui()]],
    mois: ['Ce mois', () => { const d = new Date(); return [isoLocal(new Date(d.getFullYear(), d.getMonth(), 1)), aujourdhui()]; }],
    moisDernier: ['Mois dernier', () => { const d = new Date(); return [isoLocal(new Date(d.getFullYear(), d.getMonth() - 1, 1)), isoLocal(new Date(d.getFullYear(), d.getMonth(), 0))]; }],
    annee: ['Cette année', () => [isoLocal(new Date(new Date().getFullYear(), 0, 1)), aujourdhui()]],
  };
  function filtrePeriode(etat, surChange, idPrefixe) {
    return {
      html: `<div class="filtre-periode">
        <div class="segments" role="group" aria-label="Période">${Object.entries(PERIODES).map(([k, [l]]) => `<button type="button" data-per="${k}" aria-pressed="${etat.cle === k}">${l}</button>`).join('')}</div>
        <span class="dates-perso"><label class="visuellement-cache" for="${idPrefixe}-du">Du</label><input type="date" id="${idPrefixe}-du" value="${etat.du}"> → <label class="visuellement-cache" for="${idPrefixe}-au">Au</label><input type="date" id="${idPrefixe}-au" value="${etat.au}"></span>
      </div>`,
      brancher: () => {
        $$('[data-per]').forEach((b) => (b.onclick = () => { etat.cle = b.dataset.per; [etat.du, etat.au] = PERIODES[etat.cle][1](); $(`#${idPrefixe}-du`).value = etat.du; $(`#${idPrefixe}-au`).value = etat.au; $$('[data-per]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); surChange(); }));
        for (const k of ['du', 'au']) $(`#${idPrefixe}-${k}`).onchange = () => {
          const v = $(`#${idPrefixe}-${k}`).value; if (!v) return;
          etat[k] = v; if (etat.du > etat.au) { if (k === 'du') etat.au = etat.du; else etat.du = etat.au; $(`#${idPrefixe}-du`).value = etat.du; $(`#${idPrefixe}-au`).value = etat.au; }
          etat.cle = ''; $$('[data-per]').forEach((x) => x.setAttribute('aria-pressed', 'false')); surChange();
        };
      },
    };
  }
  const libellePeriode = (e) => (e.du === e.au ? `le ${dateFr(e.du)}` : `du ${dateFr(e.du)} au ${dateFr(e.au)}`);

  /* ------------------------------------------------------------------
   * Graphiques SVG
   * ------------------------------------------------------------------ */
  // Regroupe une série journalière par semaine ou par mois
  function regrouper(serie, pas) {
    if (pas === 'jour') return serie.map((p) => ({ ...p, cle: p.jour, lib: dateFr(p.jour).slice(0, 5), titre: dateFr(p.jour) }));
    const m = new Map();
    for (const p of serie) {
      const d = jour(p.jour);
      let cle, lib, titre;
      if (pas === 'semaine') { const l = new Date(d); l.setDate(d.getDate() - ((d.getDay() + 6) % 7)); cle = isoLocal(l); lib = dateFr(cle).slice(0, 5); titre = `Semaine du ${dateFr(cle)}`; }
      else { cle = p.jour.slice(0, 7); lib = d.toLocaleDateString('fr-FR', { month: 'short' }); titre = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); }
      const g = m.get(cle) || { cle, lib, titre };
      for (const [k, v] of Object.entries(p)) if (typeof v === 'number') g[k] = (g[k] || 0) + v;
      m.set(cle, g);
    }
    return [...m.values()];
  }

  // Bornes « rondes » de l'axe
  function echelle(min, max) {
    if (max === min) max = min + 1;
    const brut = (max - min) / 4;
    const p = 10 ** Math.floor(Math.log10(brut));
    const pas = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= brut);
    return { min: Math.floor(min / pas) * pas, max: Math.ceil(max / pas) * pas, pas };
  }

  // Courbes (une seule échelle, en FCFA) avec réticule et infobulle
  function courbes(zone, points, series, { hauteur = 260 } = {}) {
    const L = Math.max(320, zone.clientWidth || 640), H = hauteur, g = 58, d = 14, h = 14, b = 28;
    const vals = points.flatMap((p) => series.map((s) => p[s.cle] || 0));
    const e = echelle(Math.min(0, ...vals), Math.max(0, ...vals));
    const x = (i) => g + (points.length === 1 ? (L - g - d) / 2 : (i * (L - g - d)) / (points.length - 1));
    const y = (v) => h + (H - h - b) * (1 - (v - e.min) / (e.max - e.min));
    const graduations = []; for (let v = e.min; v <= e.max + 1e-9; v += e.pas) graduations.push(v);
    const tous = Math.max(1, Math.ceil(points.length / Math.floor((L - g) / 64)));
    const chemin = (s) => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[s.cle] || 0).toFixed(1)}`).join('');
    const aire = `${chemin(series[0])}L${x(points.length - 1).toFixed(1)},${y(Math.max(0, e.min)).toFixed(1)}L${x(0).toFixed(1)},${y(Math.max(0, e.min)).toFixed(1)}Z`;
    zone.innerHTML = `<svg viewBox="0 0 ${L} ${H}" role="img" aria-label="${esc(series.map((s) => s.nom).join(' et '))} sur la période">
      <defs><linearGradient id="degrade-ca" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="stop-ca" stop-opacity=".22"/><stop offset="1" class="stop-ca" stop-opacity="0"/></linearGradient></defs>
      <g class="grille">${graduations.map((v) => `<line x1="${g}" x2="${L - d}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>
      <g class="axe">${graduations.map((v) => `<text x="${g - 8}" y="${y(v) + 4}" text-anchor="end">${court(v)}</text>`).join('')}
        ${points.map((p, i) => (i % tous === 0 || i === points.length - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.lib)}</text>` : '')).join('')}</g>
      <path class="aire-ca" d="${aire}"/>
      ${series.map((s, k) => (k ? `<path class="${s.classe}" d="${chemin(s)}"/>` : `<path class="${s.classe} anime" d="${chemin(s)}" pathLength="2000" stroke-dasharray="2000"/>`)).join('')}
 ${points.length <= 12 ? points.map((p, i) => `<circle class="marque-point" r="4" cx="${x(i)}" cy="${y(p[series[0].cle] || 0)}"/>`).join('') : ''}
      <line class="curseur" y1="${h}" y2="${H - b}" x1="0" x2="0"/>
      ${series.map((s) => `<circle class="point" data-s="${s.cle}" r="4.5" cx="0" cy="0"/>`).join('')}
      <rect class="zone-survol" x="${g}" y="${h}" width="${L - g - d}" height="${H - h - b}" tabindex="0" aria-label="Survolez ou utilisez les flèches pour lire les valeurs"/>
    </svg><div class="infobulle" hidden></div>`;
    const svg = $('svg', zone), bulle = $('.infobulle', zone), cur = $('.curseur', zone), surv = $('.zone-survol', zone);
    let actif = -1;
    const montrer = (i) => {
      actif = Math.max(0, Math.min(points.length - 1, i));
      const p = points[actif], k = svg.getBoundingClientRect().width / L;
      cur.setAttribute('x1', x(actif)); cur.setAttribute('x2', x(actif)); cur.classList.add('visible');
      series.forEach((s) => { const c = $(`.point[data-s="${s.cle}"]`, zone); c.setAttribute('cx', x(actif)); c.setAttribute('cy', y(p[s.cle] || 0)); c.classList.add('visible'); });
      bulle.replaceChildren();
      const t = document.createElement('div'); t.textContent = p.titre; bulle.append(t);
      for (const s of series) { const l = document.createElement('div'); const v = document.createElement('strong'); v.textContent = fcfa(p[s.cle] || 0); l.append(v, ` ${s.nom}`); bulle.append(l); }
      bulle.hidden = false;
      bulle.style.left = `${Math.min(Math.max(x(actif) * k, 80), svg.clientWidth - 80)}px`;
      bulle.style.top = `${y(Math.max(...series.map((s) => p[s.cle] || 0))) * k}px`;
    };
    const cacher = () => { bulle.hidden = true; cur.classList.remove('visible'); $$('.point', zone).forEach((c) => c.classList.remove('visible')); };
    surv.addEventListener('pointermove', (ev) => { const r = svg.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * L; montrer(Math.round(((px - g) / (L - g - d)) * (points.length - 1))); });
    surv.addEventListener('pointerleave', cacher);
    surv.addEventListener('blur', cacher);
    surv.addEventListener('focus', () => montrer(actif < 0 ? points.length - 1 : actif));
    surv.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowLeft') { ev.preventDefault(); montrer(actif - 1); } if (ev.key === 'ArrowRight') { ev.preventDefault(); montrer(actif + 1); } });
  }

  // Barres verticales groupées (entrées / sorties de stock)
  function barresGroupees(zone, points, series, { hauteur = 220, unite = '' } = {}) {
    const L = Math.max(320, zone.clientWidth || 640), H = hauteur, g = 44, d = 8, h = 12, b = 26;
    const e = echelle(0, Math.max(1, ...points.flatMap((p) => series.map((s) => p[s.cle] || 0))));
    const y = (v) => h + (H - h - b) * (1 - v / e.max);
    const larg = (L - g - d) / points.length;
    const lb = Math.max(2, Math.min(22, (larg - 6) / series.length - 2));
    const graduations = []; for (let v = 0; v <= e.max + 1e-9; v += e.pas) graduations.push(v);
    const tous = Math.max(1, Math.ceil(points.length / Math.floor((L - g) / 56)));
    zone.innerHTML = `<svg viewBox="0 0 ${L} ${H}" role="img" aria-label="${esc(series.map((s) => s.nom).join(' et '))}">
      <g class="grille">${graduations.map((v) => `<line x1="${g}" x2="${L - d}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>
      <g class="axe">${graduations.map((v) => `<text x="${g - 6}" y="${y(v) + 4}" text-anchor="end">${court(v)}</text>`).join('')}
        ${points.map((p, i) => (i % tous === 0 ? `<text x="${g + larg * i + larg / 2}" y="${H - 8}" text-anchor="middle">${esc(p.lib)}</text>` : '')).join('')}</g>
      ${points.map((p, i) => series.map((s, k) => {
        const v = p[s.cle] || 0, x0 = g + larg * i + (larg - series.length * (lb + 2)) / 2 + k * (lb + 2);
        return v ? `<path class="${s.classe} barre-anim-v" tabindex="0" data-i="${i}" d="M${x0},${y(0)}V${y(v) + Math.min(4, (y(0) - y(v)) / 2)}Q${x0},${y(v)} ${x0 + Math.min(4, lb / 2)},${y(v)}H${x0 + lb - Math.min(4, lb / 2)}Q${x0 + lb},${y(v)} ${x0 + lb},${y(v) + Math.min(4, (y(0) - y(v)) / 2)}V${y(0)}Z"><title>${esc(`${p.titre} · ${s.nom} : ${nf.format(v)} ${unite}`)}</title></path>` : '';
      }).join('')).join('')}
    </svg><div class="infobulle" hidden></div>`;
    const svg = $('svg', zone), bulle = $('.infobulle', zone);
    const montrer = (el) => {
      const i = Number(el.dataset.i), p = points[i], k = svg.getBoundingClientRect().width / L;
      bulle.replaceChildren();
      const t = document.createElement('div'); t.textContent = p.titre; bulle.append(t);
      for (const s of series) { const l = document.createElement('div'); const v = document.createElement('strong'); v.textContent = `${nf.format(p[s.cle] || 0)} ${unite}`; l.append(v, ` ${s.nom}`); bulle.append(l); }
      bulle.hidden = false;
      bulle.style.left = `${Math.min(Math.max((g + larg * i + larg / 2) * k, 80), svg.clientWidth - 80)}px`;
      bulle.style.top = `${y(Math.max(...series.map((s) => p[s.cle] || 0))) * k}px`;
    };
    $$('[data-i]', zone).forEach((el) => { el.addEventListener('pointerenter', () => montrer(el)); el.addEventListener('focus', () => montrer(el)); el.addEventListener('pointerleave', () => (bulle.hidden = true)); el.addEventListener('blur', () => (bulle.hidden = true)); });
  }

  // Barres horizontales (HTML) : classement des produits, catégories, paiements
  const barresListe = (rangees, { valeur, libelle, detail = () => '', or = false }) => {
    if (!rangees.length) return '<p class="vide">Aucune vente sur la période.</p>';
    const max = Math.max(...rangees.map(valeur), 1);
    return `<div class="barres-liste">${rangees.map((r) => `<div class="barre-ligne" title="${esc(`${libelle(r)} : ${fcfa(valeur(r))}${detail(r) ? ` · ${detail(r)}` : ''}`)}">
      <span class="nom">${esc(libelle(r))}${detail(r) ? ` <span class="note">${esc(detail(r))}</span>` : ''}</span>
      <span class="piste"><span class="rempli ${or ? 'or' : ''}" data-l="${Math.max(2, (valeur(r) / max) * 100)}"></span></span>
      <span class="valeur">${fcfa(valeur(r))}</span></div>`).join('')}</div>`;
  };
  // Largeur des barres sans attribut style (politique de sécurité du site)
  const appliquerLargeurs = (racine) => $$('.rempli[data-l]', racine).forEach((el) => (el.style.width = `${el.dataset.l}%`));

  const evolution = (a, b) => {
    const p = b ? ((a - b) / Math.abs(b)) * 100 : null;
    if (p === null) return a ? '<span class="evol stable">nouveau</span>' : '';
    const r = Math.round(p);
    return `<span class="evol ${r > 0 ? 'hausse' : r < 0 ? 'baisse' : 'stable'}" title="Par rapport à la période précédente de même durée">${r > 0 ? '▲' : r < 0 ? '▼' : '='} ${Math.abs(r)} %</span>`;
  };
  const kpi = (lib, val, sous = '', cls = '') => `<div class="kpi ${cls}"><div class="lib">${esc(lib)}</div><div class="val">${val}</div>${sous ? `<div class="sous">${sous}</div>` : ''}</div>`;

  /* ------------------------------------------------------------------
   * Tableau de bord
   * ------------------------------------------------------------------ */
  const etatTdb = { cle: '30j', du: '', au: '', pas: 'jour' };
  let stats = null;
  GP.vues.tableau = async (silencieux) => {
    if (!etatTdb.du) [etatTdb.du, etatTdb.au] = PERIODES[etatTdb.cle][1]();
    if (!silencieux || !$('#stats-zone')) {
      const f = filtrePeriode(etatTdb, () => chargerStats(), 'tdb');
      $('#actions-vue').innerHTML = `<button class="btn" type="button" id="btn-actualiser-tdb">${icone('historique')} Actualiser</button>`;
      $('#btn-actualiser-tdb').onclick = () => chargerStats();
      $('#vue').innerHTML = `<div class="outils">${f.html}</div><div id="stats-zone" class="stats-zone">${chargement(4, true)}</div>`;
      f.brancher();
    }
    await chargerStats(true);
  };

  async function chargerStats(premier = false) {
    const zone = $('#stats-zone');
    if (!zone) return;
    if (!premier) zone.classList.add('recharge');
    const { data, error } = await GP.sb.rpc('statistiques', { p_debut: etatTdb.du, p_fin: etatTdb.au });
    zone.classList.remove('recharge');
    if (error) { if (premier) throw error; toast(messageErreur(error), true); return; }
    if (GP.vue !== 'tableau') return;
    stats = data;
    const s = data, p = s.precedent;
    const marge = s.ca - s.cout, margeP = p.ca - p.cout;
    const benef = marge - s.depenses, benefP = margeP - p.depenses;
    const nbJours = Math.round((jour(etatTdb.au) - jour(etatTdb.du)) / 864e5) + 1;
    if (nbJours > 92 && etatTdb.pas === 'jour') etatTdb.pas = 'semaine';
    zone.innerHTML = `
      <div class="kpis">
        ${kpi("Chiffre d'affaires du jour", fcfa(s.ca_jour), '', 'accent')}
        ${kpi("Chiffre d'affaires de la semaine", fcfa(s.ca_semaine), 'depuis lundi', 'accent')}
        ${kpi("Chiffre d'affaires du mois", fcfa(s.ca_mois), 'depuis le 1er', 'accent')}
        ${kpi('Valeur du stock', fcfa(s.valeur_stock), `au coût moyen d’achat · ${fcfa(s.valeur_stock_vente)} au prix de vente`, 'or')}
      </div>
      <h3 class="titre-section">Sur la période ${esc(libellePeriode(etatTdb))}</h3><br>
      <div class="kpis">
        ${kpi("Chiffre d'affaires", fcfa(s.ca), `${evolution(s.ca, p.ca)} ${s.remises ? `· remises ${fcfa(s.remises)}` : ''}`, 'accent')}
        ${kpi('Ventes réalisées', nf.format(s.nb_ventes), `${evolution(s.nb_ventes, p.nb_ventes)} · ${nf.format(s.articles)} unités · panier moyen ${fcfa(s.nb_ventes ? s.ca / s.nb_ventes : 0)}`)}
        ${kpi('Marge commerciale', fcfa(marge), `${evolution(marge, margeP)} · taux ${pct(marge, s.ca) ?? 0} %${s.cout_estime ? ' · coût partiellement estimé' : ''}`, marge >= 0 ? 'vert' : 'rouge')}
        ${kpi('Dépenses de fonctionnement', fcfa(s.depenses), `${evolution(s.depenses, p.depenses)}${s.achats_marchandises ? ` · hors ${fcfa(s.achats_marchandises)} d’achats de marchandises` : ''}`, 'orange')}
        ${kpi('Bénéfice estimé', fcfa(benef), `${evolution(benef, benefP)} · marge − dépenses`, benef >= 0 ? 'positif' : 'negatif')}
        ${kpi('Produits enregistrés', nf.format(s.nb_produits), `${s.stock_faible.length} en stock faible · ${s.ruptures.length} en rupture`, s.ruptures.length ? 'rouge' : s.stock_faible.length ? 'orange' : 'vert')}
        ${kpi('Crédits clients', fcfa(s.credits_encours), s.credits_retard ? `<span class="qte-moins">${fcfa(s.credits_retard)} en retard</span>` : 'aucun retard', s.credits_retard ? 'rouge' : '')}
        ${kpi('À payer aux fournisseurs', fcfa(s.achats_a_payer), `${s.commandes_attente} achat(s) en attente de réception`)}
      </div>
      <div class="bloc">
        <div class="bloc-tete"><h3>Évolution des ventes</h3>
          <span class="legende"><span><i></i> Chiffre d’affaires</span><span><i class="or"></i> Marge</span></span>
          <div class="segments" role="group" aria-label="Regrouper par">${[['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois']].map(([k, l]) => `<button type="button" data-pas="${k}" aria-pressed="${etatTdb.pas === k}">${l}</button>`).join('')}</div></div>
        <div class="graphique" id="g-ventes"></div>
        <details class="donnees"><summary>Afficher les données en tableau</summary><div id="t-ventes"></div></details>
      </div>
      <div class="grille-2">
        <div class="bloc"><div class="bloc-tete"><h3>Boissons les plus vendues</h3><span class="note">chiffre d’affaires</span></div><div id="g-top"></div></div>
        <div class="bloc"><div class="bloc-tete"><h3>Chiffre d’affaires par catégorie</h3></div><div id="g-cat"></div></div>
      </div>
      <div class="grille-2">
        <div class="bloc"><div class="bloc-tete"><h3>Mouvements de stock</h3><span class="legende"><span><i class="carre-or"></i> Entrées</span><span><i class="carre-bordeaux"></i> Sorties</span></span></div><div class="graphique" id="g-stock"></div></div>
        <div class="bloc"><div class="bloc-tete"><h3>Recettes par mode de paiement</h3></div><div id="g-modes"></div>
          ${s.encaissements_credit ? `<p class="note">+ ${fcfa(s.encaissements_credit)} encaissés sur des crédits pendant la période.</p>` : ''}</div>
      </div>
      <div class="grille-2">
        <div class="bloc"><div class="bloc-tete"><h3>Stock à surveiller</h3><button class="btn petit" type="button" id="btn-voir-stock">Voir le stock</button></div>
          ${s.ruptures.length || s.stock_faible.length ? `<ul class="liste-simple">
            ${s.ruptures.slice(0, 8).map((x) => `<li><span>${esc(x.designation)}</span>${badge('Rupture', 'rouge')}</li>`).join('')}
            ${s.stock_faible.slice(0, 10).map((x) => `<li><span>${esc(x.designation)}</span><span>${badge(`${nf.format(x.quantite)} / seuil ${nf.format(x.seuil)}`, 'orange')}</span></li>`).join('')}
          </ul>` : '<p class="vide">Aucun produit en stock faible ni en rupture.</p>'}
          ${s.peremptions.length ? `<br><h3>Péremptions sous 30 jours</h3><ul class="liste-simple">${s.peremptions.map((x) => `<li><span>${esc(x.designation)} <span class="note">(${nf.format(x.quantite)})</span></span>${badge(dateFr(x.date), x.date < aujourdhui() ? 'rouge' : 'orange')}</li>`).join('')}</ul>` : ''}
        </div>
        <div class="bloc"><div class="bloc-tete"><h3>Comment lire ces chiffres</h3></div>
          <ul class="liste-simple note">
            <li><span>Chiffre d’affaires : ventes encaissées ou à crédit, après remise, sans les ventes annulées ni les intérêts (${fcfa(s.interets_factures)} d’intérêts facturés sur la période).</span></li>
            <li><span>Marge = chiffre d’affaires − coût d’achat des boissons vendues (coût moyen pondéré au moment de la vente${s.cout_estime ? ' ; pour les ventes antérieures à la mise à jour, le prix d’achat actuel est utilisé' : ''}).</span></li>
            <li><span>Bénéfice estimé = marge − dépenses de fonctionnement enregistrées. Il ne tient compte que des dépenses saisies dans « Dépenses ».</span></li>
            <li><span>Annulations sur la période : ${s.annulations.nombre} ticket(s), ${fcfa(s.annulations.montant)}.</span></li>
          </ul></div>
      </div>`;
    $('#btn-voir-stock').onclick = () => GP.afficher('produits');
    $$('[data-pas]').forEach((b) => (b.onclick = () => { etatTdb.pas = b.dataset.pas; $$('[data-pas]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); dessinerVentes(); }));
    dessinerVentes();
    $('#g-top').innerHTML = barresListe(s.top_produits, { valeur: (r) => Number(r.ca), libelle: (r) => r.designation, detail: (r) => `${nf.format(r.quantite)} u.` });
    $('#g-cat').innerHTML = barresListe(s.categories, { valeur: (r) => Number(r.ca), libelle: (r) => r.categorie, detail: (r) => `${pct(Number(r.ca), s.ca) ?? 0} %`, or: true });
    $('#g-modes').innerHTML = barresListe(s.modes_paiement, { valeur: (r) => Number(r.montant), libelle: (r) => r.mode });
    appliquerLargeurs(zone);
    const mvts = regrouper(s.mouvements_par_jour, nbJours > 45 ? (nbJours > 200 ? 'mois' : 'semaine') : 'jour');
    if (mvts.some((m) => m.entrees || m.sorties)) barresGroupees($('#g-stock'), mvts, [{ cle: 'entrees', nom: 'entrées', classe: 'barre-entree' }, { cle: 'sorties', nom: 'sorties', classe: 'barre-sortie' }], { unite: 'unités' });
    else $('#g-stock').innerHTML = '<p class="vide">Aucun mouvement de stock sur la période.</p>';
  }

  function dessinerVentes() {
    const pts = regrouper(stats.par_jour, etatTdb.pas);
    const z = $('#g-ventes');
    if (!stats.ca && !pts.some((p) => p.ca)) { z.innerHTML = '<p class="vide">Aucune vente sur la période.</p>'; $('#t-ventes').innerHTML = ''; return; }
    courbes(z, pts, [{ cle: 'ca', nom: 'chiffre d’affaires', classe: 'ligne-ca' }, { cle: 'marge', nom: 'marge', classe: 'ligne-marge' }]);
    $('#t-ventes').innerHTML = `<div class="table-wrap"><table class="echeancier"><thead><tr><th>Période</th><th class="num">Chiffre d’affaires</th><th class="num">Marge</th></tr></thead><tbody>${pts.map((p) => `<tr><td>${esc(p.titre)}</td><td class="num">${fcfa(p.ca)}</td><td class="num">${fcfa(p.marge)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  addEventListener('resize', attendre(() => { if (GP.vue === 'tableau' && stats && $('#g-ventes')) dessinerVentes(); }, 250));

  /* ------------------------------------------------------------------
   * Rapports (impression et export CSV)
   * ------------------------------------------------------------------ */
  const etatRap = { cle: 'mois', du: '', au: '', onglet: 'synthese', categorie: '', produit: '', vendeur: '' };
  const ONGLETS = [['synthese', 'Ventes par jour'], ['detail', 'Détail des ventes'], ['produits', 'Produits'], ['categories', 'Catégories'], ['marges', 'Marges'], ['depenses', 'Dépenses'], ['achats', 'Achats'], ['annulations', 'Annulations'], ['mouvements', 'Mouvements de stock']];
  let donnees = null;

  GP.vues.rapports = async () => {
    if (!etatRap.du) [etatRap.du, etatRap.au] = PERIODES[etatRap.cle][1]();
    const f = filtrePeriode(etatRap, () => chargerRapports(), 'rap');
    $('#actions-vue').innerHTML = `<button class="btn" type="button" id="btn-imprimer-rap">${icone('imprimer')} Imprimer</button><button class="btn" type="button" id="btn-csv-rap">${icone('export')} Exporter CSV</button>`;
    $('#vue').innerHTML = `
      <div class="outils">${f.html}</div>
      <div class="outils">
        <select id="r-cat" aria-label="Catégorie"><option value="">Toutes les catégories</option></select>
        <input type="search" id="r-prod" class="champ-outil" placeholder="Filtrer par produit…" aria-label="Produit" value="${esc(etatRap.produit)}">
        <select id="r-vendeur" aria-label="Vendeur"><option value="">Tous les vendeurs</option></select>
      </div>
      <div class="onglets" role="tablist">${ONGLETS.map(([k, l]) => `<button type="button" role="tab" data-onglet="${k}" aria-selected="${etatRap.onglet === k}">${l}</button>`).join('')}</div>
      <div id="rapport" role="tabpanel">${chargement(6)}</div>`;
    f.brancher();
    $$('[data-onglet]').forEach((b) => (b.onclick = () => { etatRap.onglet = b.dataset.onglet; $$('[data-onglet]').forEach((x) => x.setAttribute('aria-selected', String(x === b))); dessinerRapport(); }));
    $('#r-cat').onchange = () => { etatRap.categorie = $('#r-cat').value; dessinerRapport(); };
    $('#r-vendeur').onchange = () => { etatRap.vendeur = $('#r-vendeur').value; dessinerRapport(); };
    $('#r-prod').oninput = attendre(() => { etatRap.produit = $('#r-prod').value; dessinerRapport(); }, 200);
    $('#btn-imprimer-rap').onclick = () => { const r = rapportCourant(); GP.imprimer(`<h2>${esc(r.titre)}</h2><p class="note">${esc(GP.cfg.nomEntreprise || '')} · ${esc(libellePeriode(etatRap))}${filtresTexte()} · imprimé le ${esc(dateHeureFr(new Date().toISOString()))}</p><br>${tableHTML(r)}`); };
    $('#btn-csv-rap').onclick = () => { const r = rapportCourant(); GP.telechargerCSV(`rapport-${etatRap.onglet}-${etatRap.du}-${etatRap.au}`, r.colonnes.map((c) => c[0]), r.rangees.map((x) => x.map((v) => (v && typeof v === 'object' ? v.brut : v)))); };
    await chargerRapports(true);
  };
  const filtresTexte = () => [etatRap.categorie && ` · catégorie ${etatRap.categorie}`, etatRap.produit && ` · produit « ${etatRap.produit} »`, etatRap.vendeur && ` · vendeur ${donnees?.noms[etatRap.vendeur] || ''}`].filter(Boolean).join('');

  async function chargerRapports(premier = false) {
    const z = $('#rapport');
    if (!z) return;
    if (!premier) z.classList.add('recharge');
    const sb = GP.sb, { du, au } = etatRap;
    const [v, d, a, t, m, noms] = await Promise.all([
      sb.from('ventes').select('id, date, quantite, prix_unitaire, montant, remise, cout_unitaire, annulee, mode_paiement, ticket_id, created_by, conditionnement, nb_conditionnements, produit:produits!produit_id(designation, categorie, prix_achat), client:clients!client_id(nom)').gte('date', du).lte('date', au).order('date').order('id').limit(20000),
      sb.from('depenses').select('*').gte('date', du).lte('date', au).order('date').limit(5000),
      sb.from('commandes').select('*, fournisseur:fournisseurs!fournisseur_id(nom), produit:produits!produit_id(designation, categorie)').gte('date', du).lte('date', au).order('date').limit(5000),
      sb.from('tickets').select('id, created_at, annule_le, total, motif_annulation, montant_rembourse, annule_par, created_by, mode_paiement').eq('statut', 'annulée').gte('annule_le', `${du}T00:00:00`).lte('annule_le', `${au}T23:59:59.999`).limit(2000),
      sb.from('mouvements_stock').select('*').gte('created_at', `${du}T00:00:00`).lte('created_at', `${au}T23:59:59.999`).order('created_at').limit(20000),
      GP.equipe(),
    ]);
    z.classList.remove('recharge');
    const err = [v, d, a, t, m].find((r) => r.error)?.error;
    if (err) { if (premier) throw err; toast(messageErreur(err), true); return; }
    if (GP.vue !== 'rapports') return;
    donnees = { ventes: v.data, depenses: d.data, achats: a.data, annulations: t.data, mouvements: m.data, noms };
    const cats = [...new Set(v.data.map((x) => x.produit?.categorie).filter(Boolean))].sort();
    $('#r-cat').innerHTML = `<option value="">Toutes les catégories</option>${cats.map((c) => `<option ${c === etatRap.categorie ? 'selected' : ''}>${esc(c)}</option>`).join('')}`;
    const vendeurs = [...new Set(v.data.map((x) => x.created_by).filter(Boolean))];
    $('#r-vendeur').innerHTML = `<option value="">Tous les vendeurs</option>${vendeurs.map((id) => `<option value="${id}" ${id === etatRap.vendeur ? 'selected' : ''}>${esc(noms[id] || 'Inconnu')}</option>`).join('')}`;
    dessinerRapport();
  }

  const net = (x) => (x.annulee ? 0 : Number(x.montant) - Number(x.remise || 0));
  const cout = (x) => (x.annulee ? 0 : x.quantite * Number(x.cout_unitaire ?? x.produit?.prix_achat ?? 0));
  const argent = (n) => ({ html: fcfa(n), brut: Math.round(Number(n) * 100) / 100, num: true });
  const nombre = (n) => ({ html: nf.format(n), brut: n, num: true });
  function ventesFiltrees() {
    const p = normaliser(etatRap.produit);
    return donnees.ventes.filter((x) => (!etatRap.categorie || x.produit?.categorie === etatRap.categorie)
      && (!p || normaliser(x.produit?.designation).includes(p)) && (!etatRap.vendeur || x.created_by === etatRap.vendeur));
  }
  function grouper(liste, cle) {
    const m = new Map();
    for (const x of liste) { const k = cle(x); const g = m.get(k) || []; g.push(x); m.set(k, g); }
    return [...m.entries()];
  }

  function rapportCourant() {
    const V = ventesFiltrees(), valides = V.filter((x) => !x.annulee);
    const somme = (l, f) => l.reduce((s, x) => s + f(x), 0);
    const p = normaliser(etatRap.produit);
    switch (etatRap.onglet) {
      case 'synthese': {
        const g = grouper(valides, (x) => x.date);
        return { titre: 'Ventes par jour', colonnes: [['Date'], ['Ventes', 1], ['Unités', 1], ["Chiffre d'affaires", 1], ['Marge', 1]],
          rangees: g.map(([d, l]) => [dateFr(d), nombre(new Set(l.map((x) => x.ticket_id ? `t${x.ticket_id}` : `v${x.id}`)).size), nombre(somme(l, (x) => x.quantite)), argent(somme(l, net)), argent(somme(l, net) - somme(l, cout))]),
          total: ['Total', nombre(new Set(valides.map((x) => x.ticket_id ? `t${x.ticket_id}` : `v${x.id}`)).size), nombre(somme(valides, (x) => x.quantite)), argent(somme(valides, net)), argent(somme(valides, net) - somme(valides, cout))] };
      }
      case 'detail':
        return { titre: 'Détail des ventes', colonnes: [['Date'], ['Ticket'], ['Produit'], ['Client'], ['Quantité', 1], ['Montant net', 1], ['Paiement'], ['Vendeur'], ['État']],
          rangees: V.map((x) => [dateFr(x.date), x.ticket_id ? `n°${x.ticket_id}` : 'manuelle', `${x.produit?.designation || ''}${x.conditionnement ? ` (${x.nb_conditionnements} ${x.conditionnement})` : ''}`, x.client?.nom || '', nombre(x.quantite), argent(net(x)), x.mode_paiement, donnees.noms[x.created_by] || '', x.annulee ? 'annulée' : 'validée']),
          total: ['Total', '', '', '', nombre(somme(valides, (x) => x.quantite)), argent(somme(V, net)), '', '', ''] };
      case 'produits': case 'marges': {
        const g = grouper(valides, (x) => x.produit?.designation || '?').map(([n, l]) => ({ n, cat: l[0].produit?.categorie || '', q: somme(l, (x) => x.quantite), ca: somme(l, net), c: somme(l, cout), est: l.some((x) => x.cout_unitaire == null) })).sort((a, b) => b.ca - a.ca);
        if (etatRap.onglet === 'produits') return { titre: 'Produits les plus vendus', colonnes: [['Produit'], ['Catégorie'], ['Unités vendues', 1], ["Chiffre d'affaires", 1], ['Part du CA', 1]],
          rangees: g.map((r) => [r.n, r.cat, nombre(r.q), argent(r.ca), `${pct(r.ca, somme(valides, net)) ?? 0} %`]), total: ['Total', '', nombre(somme(g, (r) => r.q)), argent(somme(g, (r) => r.ca)), '100 %'] };
        const ca = somme(g, (r) => r.ca), c = somme(g, (r) => r.c);
        return { titre: 'Marges estimées par produit', note: g.some((r) => r.est) ? 'Coût estimé avec le prix d’achat actuel pour les ventes antérieures à la mise à jour.' : '', colonnes: [['Produit'], ["Chiffre d'affaires", 1], ["Coût d'achat", 1], ['Marge', 1], ['Taux de marge', 1]],
          rangees: g.map((r) => [`${r.n}${r.est ? ' *' : ''}`, argent(r.ca), argent(r.c), argent(r.ca - r.c), `${pct(r.ca - r.c, r.ca) ?? 0} %`]), total: ['Total', argent(ca), argent(c), argent(ca - c), `${pct(ca - c, ca) ?? 0} %`] };
      }
      case 'categories': {
        const g = grouper(valides, (x) => x.produit?.categorie || 'Sans catégorie').map(([n, l]) => [n, somme(l, (x) => x.quantite), somme(l, net), somme(l, cout)]).sort((a, b) => b[2] - a[2]);
        const ca = somme(g, (r) => r[2]);
        return { titre: 'Ventes par catégorie', colonnes: [['Catégorie'], ['Unités', 1], ["Chiffre d'affaires", 1], ['Part', 1], ['Marge', 1]],
          rangees: g.map((r) => [r[0], nombre(r[1]), argent(r[2]), `${pct(r[2], ca) ?? 0} %`, argent(r[2] - r[3])]), total: ['Total', nombre(somme(g, (r) => r[1])), argent(ca), '100 %', argent(ca - somme(g, (r) => r[3]))] };
      }
      case 'depenses': {
        const D = donnees.depenses;
        return { titre: 'Dépenses', colonnes: [['Date'], ['Libellé'], ['Catégorie'], ['Paiement'], ['Montant', 1]],
          rangees: D.map((x) => [dateFr(x.date), x.libelle, x.categorie || '', x.mode_paiement, argent(x.montant)]), total: ['Total', '', '', '', argent(somme(D, (x) => Number(x.montant)))],
          resume: grouper(D, (x) => x.categorie || 'Sans catégorie').map(([c, l]) => `${c} : ${fcfa(somme(l, (x) => Number(x.montant)))}`).join(' · ') };
      }
      case 'achats': {
        const A = donnees.achats.filter((x) => (!etatRap.categorie || x.produit?.categorie === etatRap.categorie) && (!p || normaliser(x.produit?.designation).includes(p)));
        const reste = (x) => (x.statut === 'annulée' ? 0 : Math.max(0, Number(x.montant) - Number(x.montant_paye || 0)));
        return { titre: 'Achats auprès des fournisseurs', colonnes: [['Date'], ['Bon'], ['Fournisseur'], ['Produit'], ['Quantité', 1], ['Montant', 1], ['Payé', 1], ['Reste', 1], ['Réception']],
          rangees: A.map((x) => [dateFr(x.date), x.reference_achat || `n°${x.id}`, x.fournisseur?.nom || '', x.produit?.designation || '', nombre(x.quantite), argent(x.montant), argent(x.montant_paye), argent(reste(x)), x.statut]),
          total: ['Total', '', '', '', nombre(somme(A.filter((x) => x.statut !== 'annulée'), (x) => x.quantite)), argent(somme(A.filter((x) => x.statut !== 'annulée'), (x) => Number(x.montant))), argent(somme(A, (x) => Number(x.montant_paye || 0))), argent(somme(A, reste)), ''] };
      }
      case 'annulations': {
        const T = donnees.annulations;
        return { titre: 'Annulations et remboursements', colonnes: [['Ticket'], ['Vendu le'], ['Annulé le'], ['Motif'], ['Annulé par'], ['Montant', 1], ['À rembourser', 1]],
          rangees: T.map((x) => [`n°${x.id}`, dateHeureFr(x.created_at), dateHeureFr(x.annule_le), x.motif_annulation || '', donnees.noms[x.annule_par] || '', argent(x.total), argent(x.montant_rembourse || 0)]),
          total: ['Total', '', '', '', '', argent(somme(T, (x) => Number(x.total))), argent(somme(T, (x) => Number(x.montant_rembourse || 0)))] };
      }
      case 'mouvements': {
        const M = donnees.mouvements.filter((x) => !p || normaliser(x.designation).includes(p));
        const g = grouper(M, (x) => x.type).map(([ty, l]) => [ty, l.length, somme(l, (x) => x.quantite)]);
        return { titre: 'Mouvements de stock', colonnes: [['Type de mouvement'], ['Nombre', 1], ['Unités', 1]],
          rangees: g.map((r) => [r[0], nombre(r[1]), { html: `<span class="${r[2] >= 0 ? 'qte-plus' : 'qte-moins'}">${r[2] > 0 ? '+' : ''}${nf.format(r[2])}</span>`, brut: r[2], num: true }]),
          total: ['Solde', nombre(M.length), nombre(somme(M, (x) => x.quantite))], lien: true };
      }
      default: return { titre: '', colonnes: [], rangees: [] };
    }
  }

  const tableHTML = (r) => {
    const cell = (v, i) => { const num = r.colonnes[i]?.[1] || (v && typeof v === 'object' && v.num); return `<td data-label="${esc(r.colonnes[i]?.[0] || '')}" class="${num ? 'num' : ''} ${i === 0 ? 'principal-cellule' : ''}">${v && typeof v === 'object' ? v.html : esc(v)}</td>`; };
    return `${r.note ? `<p class="note">${esc(r.note)}</p><br>` : ''}${r.resume ? `<p class="note">${esc(r.resume)}</p><br>` : ''}
      ${r.rangees.length ? `<div class="table-wrap"><table class="cartes"><thead><tr>${r.colonnes.map(([l, n]) => `<th class="${n ? 'num' : ''}">${esc(l)}</th>`).join('')}</tr></thead>
      <tbody>${r.rangees.map((x) => `<tr>${x.map(cell).join('')}</tr>`).join('')}</tbody>
      ${r.total ? `<tfoot><tr>${r.total.map(cell).join('')}</tr></tfoot>` : ''}</table></div>` : '<div class="table-wrap"><p class="vide">Aucune donnée pour ces filtres.</p></div>'}`;
  };

  function dessinerRapport() {
    const z = $('#rapport');
    if (!z || !donnees) return;
    const r = rapportCourant();
    z.innerHTML = `<div class="bloc-tete"><h3>${esc(r.titre)} <span class="note">${esc(libellePeriode(etatRap))}${esc(filtresTexte())}</span></h3>${r.lien ? '<button class="btn petit" type="button" id="btn-aller-mvt">Voir chaque mouvement</button>' : ''}</div>${tableHTML(r)}`;
    $('#btn-aller-mvt')?.addEventListener('click', () => GP.afficher('mouvements'));
  }

  /* ------------------------------------------------------------------
   * Journal des opérations
   * ------------------------------------------------------------------ */
  const CATS_JOURNAL = { vente: 'Ventes', annulation: 'Annulations', paiement: 'Paiements de crédit', stock: 'Stock', achat: 'Réceptions', prix: 'Changements de prix', depense: 'Dépenses' };
  const etatJ = { categorie: '', niveau: '', q: '' };
  let journal = [], nomsJ = {};
  GP.vues.journal = async (silencieux) => {
    if (!silencieux) {
      $('#actions-vue').innerHTML = `<button class="btn" type="button" id="btn-csv-j">${icone('export')} Exporter CSV</button>`;
      $('#vue').innerHTML = `<p class="encart info">Historique des opérations importantes : ventes, annulations, paiements, réceptions, ajustements et changements de prix. Il ne peut pas être modifié.</p><br>
        <div class="outils">
          <select id="j-cat" aria-label="Catégorie"><option value="">Toutes les opérations</option>${Object.entries(CATS_JOURNAL).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
          <select id="j-niv" aria-label="Importance"><option value="">Toutes les importances</option><option value="alerte">Alertes</option><option value="attention">À vérifier</option><option value="info">Informations</option></select>
          <input type="search" id="j-q" class="champ-outil" placeholder="Rechercher…" aria-label="Rechercher">
        </div><div id="liste">${chargement(8)}</div>`;
      $('#j-cat').value = etatJ.categorie; $('#j-niv').value = etatJ.niveau; $('#j-q').value = etatJ.q;
      $('#j-cat').onchange = () => { etatJ.categorie = $('#j-cat').value; GP.vues.journal(true); };
      $('#j-niv').onchange = () => { etatJ.niveau = $('#j-niv').value; GP.vues.journal(true); };
      $('#j-q').oninput = attendre(() => { etatJ.q = $('#j-q').value; dessinerJournal(); }, 150);
      $('#btn-csv-j').onclick = () => GP.telechargerCSV('journal', ['Date', 'Opération', 'Importance', 'Message', 'Par'], journalFiltre().map((j) => [dateHeureFr(j.created_at), CATS_JOURNAL[j.categorie] || j.categorie, j.niveau, j.message, nomsJ[j.user_id] || '']));
    }
    let q = GP.sb.from('journal').select('*').order('created_at', { ascending: false }).limit(1000);
    if (etatJ.categorie) q = q.eq('categorie', etatJ.categorie);
    if (etatJ.niveau) q = q.eq('niveau', etatJ.niveau);
    const [{ data, error }, noms] = await Promise.all([q, GP.equipe()]);
    if (error) throw error;
    if (GP.vue !== 'journal') return;
    journal = data; nomsJ = noms;
    dessinerJournal();
  };
  const journalFiltre = () => { const m = normaliser(etatJ.q).split(' ').filter(Boolean); return journal.filter((j) => m.every((w) => normaliser(`${j.message} ${nomsJ[j.user_id] || ''}`).includes(w))); };
  function dessinerJournal() {
    const z = $('#liste');
    if (!z) return;
    const l = journalFiltre();
    z.innerHTML = l.length ? `<div class="table-wrap"><table class="cartes"><thead><tr><th>Date</th><th>Opération</th><th>Détail</th><th>Par</th></tr></thead><tbody>
      ${l.map((j) => `<tr class="${j.niveau === 'alerte' ? 'alerte' : j.niveau === 'attention' ? 'attention' : ''}">
        <td data-label="Date">${esc(dateHeureFr(j.created_at))}</td>
        <td data-label="Opération">${badge(CATS_JOURNAL[j.categorie] || j.categorie, { vente: 'vert', annulation: 'rouge', paiement: 'bleu', stock: 'orange', achat: 'or', prix: 'accent', depense: '' }[j.categorie])}</td>
        <td class="texte principal-cellule" data-label="Détail">${esc(j.message)}${String(j.reference || '').startsWith('ticket:') ? ` <button class="btn lien" type="button" data-jt="${j.reference.split(':')[1]}">voir le ticket</button>` : ''}</td>
        <td data-label="Par">${esc(nomsJ[j.user_id] || 'Système')}</td></tr>`).join('')}
      </tbody></table></div><div class="compteur">${nf.format(l.length)} opération(s)${journal.length === 1000 ? ' · 1 000 dernières' : ''}</div>` : '<div class="table-wrap"><p class="vide">Aucune opération enregistrée.</p></div>';
    $$('[data-jt]', z).forEach((b) => (b.onclick = () => GP.ouvrirTicket?.(Number(b.dataset.jt))));
  }
})();
