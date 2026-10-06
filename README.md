# GestPro – Gestion commerciale (Supabase + Cloudflare + GitHub)

Application web de gestion : clients, ventes, commandes fournisseurs, dépenses,
livraisons, stock et fournisseurs, avec un compte administrateur qui génère les
comptes utilisateurs. Montants en FCFA.

| Rôle | Ce que fait le service |
|---|---|
| **GitHub** | Garde le code. Chaque envoi sur `main` déclenche la mise en ligne. |
| **Cloudflare Pages** | Héberge le site (dossier `public/`) en HTTPS, gratuitement. |
| **Supabase** | Base de données PostgreSQL, connexion des utilisateurs, règles d'accès, fonction de gestion des comptes. |

```
gestpro/
├── public/                     ← le site (publié par Cloudflare Pages)
│   ├── index.html, app.js, styles.css
│   ├── config.js               ← adresse et clé publique Supabase (à remplir)
│   ├── _headers                ← en-têtes de sécurité
│   └── vendor/supabase.js      ← client Supabase (servi localement)
├── supabase/
│   ├── migrations/…_gestpro.sql   ← tables, règles d'accès, stock automatique
│   ├── functions/admin-users/     ← création / suppression des comptes (côté serveur)
│   └── config.toml
└── .github/workflows/supabase.yml ← déploiement automatique vers Supabase
```

## Sécurité : ce qui est garanti côté serveur

- **Connexion** gérée par Supabase Auth (mots de passe hachés avec bcrypt, sessions à jetons signés).
- **Droits vérifiés par la base** (Row Level Security) : même en contournant l'interface,
  un lecteur ne peut rien modifier et un visiteur non connecté ne voit rien.
  - Administrateur : tout, plus la gestion des comptes
  - Gestionnaire : lecture et écriture des données
  - Lecteur : lecture seule
- **Comptes créés uniquement par l'administrateur**, via une fonction serveur qui détient la
  clé secrète (jamais envoyée au navigateur). Une inscription « sauvage » n'obtient aucun accès.
- Impossible de supprimer le dernier administrateur ou de s'attribuer soi-même un rôle.
- **Stock** : une vente baisse le stock et elle est refusée si le stock est insuffisant ; une
  commande passée au statut « reçue » augmente le stock. Tout se fait dans la base, dans la même
  transaction : deux ventes simultanées ne peuvent pas vendre le même article deux fois.
- Le stock ne peut jamais devenir négatif.
- En-têtes de sécurité (CSP stricte, HSTS, anti-iframe) appliqués par Cloudflare.

---

## Mise en ligne pas à pas (environ 30 minutes)

### 1. Créer le dépôt GitHub

1. Créez un compte sur <https://github.com> si nécessaire.
2. **New repository** → nom `gestpro` → **Private** → *Create repository*.
3. Cliquez sur **uploading an existing file**, glissez **tout le contenu** du dossier `gestpro`
   (y compris le dossier `.github` ; sous Windows/Mac, affichez les fichiers cachés), puis
   *Commit changes*.

   Ou en ligne de commande :
   ```bash
   cd gestpro
   git init && git add . && git commit -m "GestPro"
   git branch -M main
   git remote add origin https://github.com/VOTRE-COMPTE/gestpro.git
   git push -u origin main
   ```

### 2. Créer le projet Supabase

1. Sur <https://supabase.com>, **New project**. Notez bien le **mot de passe de la base**.
   Choisissez la région la plus proche de vos utilisateurs.
