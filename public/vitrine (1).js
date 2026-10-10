/* Le Paradis des Bavins – vitrine publique
 * Toutes les informations modifiables sont regroupées ici. */
const VITRINE = {
  telephone: "+2250101920057",        // pour les appels (format international)
  telephoneAffiche: "01 01 92 00 57",
  whatsapp: "2250101920057",          // numéro WhatsApp sans + ni espaces
  email: "bchrisyvannathan@gmail.com",
  quartier: "Maroc Anador",
  // Lien Google Maps de la cave (ouvrez Google Maps, « Partager », copiez le lien)
  lienCarte: "https://www.google.com/maps/search/?api=1&query=Maroc+Anador",
  // Horaires : laissez vide pour ne pas les afficher. Ex. : ["Lun – Sam : 9 h – 22 h", "Dim : 10 h – 20 h"]
  horaires: [],

  // La carte des produits (catégories et exemples)
  carte: [
    { nom: "Champagnes", exemples: "Moët & Chandon Impérial, Veuve Clicquot Brut", nomEn: "Champagne", exemplesEn: "Moët & Chandon Impérial, Veuve Clicquot Brut" },
    { nom: "Vins", exemples: "Rouges, blancs et rosés", nomEn: "Wine", exemplesEn: "Red, white and rosé" },
    { nom: "Spiritueux", exemples: "Hennessy V.S.O.P, Johnnie Walker Black Label, Jack Daniel's", nomEn: "Spirits", exemplesEn: "Hennessy V.S.O.P, Johnnie Walker Black Label, Jack Daniel's" },
    { nom: "Liqueurs", exemples: "Baileys et autres crèmes et liqueurs", nomEn: "Liqueurs", exemplesEn: "Baileys and other cream liqueurs" },
    { nom: "Bières", exemples: "Heineken, Desperados, Corona Extra", nomEn: "Beer", exemplesEn: "Heineken, Desperados, Corona Extra" },
    { nom: "Alcools", exemples: "Smirnoff, Cîroc", nomEn: "Vodka and more", exemplesEn: "Smirnoff, Cîroc" },
    { nom: "Épicerie fine", exemples: "Produits sélectionnés pour vos repas et apéritifs", nomEn: "Fine foods", exemplesEn: "Selected products for meals and aperitifs" },
    { nom: "Confiseries", exemples: "Haribo, Ferrero Rocher", nomEn: "Sweets", exemplesEn: "Haribo, Ferrero Rocher" },
    { nom: "Snacks et boissons", exemples: "Lay's, Pringles, Red Bull, Monster", nomEn: "Snacks and soft drinks", exemplesEn: "Lay's, Pringles, Red Bull, Monster" },
    { nom: "Cadeaux", exemples: "Coffrets composés selon votre budget", nomEn: "Gifts", exemplesEn: "Gift boxes made to fit your budget" },
  ],
};

