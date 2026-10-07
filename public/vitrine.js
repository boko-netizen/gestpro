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
    { nom: "Champagnes", exemples: "Moët & Chandon Impérial, Veuve Clicquot Brut" },
    { nom: "Vins", exemples: "Rouges, blancs et rosés" },
    { nom: "Spiritueux", exemples: "Hennessy V.S.O.P, Johnnie Walker Black Label, Jack Daniel's" },
    { nom: "Liqueurs", exemples: "Baileys et autres crèmes et liqueurs" },
    { nom: "Bières", exemples: "Heineken, Desperados, Corona Extra" },
    { nom: "Alcools", exemples: "Smirnoff, Cîroc" },
    { nom: "Épicerie fine", exemples: "Produits sélectionnés pour vos repas et apéritifs" },
    { nom: "Confiseries", exemples: "Haribo, Ferrero Rocher" },
    { nom: "Snacks et boissons", exemples: "Lay's, Pringles, Red Bull, Monster" },
    { nom: "Cadeaux", exemples: "Coffrets composés selon votre budget" },
  ],
};

(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const lienWa = (texte) => `https://wa.me/${VITRINE.whatsapp}?text=${encodeURIComponent(texte)}`;

  // Coordonnées
  $$('[data-info]').forEach((el) => { const v = VITRINE[el.dataset.info]; if (v) el.textContent = v; });
  $$('[data-tel]').forEach((a) => { a.href = `tel:${VITRINE.telephone}`; });
  $$('[data-mail]').forEach((a) => { a.href = `mailto:${VITRINE.email}`; });
  $$('[data-carte]').forEach((a) => { a.href = VITRINE.lienCarte; });
  $$('[data-wa]').forEach((a) => {
    a.href = lienWa(a.dataset.wa);
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
  if (liste) VITRINE.carte.forEach(({ nom, exemples }) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = lienWa(`Bonjour, je voudrais connaître vos prix et disponibilités pour : ${nom}.`);
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = '<span class="carte-nom"></span><span class="carte-points" aria-hidden="true"></span><span class="carte-action">Demander</span><span class="carte-ex"></span>';
    a.querySelector('.carte-nom').textContent = nom;
    a.querySelector('.carte-ex').textContent = exemples;
    a.setAttribute('aria-label', `${nom} : ${exemples}. Demander les prix sur WhatsApp`);
    li.append(a);
    liste.append(li);
  });

  // Formulaire : ouvre WhatsApp avec le message prêt
  const form = $('#form-commande');
  if (form) form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const nom = f.nom.value.trim();
    const message = f.message.value.trim();
    const erreur = $('#c-erreur');
    if (!nom || !message) {
      erreur.textContent = 'Indiquez votre nom et votre commande ou votre question.';
      (nom ? f.message : f.nom).focus();
      return;
    }
    erreur.textContent = '';
    window.open(lienWa(`Bonjour, je suis ${nom}.\n${message}`), '_blank', 'noopener');
  });

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
})();