2. **Authentication → Sign In / Providers** :
   - laissez **Email** activé ;
   - **désactivez « Allow new users to sign up »** (personne ne doit pouvoir s'inscrire seul).
3. Notez dans **Project Settings** :
   - la **référence du projet** (Project ID, ex. `abcdefghijklmnop`) ;
   - dans **API** (ou **API Keys**) : l'**URL du projet** et la **clé publique**
     (`anon` / *publishable*). **Ne copiez jamais la clé `service_role` / *secret* dans le site.**

### 3. Brancher GitHub sur Supabase (base + fonction automatiques)

1. Sur Supabase : avatar → **Account → Access Tokens** → *Generate new token*. Copiez-le.
2. Sur GitHub, dans votre dépôt : **Settings → Secrets and variables → Actions → New repository secret**,
   et créez ces trois secrets :

   | Nom | Valeur |
   |---|---|
   | `SUPABASE_ACCESS_TOKEN` | le jeton de l'étape 1 |
   | `SUPABASE_PROJECT_ID` | la référence du projet |
   | `SUPABASE_DB_PASSWORD` | le mot de passe de la base |

3. Onglet **Actions** → *Déploiement Supabase* → **Run workflow**.
   Au bout d'une minute ou deux, la coche verte indique que les tables et la fonction
   `admin-users` sont en place (visibles dans Supabase : *Table Editor* et *Edge Functions*).

> Ensuite, chaque modification du dossier `supabase/` envoyée sur GitHub est appliquée
> automatiquement.

### 4. Créer le compte administrateur

Dans Supabase : **Authentication → Users → Add user → Create new user**
- E-mail : `admin@gestpro.local`
- Mot de passe : un mot de passe fort (12 caractères ou plus)
- Cochez **Auto Confirm User**

Le **tout premier compte** créé devient automatiquement administrateur, avec l'identifiant
`admin`. Les suivants doivent être générés depuis l'application.

> Important : faites l'étape 3 **avant** l'étape 4, sinon le compte ne recevra pas le rôle
> administrateur.

### 5. Renseigner `public/config.js`

Sur GitHub, ouvrez `public/config.js` → crayon ✏️, remplacez :
```js
supabaseUrl: "https://abcdefghijklmnop.supabase.co",
supabaseAnonKey: "eyJ…  (ou sb_publishable_…)",
nomEntreprise: "Le nom de votre entreprise",
```
puis *Commit changes*.

### 6. Publier le site sur Cloudflare Pages

1. Sur <https://dash.cloudflare.com> : **Workers & Pages → Create → Pages → Connect to Git**.
2. Autorisez Cloudflare à accéder à GitHub et choisissez le dépôt `gestpro`.
3. Réglages de construction :
   - **Framework preset** : *None*
   - **Build command** : *(laisser vide)*
   - **Build output directory** : `public`
4. **Save and Deploy**. Votre site est en ligne, en HTTPS, à une adresse du type
   `https://gestpro.pages.dev`.

Chaque envoi sur GitHub remet le site à jour automatiquement.

### 7. Restreindre la fonction à votre site (recommandé)

Dans Supabase : **Edge Functions → Secrets** (ou *Manage secrets*), ajoutez :

| Nom | Valeur |
|---|---|
| `ALLOWED_ORIGIN` | `https://gestpro.pages.dev` (votre adresse exacte, sans `/` final) |

Puis, dans **Authentication → URL Configuration**, mettez cette même adresse dans **Site URL**.

### 8. Premier essai

1. Ouvrez votre site, connectez-vous avec `admin` et le mot de passe de l'étape 4.
2. Onglet **Utilisateurs → Générer un compte** : créez un compte *Lecteur*.
3. Ouvrez une fenêtre de navigation privée, connectez-vous avec ce compte et vérifiez qu'aucun
   bouton d'ajout ou de modification n'apparaît.
4. Ajoutez un produit en stock, puis une vente : le stock doit baisser.

---

## Nom de domaine personnalisé

Pour une adresse comme `gestion.votre-entreprise.ci` : Cloudflare Pages → votre projet →
**Custom domains → Set up a custom domain**. Le certificat HTTPS est automatique.
Pensez ensuite à mettre à jour `ALLOWED_ORIGIN` et la *Site URL* de Supabase.

## Utilisation au quotidien

- **Identifiants** : les utilisateurs tapent simplement leur identifiant (`awa.kone`) ; il est
  converti en interne en `awa.kone@gestpro.local`. Aucun e-mail n'est envoyé.
- **Mot de passe oublié** : l'administrateur clique sur *Nouveau mot de passe* dans
  l'onglet Utilisateurs.
- **Commandes** : ce sont les commandes passées aux **fournisseurs**. Le statut *reçue*
  ajoute la marchandise au stock.
- **Export** : chaque liste a un bouton *Exporter CSV* (ouvrable dans Excel).
- Les écrans se rafraîchissent toutes les 30 secondes pour voir le travail des collègues.

## Coûts et sauvegardes

- Cloudflare Pages et GitHub (dépôt privé) : gratuits pour cet usage.
- Supabase propose une offre gratuite, mais avec des limites : un projet gratuit inactif peut
  être mis en pause, et les sauvegardes automatiques sont réservées aux offres payantes.
  Pour un usage professionnel, l'offre payante est conseillée. Vérifiez les conditions et
  tarifs actuels sur <https://supabase.com/pricing>.
- Sauvegarde manuelle possible à tout moment depuis Supabase (*Database → Backups*) ou par
  les exports CSV.

## Modifier l'application

- Interface : `public/app.js` (les champs de chaque écran sont décrits dans `ENTITES`).
- Base : ajoutez un **nouveau** fichier dans `supabase/migrations/` (ne modifiez pas un fichier
  déjà appliqué), par exemple `20261101000000_ajout_colonne.sql`.
- Envoyez sur GitHub : tout est redéployé automatiquement.

## En cas de problème

| Symptôme | Cause probable |
|---|---|
| « Configuration manquante » | `public/config.js` pas encore rempli. |
| « Identifiant ou mot de passe incorrect » pour admin | Le compte n'a pas été créé avec `admin@gestpro.local`, ou n'est pas confirmé. |
| « Ce compte n'est pas autorisé » | Le compte a été créé dans Supabase après le premier admin, au lieu d'être généré depuis l'onglet Utilisateurs. |
| Onglet Utilisateurs en erreur | La fonction `admin-users` n'est pas déployée (étape 3) ou `ALLOWED_ORIGIN` ne correspond pas exactement à l'adresse du site. |
| L'action GitHub échoue | Vérifiez les trois secrets (orthographe et valeurs). |