(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const lienWa = (texte) => `https://wa.me/${VITRINE.whatsapp}?text=${encodeURIComponent(texte)}`;

  /* ---------------- Français / English ---------------- */
  // Chaque texte français de la page et sa traduction anglaise.
  const EN = {
    // Navigation et pied de page
    'Aller au contenu': 'Skip to content', 'Menu': 'Menu', 'Accueil': 'Home', 'Services': 'Services', 'Produits': 'Products',
    'Contact': 'Contact', 'Commander': 'Order', 'Espace gestion': 'Staff area', 'Navigation principale': 'Main navigation', 'Pages du site': 'Site pages',
    "L'abus d'alcool est dangereux pour la santé, à consommer avec modération. Vente d'alcool interdite aux mineurs.":
      'Alcohol abuse is dangerous for your health; please drink responsibly. No alcohol sales to minors.',
    // Accueil
    'Cave, boissons et épicerie fine à': 'Wine cellar, drinks and fine foods in',
    'La qualité au rendez-vous !': 'Quality, every time!',
    'Champagnes, vins, spiritueux, bières, confiseries et snacks : passez à la cave ou envoyez-nous votre liste, on prépare votre commande.':
      'Champagne, wine, spirits, beer, sweets and snacks: visit the shop or send us your list and we will get your order ready.',
    'Commander sur WhatsApp': 'Order on WhatsApp', 'Appeler la cave': 'Call the shop',
    'La cave en 10 secondes': 'The shop in 10 seconds', "Revoir l'animation": 'Watch again',
    'Que cherchez-vous ?': 'What are you looking for?',
    'La carte': 'Our range', 'Nos services': 'Our services', 'Nous trouver': 'Find us',
    'Champagnes, vins, spiritueux, bières, confiseries, snacks et cadeaux.': 'Champagne, wine, spirits, beer, sweets, snacks and gifts.',
    'Vente sur place, commande sur WhatsApp, coffrets cadeaux, événements.': 'In-store sales, WhatsApp orders, gift boxes, events.',
    'À': 'In', '. Appelez-nous ou écrivez-nous sur WhatsApp.': '. Call us or message us on WhatsApp.',
    'Voir les produits': 'See products', 'Voir les services': 'See services', 'Voir le contact': 'Contact us',
    'Sélection de la cave : champagnes, cognac, whiskies, vodkas, bières, confiseries et snacks':
      'Our selection: champagne, cognac, whisky, vodka, beer, sweets and snacks',
    'Animation : le logo du Paradis des Bavins, nos champagnes, vins, spiritueux, bières, confiseries et snacks, puis notre numéro 01 01 92 00 57 à Maroc Anador.':
      'Animation: the Le Paradis des Bavins logo, our champagne, wine, spirits, beer, sweets and snacks, then our number 01 01 92 00 57 in Maroc Anador.',
    // Services
    'Une cave de quartier, avec le choix d\'une grande enseigne.': 'A neighbourhood shop with the choice of a big store.',
    'Vente sur place': 'In-store sales',
    'Venez choisir en boutique, conseils compris : pour un repas, une soirée ou un cadeau.': 'Come and choose in the shop, with advice included: for a meal, a party or a gift.',
    'Commande sur WhatsApp': 'Order on WhatsApp',
    'Envoyez votre liste, on vous confirme les prix et la disponibilité, puis on prépare tout.': 'Send us your list, we confirm prices and availability, then we get everything ready.',
    'Coffrets cadeaux': 'Gift boxes',
    'Champagne, spiritueux, chocolats : un coffret composé selon votre budget.': 'Champagne, spirits, chocolates: a gift box made to fit your budget.',
    'Fêtes et événements': 'Parties and events',
    'Mariages, anniversaires, baptêmes : demandez-nous un devis pour les quantités.': 'Weddings, birthdays, christenings: ask us for a quote for larger quantities.',
    'Un projet de fête, un cadeau à composer ?': 'Planning a party or a gift?',
    'Demander un devis sur WhatsApp': 'Ask for a quote on WhatsApp',
    // Produits
    'Touchez une ligne pour nous demander les prix et la disponibilité sur WhatsApp.': 'Tap a line to ask us for prices and availability on WhatsApp.',
    'Affiche du Paradis des Bavins : champagnes, vins, spiritueux, liqueurs, bières, épicerie fine, confiseries, snacks et cadeaux':
      'Le Paradis des Bavins poster: champagne, wine, spirits, liqueurs, beer, fine foods, sweets, snacks and gifts',
    // Contact
    'Nous contacter': 'Contact us', 'Une question, une commande, un devis ? Écrivez-nous ou passez nous voir.': 'A question, an order, a quote? Message us or drop by.',
    'Téléphone': 'Phone', 'WhatsApp': 'WhatsApp', 'Écrire sur WhatsApp': 'Message us on WhatsApp', 'E-mail': 'Email',
    'Adresse': 'Address', 'Voir sur la carte': 'View on the map', 'Horaires': 'Opening hours',
    'Préparer ma commande': 'Prepare my order', "Votre message s'ouvre dans WhatsApp, prêt à envoyer.": 'Your message opens in WhatsApp, ready to send.',
    'Votre nom': 'Your name', 'Votre commande ou votre question': 'Your order or question',
    'Ex. : 2 Moët & Chandon, 1 coffret cadeau, livraison samedi': 'E.g. 2 Moët & Chandon, 1 gift box, delivery on Saturday',
    'Envoyer sur WhatsApp': 'Send on WhatsApp',
    // Titres d'onglet et descriptions
    'Le Paradis des Bavins – Cave, boissons et épicerie fine': 'Le Paradis des Bavins – Wine cellar, drinks and fine foods',
    'Nos services – Le Paradis des Bavins': 'Our services – Le Paradis des Bavins',
    'Nos produits – Le Paradis des Bavins': 'Our products – Le Paradis des Bavins',
    'Contact – Le Paradis des Bavins': 'Contact – Le Paradis des Bavins',
    // Messages WhatsApp préparés
    'Bonjour, je voudrais passer une commande.': 'Hello, I would like to place an order.',
    'Bonjour, je voudrais un devis.': 'Hello, I would like a quote.',
    'Bonjour !': 'Hello!',
  };
  const ATTRIBUTS = ['placeholder', 'aria-label', 'alt', 'title'];
  const originaux = new Map();   // nœud ou attribut → texte français d'origine
  const titreFr = document.title;
  const metaDesc = document.querySelector('meta[name="description"]');
  const descFr = metaDesc ? metaDesc.content : '';
  const DESC_EN = {
    'index': 'Wine cellar, drinks and fine foods in Maroc Anador: champagne, wine, spirits, beer, sweets, snacks and gift boxes. Order on WhatsApp.',
    'services': 'In-store sales, WhatsApp orders, gift boxes, parties and events.',
    'produits': 'Champagne, wine, spirits, liqueurs, beer, fine foods, sweets, snacks and gifts.',
    'contact': 'Phone, WhatsApp, email and address of Le Paradis des Bavins in Maroc Anador.',
  };
  let langue = 'fr';
  let auChangementDeLangue = () => {};

  function traduire(fr) { return langue === 'en' && EN[fr.trim()] ? fr.replace(fr.trim(), EN[fr.trim()]) : fr; }

  function appliquerLangue(l) {
    langue = l;
    document.documentElement.lang = l;
    // Textes
    const marche = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && !n.parentElement.closest('script, style, [data-info], .langue-btn') && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    for (let n = marche.nextNode(); n; n = marche.nextNode()) {
      if (!originaux.has(n)) originaux.set(n, n.nodeValue);
      n.nodeValue = traduire(originaux.get(n));
    }
    // Attributs (textes d'aide, descriptions d'images)
    $$('[placeholder], [aria-label], [alt], [title]').forEach((el) => {
      if (el.closest('.langue-btn, #carte-liste')) return;
      ATTRIBUTS.forEach((at) => {
        if (!el.hasAttribute(at)) return;
        const cle = `${at}`;
        el.__fr = el.__fr || {};
        if (!(cle in el.__fr)) el.__fr[cle] = el.getAttribute(at);
        el.setAttribute(at, traduire(el.__fr[cle]));
      });
    });
    // Liens WhatsApp préparés
    $$('[data-wa]').forEach((a) => { a.href = lienWa(traduire(a.dataset.wa)); });
    // Titre de l'onglet et description
    document.title = traduire(titreFr);
    const page = (document.body.className.match(/page-(\w+)/) || [])[1];
    if (metaDesc) metaDesc.content = l === 'en' && DESC_EN[page] ? DESC_EN[page] : descFr;
    // Bouton : propose l'autre langue
    const b = $('.langue-btn');
    if (b) {
      b.textContent = l === 'en' ? 'FR' : 'EN';
      b.lang = l === 'en' ? 'fr' : 'en';
      b.setAttribute('aria-label', l === 'en' ? 'Passer en français' : 'Switch to English');
    }
    remplirCarte();
    auChangementDeLangue(l);
  }

  function langueDeDepart() {
    const p = new URLSearchParams(location.search).get('lang');
    if (p === 'en' || p === 'fr') return p;
    try { const m = localStorage.getItem('langue'); if (m === 'en' || m === 'fr') return m; } catch { /* stockage indisponible */ }
    return (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'fr';
  }

  // Coordonnées
  $$('[data-info]').forEach((el) => { const v = VITRINE[el.dataset.info]; if (v) el.textContent = v; });
  $$('[data-tel]').forEach((a) => { a.href = `tel:${VITRINE.telephone}`; });
  $$('[data-mail]').forEach((a) => { a.href = `mailto:${VITRINE.email}`; });
  $$('[data-carte]').forEach((a) => { a.href = VITRINE.lienCarte; });
  $$('[data-wa]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener';
  });
  if (VITRINE.horaires.length && $('#horaires')) {
    const dd = $('#horaires');
    VITRINE.horaires.forEach((h, i) => { if (i) dd.append(document.createElement('br')); dd.append(h); });
    $('#bloc-horaires').hidden = false;
  }

  // La carte
  const liste = $('#carte-liste');
  if (liste) VITRINE.carte.forEach(() => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = '<span class="carte-nom"></span><span class="carte-points" aria-hidden="true"></span><span class="carte-action"></span><span class="carte-ex"></span>';
    li.append(a);
    liste.append(li);
  });
  function remplirCarte() {
    if (!liste) return;
    const en = langue === 'en';
    VITRINE.carte.forEach((c, i) => {
      const a = liste.children[i].firstElementChild;
      const nom = en ? c.nomEn || c.nom : c.nom;
      const exemples = en ? c.exemplesEn || c.exemples : c.exemples;
      a.href = lienWa(en ? `Hello, I would like your prices and availability for: ${nom}.` : `Bonjour, je voudrais connaître vos prix et disponibilités pour : ${nom}.`);
      a.querySelector('.carte-nom').textContent = nom;
      a.querySelector('.carte-ex').textContent = exemples;
      a.querySelector('.carte-action').textContent = en ? 'Ask' : 'Demander';
      a.setAttribute('aria-label', en ? `${nom}: ${exemples}. Ask for prices on WhatsApp` : `${nom} : ${exemples}. Demander les prix sur WhatsApp`);
    });
  }

  // Formulaire : ouvre WhatsApp avec le message prêt
  const form = $('#form-commande');
  if (form) form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const nom = f.nom.value.trim();
    const message = f.message.value.trim();
    const erreur = $('#c-erreur');
    if (!nom || !message) {
      erreur.textContent = langue === 'en' ? 'Enter your name and your order or question.' : 'Indiquez votre nom et votre commande ou votre question.';
      (nom ? f.message : f.nom).focus();
      return;
    }
    erreur.textContent = '';
    window.open(lienWa(langue === 'en' ? `Hello, my name is ${nom}.\n${message}` : `Bonjour, je suis ${nom}.\n${message}`), '_blank', 'noopener');
  });

  // Bouton FR / EN
  const btnLangue = $('.langue-btn');
  if (btnLangue) btnLangue.addEventListener('click', () => {
    const l = langue === 'en' ? 'fr' : 'en';
    try { localStorage.setItem('langue', l); } catch { /* stockage indisponible */ }
    appliquerLangue(l);
  });
  appliquerLangue(langueDeDepart());

  // Menu mobile
  const btn = $('.menu-btn');
  const nav = $('#nav');
  const fermer = () => { nav.classList.remove('ouvert'); btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => {
    const ouvert = nav.classList.toggle('ouvert');
    btn.setAttribute('aria-expanded', String(ouvert));
  });
  $$('a', nav).forEach((a) => a.addEventListener('click', fermer));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermer(); });

  $('#annee').textContent = new Date().getFullYear();

  /* ---------------- Animations ---------------- */
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add(reduit ? 'mouvement-reduit' : 'anime');

  // En-tête qui se détache du contenu au défilement
  const entete = $('.entete');
  const surDefilement = () => entete.classList.toggle('decolle', scrollY > 8);
  addEventListener('scroll', surDefilement, { passive: true });
  surDefilement();

  // Apparitions au défilement (une seule fois par élément)
  $$('[data-cascade]').forEach((liste) => {
    [...liste.children].forEach((el, i) => { el.dataset.apparition = ''; el.style.setProperty('--rang', i); });
  });
  const aMontrer = $$('[data-apparition]');
  if (reduit || !('IntersectionObserver' in window)) {
    aMontrer.forEach((el) => el.classList.add('visible'));
  } else {
    const obs = new IntersectionObserver((entrees) => {
      entrees.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    aMontrer.forEach((el) => obs.observe(el));
  }

  // Bulles de champagne derrière le titre de l'accueil
  const toileBulles = $('.hero .bulles');
  if (toileBulles && !reduit) {
    const ctx = toileBulles.getContext('2d');
    const bulles = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), v: 0.012 + Math.random() * 0.03, r: 0.8 + Math.random() * 2.4, a: 0.15 + Math.random() * 0.4, o: Math.random() * 6.28 }));
    let visible = true, dernier = performance.now();
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(toileBulles);
    const dessiner = (now) => {
      const dt = Math.min(0.05, (now - dernier) / 1000); dernier = now;
      if (visible && !document.hidden) {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        const w = toileBulles.clientWidth * dpr, h = toileBulles.clientHeight * dpr;
        if (toileBulles.width !== w || toileBulles.height !== h) { toileBulles.width = w; toileBulles.height = h; }
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#f0d48a';
        for (const b of bulles) {
          b.y -= b.v * dt; if (b.y < -0.05) { b.y = 1.05; b.x = Math.random(); }
          ctx.globalAlpha = b.a * (0.6 + 0.4 * Math.sin(now / 600 + b.o));
          ctx.beginPath(); ctx.arc(b.x * w + Math.sin(now / 900 + b.o) * 6 * dpr, b.y * h, b.r * dpr, 0, 6.283); ctx.fill();
        }
      }
      requestAnimationFrame(dessiner);
    };
    requestAnimationFrame(dessiner);
  }

  // Motion de 10 s sur l'accueil : démarre quand il devient visible
  const toileMotion = $('#motion-accueil');
  if (toileMotion && window.MotionBavins) {
    const rejouer = $('.motion-rejouer');
    const m = window.MotionBavins.creer(toileMotion, { langue, fin: () => { rejouer.hidden = false; } });
    auChangementDeLangue = (l) => m.langue(l);
    let lance = false;
    const lancer = () => { rejouer.hidden = true; m.lire(); };
    rejouer.addEventListener('click', lancer);
    if (reduit) { rejouer.hidden = true; }
    else if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { if (e.isIntersecting && !lance) { lance = true; lancer(); } }, { threshold: 0.45 }).observe(toileMotion);
    } else lancer();
    addEventListener('resize', () => m.dessiner(m.duree));
  }
})();
