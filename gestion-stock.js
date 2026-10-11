/* GestPro – stock (ajustements motivés, conditionnements, historique des
 * mouvements) et achats fournisseurs (bon de plusieurs produits, réception,
 * paiements). Les contrôles (stock jamais négatif, réception comptée une
 * seule fois, coût moyen pondéré) sont faits par la base. */
(() => {
  'use strict';
  const GP = window.GP;
  const { $, $$, esc, nf, fcfa, dateFr, dateHeureFr, aujourdhui, isoLocal, normaliser, icone, attendre, badge, toast, messageErreur, ouvrirDialogue, chargement } = GP;
  const TYPES_AJUSTEMENT = {
    'entrée': ['Entrée de marchandise', 'Ajoute la quantité au stock (don, retour client, marchandise trouvée…)'],
    'perte': ['Perte / vol', 'Retire la quantité du stock'],
    'casse': ['Casse', 'Retire la quantité du stock'],
    'péremption': ['Produit périmé', 'Retire la quantité du stock'],
    'inventaire': ['Inventaire (comptage)', 'Remplace le stock par la quantité comptée'],
  };
  const COULEUR_MVT = {
    'stock initial': 'bleu', 'vente': 'accent', 'annulation de vente': 'or', 'réception': 'vert', 'annulation de réception': 'orange',
    'entrée': 'vert', 'perte': 'rouge', 'casse': 'rouge', 'péremption': 'rouge', 'inventaire': 'bleu', 'modification': '',
  };
  const recharger = () => { if (GP.vue === 'produits' || GP.vue === 'commandes' || GP.vue === 'mouvements') GP.afficher(GP.vue, true); GP.chargerNotifications(); };

  /* ------------------------------------------------------------------
   * Ajuster le stock d'un produit
   * ------------------------------------------------------------------ */
  GP.ajusterStock = (p) => {
    ouvrirDialogue({
      titre: `Ajuster le stock · ${p.designation}`, ok: 'Enregistrer le mouvement',
      corps: `<p class="encart large">Stock actuel : <strong>${nf.format(p.quantite)}</strong> unité(s). Chaque ajustement est inscrit dans l’historique avec votre nom, la date et le motif.</p>
        <div class="large"><label for="aj-type">Type de mouvement *</label><select id="aj-type" name="type">${Object.entries(TYPES_AJUSTEMENT).map(([k, [l]]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select><p class="note" id="aj-aide"></p></div>
        <div><label for="aj-q" id="aj-lib-q">Quantité *</label><input id="aj-q" name="quantite" type="number" min="0" step="1" inputmode="numeric" required data-focus></div>
        <div><label>Stock après</label><div class="lecture-seule" id="aj-apres">${nf.format(p.quantite)}</div></div>
        <div class="large"><label for="aj-motif">Motif <span id="aj-oblig"></span></label><input id="aj-motif" name="motif" maxlength="200" placeholder="Ex. : carton tombé à la livraison, comptage du soir…"></div>`,
      apres: (f) => {
        const maj = () => {
          const t = f.type.value, q = Math.max(0, Math.floor(Number(f.quantite.value) || 0));
          $('#aj-aide').textContent = TYPES_AJUSTEMENT[t][1];
          $('#aj-lib-q').textContent = t === 'inventaire' ? 'Quantité comptée *' : 'Quantité *';
          $('#aj-oblig').textContent = ['perte', 'casse', 'péremption'].includes(t) ? '*' : '(facultatif)';
          const apres = t === 'entrée' ? p.quantite + q : t === 'inventaire' ? q : p.quantite - q;
          $('#aj-apres').textContent = `${nf.format(apres)}${t === 'inventaire' && f.quantite.value !== '' ? ` (écart ${apres - p.quantite > 0 ? '+' : ''}${nf.format(apres - p.quantite)})` : ''}`;
          $('#aj-apres').classList.toggle('qte-moins', apres < 0);
        };
        f.type.onchange = maj; f.quantite.oninput = maj; maj();
      },
      onOk: async (f) => {
        const t = f.type.value, q = Math.floor(Number(f.quantite.value));
        if (!(q >= 0) || f.quantite.value === '') throw new Error('Indiquez la quantité.');
        const { data, error } = await GP.sb.rpc('mouvement_stock', { p_produit: p.id, p_type: t, p_quantite: q, p_motif: f.motif.value.trim() || null });
        if (error) throw error;
        toast(`Stock de ${p.designation} : ${nf.format(data.stock_avant)} → ${nf.format(data.stock_apres)}`, 'ok');
        recharger();
      },
    });
  };

  /* ------------------------------------------------------------------
   * Conditionnements (pack, carton, casier…)
   * ------------------------------------------------------------------ */
  GP.conditionnements = async (p) => {
    const { data, error } = await GP.sb.from('conditionnements').select('*').eq('produit_id', p.id).order('unites');
    if (error) { toast(messageErreur(error), true); return; }
    const ligne = (c = {}) => `<div class="ligne-edition cond" data-ligne>
        <label>Nom<input name="nom" list="dl-noms-cond" value="${esc(c.nom || '')}" placeholder="Carton" maxlength="40" required></label>
        <label>Unités<input name="unites" type="number" min="2" max="1000" step="1" value="${esc(c.unites || '')}" placeholder="24" required></label>
        <label>Prix de vente<input name="prix" type="number" min="1" step="any" value="${esc(c.prix_vente || '')}" placeholder="FCFA" required></label>
        <label>Code-barres<input name="code" value="${esc(c.code_barres || '')}" maxlength="32" placeholder="facultatif"></label>
        <button type="button" class="btn-icone danger" data-retirer aria-label="Retirer ce conditionnement" title="Retirer">${icone('corbeille')}</button>
        <input type="hidden" name="id" value="${esc(c.id || '')}">
      </div>`;
    ouvrirDialogue({
      titre: `Conditionnements · ${p.designation}`, large: true, simple: true, ok: 'Enregistrer',
      corps: `<p class="encart">Le stock reste compté à l’unité (${nf.format(p.quantite)} en stock). Vendre 1 « Carton de 24 » retire 24 unités. Prix à l’unité actuel : <strong>${fcfa(p.prix_vente)}</strong>.</p><br>
        <datalist id="dl-noms-cond"><option value="Pack"><option value="Carton"><option value="Casier"><option value="Fardeau"><option value="Coffret"></datalist>
        <div class="lignes-edition" id="lignes-cond">${(data.length ? data : [{}]).map(ligne).join('')}</div><br>
        <button type="button" class="btn" id="btn-ajout-cond">${icone('plus')} Ajouter un conditionnement</button>
        <p class="note" id="cond-aide"></p>`,
      apres: () => {
        const zone = $('#lignes-cond');
        const brancher = () => {
          $$('[data-retirer]', zone).forEach((b) => (b.onclick = () => { b.closest('[data-ligne]').remove(); conseils(); }));
          $$('input', zone).forEach((i) => (i.oninput = conseils));
        };
        const conseils = () => {
          const t = $$('[data-ligne]', zone).map((l) => {
            const u = Number($('[name=unites]', l).value), px = Number($('[name=prix]', l).value);
            return u > 1 && px > 0 ? `${$('[name=nom]', l).value || 'Lot'} de ${u} : ${fcfa(px / u)} l’unité${p.prix_vente ? ` (${Math.round((1 - px / (u * p.prix_vente)) * 100)} % de moins qu’à l’unité)` : ''}` : '';
          }).filter(Boolean);
          $('#cond-aide').textContent = t.join(' · ');
        };
        $('#btn-ajout-cond').onclick = () => { zone.insertAdjacentHTML('beforeend', ligne()); brancher(); $('[data-ligne]:last-child input', zone).focus(); };
        brancher(); conseils();
      },
      onOk: async () => {
        const lignes = $$('#lignes-cond [data-ligne]').map((l) => ({
          id: Number($('[name=id]', l).value) || null, nom: $('[name=nom]', l).value.trim(), unites: Number($('[name=unites]', l).value),
          prix_vente: Number($('[name=prix]', l).value), code_barres: $('[name=code]', l).value.trim() || null,
        })).filter((l) => l.nom || l.unites || l.prix_vente);
        for (const l of lignes) {
          if (!l.nom) throw new Error('Donnez un nom à chaque conditionnement (Pack, Carton…).');
          if (!(l.unites >= 2)) throw new Error(`« ${l.nom} » : indiquez le nombre d’unités (2 ou plus).`);
          if (!(l.prix_vente > 0)) throw new Error(`« ${l.nom} » : indiquez le prix de vente.`);
        }
        if (new Set(lignes.map((l) => normaliser(l.nom))).size !== lignes.length) throw new Error('Deux conditionnements portent le même nom.');
        const gardes = lignes.filter((l) => l.id).map((l) => l.id);
        const aSupprimer = data.filter((c) => !gardes.includes(c.id)).map((c) => c.id);
        if (aSupprimer.length) { const { error: e } = await GP.sb.from('conditionnements').delete().in('id', aSupprimer); if (e) throw e; }
        for (const l of lignes) {
          const val = { produit_id: p.id, nom: l.nom, unites: l.unites, prix_vente: l.prix_vente, code_barres: l.code_barres };
          const { error: e } = l.id ? await GP.sb.from('conditionnements').update(val).eq('id', l.id) : await GP.sb.from('conditionnements').insert(val);
          if (e) throw e;
        }
        toast(`Conditionnements de ${p.designation} enregistrés`, 'ok');
      },
    });
  };

  /* ------------------------------------------------------------------
   * Historique d'un produit et écran « Mouvements de stock »
   * ------------------------------------------------------------------ */
  const ligneMvt = (m, noms, avecProduit = true) => `
    <tr>
      <td data-label="Date">${esc(dateHeureFr(m.created_at))}</td>
      ${avecProduit ? `<td class="principal-cellule" data-label="Produit">${esc(m.designation)}</td>` : ''}
      <td data-label="Type">${badge(m.type, COULEUR_MVT[m.type])}</td>
      <td class="num" data-label="Quantité"><span class="${m.quantite > 0 ? 'qte-plus' : 'qte-moins'}">${m.quantite > 0 ? '+' : ''}${nf.format(m.quantite)}</span></td>
      <td class="num" data-label="Stock">${nf.format(m.stock_avant)} → <strong>${nf.format(m.stock_apres)}</strong></td>
      <td class="texte" data-label="Motif / référence">${esc(m.motif || '')}${m.reference ? ` <span class="note">${esc(referenceLisible(m.reference))}</span>` : ''}</td>
      <td data-label="Par">${esc(noms[m.created_by] || (m.created_by ? '—' : 'Système'))}</td>
    </tr>`;
  const referenceLisible = (r) => { const [t, id] = String(r).split(':'); return { ticket: `ticket n°${id}`, vente: `vente n°${id}`, commande: `achat n°${id}`, produit: '' }[t] ?? r; };

  GP.historiqueProduit = async (p) => {
    const [{ data, error }, noms] = await Promise.all([
      GP.sb.from('mouvements_stock').select('*').eq('produit_id', p.id).order('created_at', { ascending: false }).limit(300),
      GP.equipe(),
    ]);
    if (error) { toast(messageErreur(error), true); return; }
    const entrees = data.filter((m) => m.quantite > 0).reduce((s, m) => s + m.quantite, 0), sorties = -data.filter((m) => m.quantite < 0).reduce((s, m) => s + m.quantite, 0);
    ouvrirDialogue({
      titre: `Historique · ${p.designation}`, large: true, simple: true, sansOk: true, annuler: 'Fermer',
      corps: `<div class="kpis">
          <div class="kpi accent"><div class="lib">Stock actuel</div><div class="val">${nf.format(p.quantite)}</div></div>
          <div class="kpi vert"><div class="lib">Entrées</div><div class="val">+${nf.format(entrees)}</div></div>
          <div class="kpi rouge"><div class="lib">Sorties</div><div class="val">−${nf.format(sorties)}</div></div>
        </div>
        ${data.length ? `<div class="table-wrap"><table class="cartes"><thead><tr><th>Date</th><th>Type</th><th class="num">Quantité</th><th class="num">Stock</th><th>Motif / référence</th><th>Par</th></tr></thead><tbody>${data.map((m) => ligneMvt(m, noms, false)).join('')}</tbody></table></div>`
          : '<p class="vide">Aucun mouvement enregistré depuis la mise à jour.</p>'}`,
    });
  };

  const filtreMvt = { du: '', au: '', type: '', q: '' };
  let mouvements = [], nomsMvt = {};
  GP.vues.mouvements = async (silencieux) => {
    if (!filtreMvt.du) { filtreMvt.du = isoLocal(new Date(Date.now() - 6 * 864e5)); filtreMvt.au = aujourdhui(); }
    if (!silencieux) {
      $('#actions-vue').innerHTML = `<button class="btn" type="button" id="btn-csv-mvt">${icone('export')} Exporter CSV</button>${GP.peutEcrire() ? `<button class="btn primaire" type="button" id="btn-ajuster">${icone('mouvements')} Ajuster un stock</button>` : ''}`;
      $('#vue').innerHTML = `<p class="encart info">Chaque entrée et chaque sortie de stock, avec la date, le motif et la personne responsable : ventes, annulations, réceptions, pertes, casse, péremptions et inventaires.</p><br>
        <div class="outils">
          <span class="dates-perso"><input type="date" id="m-du" aria-label="Du" value="${filtreMvt.du}"> → <input type="date" id="m-au" aria-label="Au" value="${filtreMvt.au}"></span>
          <select id="m-type" aria-label="Type"><option value="">Tous les mouvements</option>${Object.keys(COULEUR_MVT).map((t) => `<option ${t === filtreMvt.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <input type="search" id="m-q" class="champ-outil" placeholder="Produit, motif…" aria-label="Rechercher" value="${esc(filtreMvt.q)}">
        </div><div id="liste">${chargement(6)}</div>`;
      for (const [id, k] of [['m-du', 'du'], ['m-au', 'au'], ['m-type', 'type']]) $(`#${id}`).onchange = () => { filtreMvt[k] = $(`#${id}`).value; GP.vues.mouvements(true); };
      $('#m-q').oninput = attendre(() => { filtreMvt.q = $('#m-q').value; dessinerMvt(); }, 150);
      $('#btn-csv-mvt').onclick = () => GP.telechargerCSV('mouvements-stock', ['Date', 'Produit', 'Type', 'Quantité', 'Stock avant', 'Stock après', 'Motif', 'Référence', 'Par'],
        mvtFiltres().map((m) => [dateHeureFr(m.created_at), m.designation, m.type, m.quantite, m.stock_avant, m.stock_apres, m.motif || '', referenceLisible(m.reference || ''), nomsMvt[m.created_by] || '']));
      $('#btn-ajuster')?.addEventListener('click', choisirProduitAAjuster);
    }
    let q = GP.sb.from('mouvements_stock').select('*').order('created_at', { ascending: false }).limit(3000)
      .gte('created_at', `${filtreMvt.du}T00:00:00`).lte('created_at', `${filtreMvt.au}T23:59:59.999`);
    if (filtreMvt.type) q = q.eq('type', filtreMvt.type);
    const [{ data, error }, noms] = await Promise.all([q, GP.equipe()]);
    if (error) throw error;
    if (GP.vue !== 'mouvements') return;
    mouvements = data; nomsMvt = noms;
    dessinerMvt();
  };
  const mvtFiltres = () => { const mots = normaliser(filtreMvt.q).split(' ').filter(Boolean); return mouvements.filter((m) => mots.every((w) => normaliser(`${m.designation} ${m.motif || ''} ${m.type}`).includes(w))); };
  function dessinerMvt() {
    const zone = $('#liste');
    if (!zone) return;
    const liste = mvtFiltres();
    const e = liste.filter((m) => m.quantite > 0).reduce((s, m) => s + m.quantite, 0), s = -liste.filter((m) => m.quantite < 0).reduce((t, m) => t + m.quantite, 0);
    const pertes = -liste.filter((m) => ['perte', 'casse', 'péremption'].includes(m.type) || (m.type === 'inventaire' && m.quantite < 0)).reduce((t, m) => t + m.quantite, 0);
    zone.innerHTML = `<div class="kpis">
        <div class="kpi vert"><div class="lib">Entrées</div><div class="val">+${nf.format(e)}</div><div class="sous">unités</div></div>
        <div class="kpi accent"><div class="lib">Sorties</div><div class="val">−${nf.format(s)}</div><div class="sous">unités</div></div>
        <div class="kpi rouge"><div class="lib">Pertes, casse, péremptions, écarts</div><div class="val">−${nf.format(pertes)}</div><div class="sous">unités</div></div>
      </div>
      ${liste.length ? `<div class="table-wrap"><table class="cartes"><thead><tr><th>Date</th><th>Produit</th><th>Type</th><th class="num">Quantité</th><th class="num">Stock</th><th>Motif / référence</th><th>Par</th></tr></thead>
        <tbody>${liste.slice(0, 1000).map((m) => ligneMvt(m, nomsMvt)).join('')}</tbody></table></div>
        <div class="compteur">${nf.format(liste.length)} mouvement(s)${liste.length > 1000 ? ' · 1 000 premiers affichés' : ''}</div>` : '<div class="table-wrap"><p class="vide">Aucun mouvement sur cette période.</p></div>'}`;
  }

  async function choisirProduitAAjuster() {
    const { data, error } = await GP.sb.from('produits').select('id, designation, reference, quantite').order('designation').limit(5000);
    if (error) { toast(messageErreur(error), true); return; }
    ouvrirDialogue({
      titre: 'Ajuster un stock', ok: 'Continuer',
      corps: `<div class="large"><label for="aj-p">Produit *</label><input id="aj-p" name="produit" list="dl-aj-p" required autocomplete="off" placeholder="Tapez le nom du produit" data-focus>
        <datalist id="dl-aj-p">${data.map((p) => `<option value="${esc(p.designation)}${p.reference ? ` (${esc(p.reference)})` : ''}">stock : ${p.quantite}</option>`).join('')}</datalist></div>`,
      onOk: (f) => {
        const v = normaliser(f.produit.value);
        const p = data.find((x) => normaliser(`${x.designation}${x.reference ? ` (${x.reference})` : ''}`) === v) || data.find((x) => normaliser(x.designation) === v);
        if (!p) throw new Error('Choisissez un produit proposé dans la liste.');
        setTimeout(() => GP.ajusterStock(p), 0);
      },
    });
  }

  /* ------------------------------------------------------------------
   * Achats fournisseurs : bon de plusieurs produits, réception, paiement
   * ------------------------------------------------------------------ */
  GP.nouvelAchat = async () => {
    const [{ data: produits, error }, { data: fournisseurs }] = await Promise.all([
      GP.sb.from('produits').select('id, designation, reference, quantite, prix_achat, fournisseur_id').order('designation').limit(5000),
      GP.sb.from('fournisseurs').select('id, nom').order('nom'),
    ]);
    if (error) { toast(messageErreur(error), true); return; }
    const nom = (p) => `${p.designation}${p.reference ? ` (${p.reference})` : ''}`;
    const ligne = () => `<div class="ligne-edition" data-ligne>
        <label>Produit<input name="produit" list="dl-achat-p" required autocomplete="off" placeholder="Nom du produit"></label>
        <label>Quantité<input name="quantite" type="number" min="1" step="1" inputmode="numeric" required></label>
        <label>Prix d’achat unitaire<input name="prix" type="number" min="0" step="any" inputmode="decimal" required></label>
        <button type="button" class="btn-icone danger" data-retirer aria-label="Retirer la ligne" title="Retirer">${icone('corbeille')}</button>
      </div>`;
    ouvrirDialogue({
      titre: 'Nouvel achat fournisseur', large: true, ok: 'Enregistrer l’achat',
      corps: `
        <div><label for="a-f">Fournisseur</label><select id="a-f" name="fournisseur"><option value="">— Aucun —</option>${(fournisseurs || []).map((f) => `<option value="${f.id}">${esc(f.nom)}</option>`).join('')}</select></div>
        <div><label for="a-date">Date</label><input id="a-date" name="date" type="date" value="${aujourdhui()}" required></div>
        <div><label for="a-ref">N° du bon / de la facture</label><input id="a-ref" name="reference" maxlength="40" placeholder="Créé automatiquement si vide"></div>
        <div><label for="a-recu">Marchandise</label><select id="a-recu" name="recu"><option value="true">Reçue : le stock augmente maintenant</option><option value="false">Commandée : en attente de livraison</option></select></div>
        <div class="large"><datalist id="dl-achat-p">${produits.map((p) => `<option value="${esc(nom(p))}">stock : ${p.quantite}</option>`).join('')}</datalist>
          <div class="lignes-edition" id="lignes-achat">${ligne()}</div><br>
          <button type="button" class="btn" id="btn-ajout-ligne">${icone('plus')} Ajouter un produit</button>
          <p class="total-ligne"><span>Total de l’achat</span><span id="a-total">${fcfa(0)}</span></p></div>
        <div><label for="a-paye">Montant payé maintenant</label><input id="a-paye" name="paye" type="number" min="0" step="any" inputmode="decimal" value="0"><p class="note" id="a-reste"></p></div>
        <div><label for="a-notes">Notes</label><input id="a-notes" name="notes" maxlength="300"></div>
        <p class="note large">Les produits doivent exister dans « Produits et stock ». Le prix d’achat moyen de chaque produit est recalculé à la réception.</p>`,
      apres: (form) => {
        const zone = $('#lignes-achat');
        const totalAchat = () => $$('[data-ligne]', zone).reduce((s, l) => s + (Number($('[name=quantite]', l).value) || 0) * (Number($('[name=prix]', l).value) || 0), 0);
        const maj = () => {
          const t = totalAchat();
          $('#a-total').textContent = fcfa(t);
          const paye = Number(form.paye.value) || 0;
          $('#a-reste').textContent = paye > t ? 'Le montant payé dépasse le total.' : `Reste à payer au fournisseur : ${fcfa(t - paye)}`;
        };
        const brancher = () => {
          $$('[data-retirer]', zone).forEach((b) => (b.onclick = () => { if ($$('[data-ligne]', zone).length > 1) b.closest('[data-ligne]').remove(); maj(); }));
          $$('[data-ligne]', zone).forEach((l) => {
            $('[name=produit]', l).onchange = () => {
              const p = produits.find((x) => normaliser(nom(x)) === normaliser($('[name=produit]', l).value));
              if (p && !$('[name=prix]', l).value && Number(p.prix_achat)) $('[name=prix]', l).value = p.prix_achat;
              if (p && !form.fournisseur.value && p.fournisseur_id) form.fournisseur.value = p.fournisseur_id;
              maj();
            };
            $$('input', l).forEach((i) => i.addEventListener('input', maj));
          });
        };
        $('#btn-ajout-ligne').onclick = () => { zone.insertAdjacentHTML('beforeend', ligne()); brancher(); $('[data-ligne]:last-child input', zone).focus(); };
        form.paye.oninput = maj;
        brancher(); maj();
      },
      onOk: async (form) => {
        const lignes = $$('#lignes-achat [data-ligne]').map((l, i) => {
          const texte = $('[name=produit]', l).value.trim();
          const p = produits.find((x) => normaliser(nom(x)) === normaliser(texte)) || produits.find((x) => normaliser(x.designation) === normaliser(texte));
          if (!p) throw new Error(`Ligne ${i + 1} : « ${texte} » n’est pas dans « Produits et stock ». Ajoutez-le d’abord.`);
          const q = Number($('[name=quantite]', l).value), px = Number($('[name=prix]', l).value);
          if (!(q >= 1)) throw new Error(`Ligne ${i + 1} : quantité invalide.`);
          if (!(px >= 0) || $('[name=prix]', l).value === '') throw new Error(`Ligne ${i + 1} : indiquez le prix d’achat unitaire.`);
          return { produit_id: p.id, quantite: q, prix_unitaire: px };
        });
        const { data, error: e } = await GP.sb.rpc('enregistrer_achat', {
          p_fournisseur: form.fournisseur.value ? Number(form.fournisseur.value) : null, p_date: form.date.value, p_lignes: lignes,
          p_recu: form.recu.value === 'true', p_montant_paye: Number(form.paye.value) || 0, p_reference: form.reference.value.trim() || null, p_notes: form.notes.value.trim() || null,
        });
        if (e) throw e;
        toast(`Achat ${data.reference} enregistré · ${fcfa(data.total)}${form.recu.value === 'true' ? ' · stock mis à jour' : ''}`, 'ok');
        recharger();
      },
    });
  };

  GP.receptionner = async (r) => {
    if (!confirm(`Marquer comme reçu : ${r.quantite} × ${r.r_produit_id?.designation || 'produit'} ? Le stock augmentera de ${r.quantite} et le prix d’achat moyen sera recalculé.`)) return;
    const { error } = await GP.sb.from('commandes').update({ statut: 'reçue' }).eq('id', r.id);
    if (error) { toast(messageErreur(error), true); return; }
    toast('Réception enregistrée · stock mis à jour', 'ok');
    recharger();
  };

  GP.payerAchat = (r) => {
    const reste = Number(r.montant) - Number(r.montant_paye || 0);
    ouvrirDialogue({
      titre: `Paiement au fournisseur · achat n°${r.id}`, ok: 'Enregistrer le paiement',
      corps: `<p class="encart large">${esc(r.r_produit_id?.designation || '')} · montant ${fcfa(r.montant)} · déjà payé ${fcfa(r.montant_paye)} · <strong>reste ${fcfa(reste)}</strong></p>
        <div class="large"><label for="pa-m">Montant payé maintenant *</label><input id="pa-m" name="montant" type="number" min="1" max="${reste}" step="any" value="${reste}" required data-focus></div>`,
      onOk: async (f) => {
        const m = Number(f.montant.value);
        if (!(m > 0) || m > reste + 0.001) throw new Error(`Le montant doit être compris entre 1 et ${fcfa(reste)}.`);
        const { error } = await GP.sb.from('commandes').update({ montant_paye: Math.round((Number(r.montant_paye || 0) + m) * 100) / 100 }).eq('id', r.id);
        if (error) throw error;
        toast(`Paiement de ${fcfa(m)} enregistré`, 'ok');
        recharger();
      },
    });
  };
})();
