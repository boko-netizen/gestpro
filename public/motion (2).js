/* Le Paradis des Bavins – motion de 10 secondes (canvas)
 * Utilisé par : l'annonce de l'espace gestion, l'accueil du site client
 * et l'export vidéo. L'image affichée dépend uniquement du temps t
 * (rendu identique à chaque lecture, ce qui permet l'export image par image).
 *
 *   const m = MotionBavins.creer(canvas, { boucle: true });
 *   await m.pret;  m.lire();  m.arreter();  m.dessiner(t);
 */
(() => {
  'use strict';

  const DUREE = 10;
  const INFOS = {
    nom: 'Le paradis des bavins',
    sousTitre: 'Cave • Boissons • Épicerie fine',
    devise: 'La qualité au rendez-vous !',
    categories: ['Champagnes', 'Vins', 'Spiritueux', 'Liqueurs', 'Bières', 'Confiseries', 'Snacks', 'Cadeaux'],
    accroche: ['Des boissons d’exception', 'et bien plus encore !'],
    fin: 'Votre cave, votre plaisir !',
    telephone: '01 01 92 00 57',
    quartier: 'Maroc Anador',
    commande: 'Commandez sur WhatsApp',
  };
  const INFOS_EN = {
    ...INFOS,
    sousTitre: 'Cellar • Drinks • Fine foods',
    devise: 'Quality, every time!',
    categories: ['Champagne', 'Wine', 'Spirits', 'Liqueurs', 'Beer', 'Sweets', 'Snacks', 'Gifts'],
    accroche: ['Exceptional drinks', 'and so much more!'],
    fin: 'Your cellar, your pleasure!',
    commande: 'Order on WhatsApp',
  };
  const OR = '#d4a646', OR_CLAIR = '#f0d48a', CREME = '#f3ead8', NUIT = '#140e09';
  const SERIF = 'Cormorant, "Cormorant Garamond", Georgia, serif';
  const SANS = 'Figtree, system-ui, sans-serif';

  // ---------- outils ----------
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const prog = (t, debut, fin) => clamp((t - debut) / (fin - debut));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const easeBack = (x) => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  // apparition puis disparition : 0 → 1 → 0
  const fenetre = (t, a, b, c, d) => Math.min(easeOut(prog(t, a, b)), 1 - easeInOut(prog(t, c, d)));

  // générateur pseudo-aléatoire fixe (les bulles sont identiques à chaque lecture)
  function aleatoire(graine) {
    let s = graine >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  const R = aleatoire(20261010);
  const BULLES = Array.from({ length: 70 }, () => ({ x: R(), v: 0.05 + R() * 0.12, r: 0.6 + R() * 2.6, phase: R(), oscille: R() * 6.28, a: 0.15 + R() * 0.45 }));

  function chargerImage(src) {
    return new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
  }
  async function chargerPolices(base) {
    if (!('FontFace' in window)) return;
    const polices = [
      ['Cormorant', 'cormorant-garamond-latin-700-normal.woff2', { weight: '700' }],
      ['Cormorant', 'cormorant-garamond-latin-600-italic.woff2', { weight: '600', style: 'italic' }],
      ['Figtree', 'figtree-latin-600-normal.woff2', { weight: '600' }],
    ];
    await Promise.all(polices.map(async ([nom, fichier, opts]) => {
      try { const f = new FontFace(nom, `url(${base}fonts/${fichier})`, opts); await f.load(); document.fonts.add(f); } catch { /* police système à défaut */ }
    }));
  }

  // ---------- dessin ----------
  function texte(ctx, chaine, x, y, { taille, police = SERIF, poids = 700, style = '', couleur = CREME, alpha = 1, align = 'center', espacement = 0, ombre = 0 }) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = `${style} ${poids} ${taille}px ${police}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${espacement}px`;
    if (ombre) { ctx.shadowColor = 'rgba(212,166,70,.55)'; ctx.shadowBlur = ombre; }
    ctx.fillStyle = couleur;
    ctx.fillText(chaine, x, y);
    ctx.restore();
  }

  // texte qui tient dans une largeur donnée
  function tailleMax(ctx, chaine, taille, largeur, police = SERIF, poids = 700, style = '') {
    ctx.font = `${style} ${poids} ${taille}px ${police}`;
    const l = ctx.measureText(chaine).width;
    return l > largeur ? taille * (largeur / l) : taille;
  }

  function fond(ctx, W, H, t) {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.38, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#3a2412');
    g.addColorStop(0.45, '#1d130b');
    g.addColorStop(1, '#0a0705');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // halo doré qui respire
    const h = 0.10 + 0.05 * Math.sin(t * 1.4);
    const g2 = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, Math.min(W, H) * 0.6);
    g2.addColorStop(0, `rgba(240,212,138,${h})`);
    g2.addColorStop(1, 'rgba(240,212,138,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
  }

  function bulles(ctx, W, H, t, u) {
    ctx.save();
    for (const b of BULLES) {
      const y = H * (1.05 - ((b.phase + t * b.v) % 1.1));
      const x = W * b.x + Math.sin(t * 1.3 + b.oscille) * 10 * u;
      ctx.globalAlpha = b.a * (0.5 + 0.5 * Math.sin(t * 2 + b.oscille));
      ctx.beginPath();
      ctx.arc(x, y, b.r * u * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = OR_CLAIR;
      ctx.fill();
    }
    ctx.restore();
  }

  function logo(ctx, img, cx, cy, rayon, alpha, eclat = 0) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (eclat > 0) {
      const g = ctx.createRadialGradient(cx, cy, rayon * 0.9, cx, cy, rayon * 1.6);
      g.addColorStop(0, `rgba(240,212,138,${0.35 * eclat})`);
      g.addColorStop(1, 'rgba(240,212,138,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - rayon * 2, cy - rayon * 2, rayon * 4, rayon * 4);
    }
    ctx.beginPath();
    ctx.arc(cx, cy, rayon, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, cx - rayon * 1.03, cy - rayon * 1.03, rayon * 2.06, rayon * 2.06);
    ctx.restore();
    // anneau doré
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = OR;
    ctx.lineWidth = Math.max(2, rayon * 0.025);
    ctx.beginPath();
    ctx.arc(cx, cy, rayon, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // reflet doré qui balaie une zone (effet « lumière sur le verre »)
  function balayage(ctx, x, y, w, h, p) {
    if (p <= 0 || p >= 1) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const pos = x - w * 0.3 + (w * 1.6) * p;
    const g = ctx.createLinearGradient(pos - w * 0.12, y, pos + w * 0.12, y + h * 0.3);
    g.addColorStop(0, 'rgba(255,240,200,0)');
    g.addColorStop(0.5, 'rgba(255,240,200,.35)');
    g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  function filet(ctx, cx, y, largeur, p, u) {
    if (p <= 0) return;
    const l = largeur * easeInOut(p);
    const g = ctx.createLinearGradient(cx - l / 2, y, cx + l / 2, y);
    g.addColorStop(0, 'rgba(212,166,70,0)');
    g.addColorStop(0.5, OR);
    g.addColorStop(1, 'rgba(212,166,70,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - l / 2, y - 1.5 * u, l, 3 * u);
  }

  function icTelephone(ctx, x, y, s, couleur) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(s / 24, s / 24); ctx.translate(-12, -12);
    ctx.fillStyle = couleur;
    ctx.fill(new Path2D('M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z'));
    ctx.restore();
  }

  // ---------- la scène complète à l'instant t ----------
  function scene(ctx, W, H, t, A) {
    const I = A.infos || INFOS;
    const u = Math.min(W, H) / 1080;              // unité de base
    const portrait = H > W * 1.15;
    const cx = W / 2;
    ctx.clearRect(0, 0, W, H);
    fond(ctx, W, H, t);
    bulles(ctx, W, H, t, u);

    // --- 1. Logo, nom, devise (0 → 3,2 s)
    const sortieA = easeInOut(prog(t, 2.7, 3.2));
    const pLogo = prog(t, 0.2, 1.3);
    const rLogo = (portrait ? 250 : 210) * u * (0.55 + 0.45 * easeBack(pLogo));
    const yLogo = H * (portrait ? 0.37 : 0.34) - sortieA * 80 * u;
    logo(ctx, A.logo, cx, yLogo, rLogo, easeOut(pLogo) * (1 - sortieA), 0.6 + 0.4 * Math.sin(t * 3));
    const yNom = yLogo + rLogo + (portrait ? 120 : 95) * u;
    const pNom = easeOut(prog(t, 1.1, 1.9));
    const tNom = tailleMax(ctx, I.nom, (portrait ? 118 : 104) * u, W * 0.88);
    texte(ctx, I.nom, cx, yNom + (1 - pNom) * 40 * u, { taille: tNom, couleur: OR, alpha: pNom * (1 - sortieA), ombre: 18 * u });
    filet(ctx, cx, yNom + 78 * u, 520 * u, prog(t, 1.5, 2.3) * (1 - sortieA), u);
    const pSous = easeOut(prog(t, 1.8, 2.4));
    texte(ctx, I.sousTitre.toUpperCase(), cx, yNom + 132 * u, { taille: 34 * u, police: SANS, poids: 600, couleur: CREME, alpha: pSous * (1 - sortieA), espacement: 5 * u });

    // --- 2. Bouteilles en travelling + catégories (3,0 → 8,2 s)
    const pB = prog(t, 3.0, 3.8);
    const aB = easeOut(pB) * (1 - 0.72 * easeInOut(prog(t, 6.3, 6.9))) * (1 - easeInOut(prog(t, 7.9, 8.3)));
    if (aB > 0.001) {
      const img = A.bouteilles;
      const bandeH = portrait ? H * 0.42 : H * 0.68;
      const bandeY = portrait ? H * 0.17 : H * 0.08;
      const zoom = 1.04 + 0.08 * prog(t, 3.0, 8.3);
      const echelle = Math.max(W / img.width, bandeH / img.height) * zoom;
      const iw = img.width * echelle, ih = img.height * echelle;
      const course = Math.max(0, iw - W);
      const ix = -course * easeInOut(prog(t, 3.0, 8.0));
      const iy = bandeY + (bandeH - ih) / 2 + (1 - easeOut(pB)) * 120 * u;
      // la bande est dessinée à part puis fondue en transparence en haut et en bas
      const bh = Math.ceil(bandeH);
      if (!A.toile || A.toile.width !== W || A.toile.height !== bh) {
        A.toile = document.createElement('canvas'); A.toile.width = W; A.toile.height = bh;
      }
      const o = A.toile.getContext('2d');
      o.globalCompositeOperation = 'source-over';
      o.clearRect(0, 0, W, bh);
      o.drawImage(img, ix, iy - bandeY, iw, ih);
      o.globalCompositeOperation = 'destination-in';
      const gM = o.createLinearGradient(0, 0, 0, bh);
      gM.addColorStop(0, 'rgba(0,0,0,0)'); gM.addColorStop(0.32, 'rgba(0,0,0,1)');
      gM.addColorStop(0.74, 'rgba(0,0,0,1)'); gM.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = gM; o.fillRect(0, 0, W, bh);
      const gL = o.createLinearGradient(0, 0, W, 0);
      gL.addColorStop(0, 'rgba(0,0,0,.55)'); gL.addColorStop(0.08, 'rgba(0,0,0,1)');
      gL.addColorStop(0.92, 'rgba(0,0,0,1)'); gL.addColorStop(1, 'rgba(0,0,0,.55)');
      o.fillStyle = gL; o.fillRect(0, 0, W, bh);
      ctx.save();
      ctx.globalAlpha = aB;
      ctx.drawImage(A.toile, 0, bandeY);
      ctx.restore();
      balayage(ctx, 0, bandeY, W, bandeH, prog(t, 3.6, 5.0));
    }
    // catégories une par une
    const debutCat = 3.6, pasCat = 0.34;
    const yCat = portrait ? H * 0.70 : H * 0.84;
    I.categories.forEach((nom, i) => {
      const d = debutCat + i * pasCat;
      const a = fenetre(t, d, d + 0.1, d + pasCat - 0.08, d + pasCat);
      if (a <= 0.001) return;
      const dy = (1 - easeOut(prog(t, d, d + 0.2))) * 34 * u - easeInOut(prog(t, d + pasCat - 0.08, d + pasCat)) * 26 * u;
      texte(ctx, nom, cx, yCat + dy, { taille: (portrait ? 150 : 120) * u, couleur: OR_CLAIR, alpha: a, ombre: 24 * u });
    });
    // compteur de catégories (petits points)
    const aPoints = fenetre(t, 3.6, 3.9, 6.3, 6.6);
    if (aPoints > 0) {
      const n = I.categories.length, ecart = 26 * u;
      const actif = clamp(Math.floor((t - debutCat) / pasCat), 0, n - 1);
      for (let i = 0; i < n; i++) {
        ctx.save(); ctx.globalAlpha = aPoints * (i === actif ? 1 : 0.35);
        ctx.fillStyle = OR; ctx.beginPath();
        ctx.arc(cx + (i - (n - 1) / 2) * ecart, yCat + (portrait ? 120 : 92) * u, (i === actif ? 6 : 4) * u, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }

    // --- 3. Accroche (6,5 → 8,3 s)
    const yAcc = portrait ? H * 0.69 : H * 0.48;
    I.accroche.forEach((ligne, i) => {
      const d = 6.5 + i * 0.35;
      const a = fenetre(t, d, d + 0.45, 7.95, 8.3);
      const tl = tailleMax(ctx, ligne, (portrait ? 108 : 96) * u, W * 0.9, SERIF, 600, 'italic');
      texte(ctx, ligne, cx, yAcc + i * tl * 1.12 + (1 - easeOut(prog(t, d, d + 0.45))) * 36 * u,
        { taille: tl, poids: 600, style: 'italic', couleur: i ? OR_CLAIR : CREME, alpha: a, ombre: i ? 20 * u : 0 });
    });

    // --- 4. Carte de fin (8,2 → 10 s)
    const pF = prog(t, 8.2, 8.9);
    if (pF > 0) {
      const aF = easeOut(pF);
      const yL = H * (portrait ? 0.355 : 0.24);
      const rL = (portrait ? 200 : 120) * u * (0.8 + 0.2 * easeBack(pF));
      logo(ctx, A.logo, cx, yL, rL, aF, 0.8);
      const tFin = tailleMax(ctx, I.fin, (portrait ? 112 : 100) * u, W * 0.9, SERIF, 600, 'italic');
      const yFin = yL + rL + (portrait ? 120 : 80) * u;
      texte(ctx, I.fin, cx, yFin + (1 - aF) * 30 * u, { taille: tFin, poids: 600, style: 'italic', couleur: OR_CLAIR, alpha: aF, ombre: 22 * u });
      filet(ctx, cx, yFin + tFin * 0.75, 560 * u, prog(t, 8.5, 9.2), u);
      const aTel = easeOut(prog(t, 8.7, 9.3));
      const yTel = yFin + tFin * 0.75 + (portrait ? 120 : 92) * u;
      const tTel = (portrait ? 92 : 78) * u;
      ctx.font = `700 ${tTel}px ${SERIF}`;
      const lTel = ctx.measureText(I.telephone).width;
      ctx.save(); ctx.globalAlpha = aTel;
      icTelephone(ctx, cx - lTel / 2 - tTel * 0.55, yTel, tTel * 0.62, OR);
      ctx.restore();
      texte(ctx, I.telephone, cx + tTel * 0.3, yTel, { taille: tTel, couleur: CREME, alpha: aTel });
      const aBas = easeOut(prog(t, 9.0, 9.5));
      texte(ctx, `${I.quartier}  •  ${I.commande}`, cx, yTel + (portrait ? 96 : 76) * u, { taille: 36 * u, police: SANS, poids: 600, couleur: OR, alpha: aBas, espacement: 1.5 * u });
    }

    // cadre doré final
    const pC = easeInOut(prog(t, 8.3, 9.4));
    if (pC > 0) {
      const m = 36 * u;
      ctx.save(); ctx.strokeStyle = OR; ctx.globalAlpha = 0.8; ctx.lineWidth = 2 * u;
      const per = 2 * (W - 2 * m) + 2 * (H - 2 * m);
      ctx.setLineDash([per * pC, per]);
      ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
      ctx.restore();
    }

    // vignette
    const v = ctx.createRadialGradient(cx, H / 2, Math.min(W, H) * 0.45, cx, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    // fondu d'entrée
    const noir = 1 - easeOut(prog(t, 0, 0.35));
    if (noir > 0) { ctx.fillStyle = `rgba(10,7,5,${noir})`; ctx.fillRect(0, 0, W, H); }
  }

  // ---------- API ----------
  function creer(canvas, opts = {}) {
    const base = opts.base ?? '';
    const ctx = canvas.getContext('2d');
    let A = null, raf = 0, debut = 0, fixe = !!opts.taillesFixes;
    const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;

    function ajuster() {
      if (fixe) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    function dessiner(t) {
      if (!A) return;
      dernierT = t;
      ajuster();
      scene(ctx, canvas.width, canvas.height, clamp(t, 0, DUREE), A);
    }
    const pret = Promise.all([
      chargerImage(base + 'img/logo-pb.jpg'), chargerImage(base + 'img/bouteilles.jpg'), chargerPolices(base),
    ]).then(([l, b]) => { A = { logo: l, bouteilles: b, infos: opts.langue === 'en' ? INFOS_EN : INFOS }; dessiner(reduit && !opts.forcerAnimation ? DUREE - 0.3 : 0); });
    let dernierT = 0;

    function boucle(now) {
      let t = (now - debut) / 1000;
      if (t >= DUREE) {
        if (opts.boucle) { debut = now; t = 0; }
        else { dessiner(DUREE); if (opts.fin) opts.fin(); return; }
      }
      dessiner(t);
      raf = requestAnimationFrame(boucle);
    }
    return {
      pret,
      duree: DUREE,
      dessiner,
      lire() {
        cancelAnimationFrame(raf);
        if (reduit && !opts.forcerAnimation) { dessiner(DUREE - 0.3); return; }   // mouvement réduit : image fixe
        pret.then(() => { debut = performance.now(); raf = requestAnimationFrame(boucle); });
      },
      arreter() { cancelAnimationFrame(raf); },
      // change la langue des textes du motion ('fr' ou 'en')
      langue(l) {
        opts.langue = l;
        pret.then(() => { A.infos = l === 'en' ? INFOS_EN : INFOS; dessiner(dernierT); });
      },
    };
  }

  window.MotionBavins = { creer, DUREE };
})();
