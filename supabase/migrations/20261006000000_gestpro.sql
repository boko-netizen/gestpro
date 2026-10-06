-- =====================================================================
-- GestPro : schéma de la base Supabase
-- Entités : clients, fournisseurs, produits (stock), ventes, commandes,
--           dépenses, livraisons + profils utilisateurs et rôles.
-- Les droits sont appliqués par la base elle-même (Row Level Security) :
--   admin        : tout, plus la gestion des comptes (via la fonction Edge)
--   gestionnaire : lecture et écriture des données
--   lecteur      : lecture seule
-- Un compte sans profil n'a accès à rien.
-- =====================================================================

create type public.app_role as enum ('admin', 'gestionnaire', 'lecteur');

-- ---------------------------------------------------------------------
-- Profils (un par compte autorisé)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  identifiant text not null unique check (identifiant ~ '^[a-z0-9._-]{3,32}$'),
  nom         text,
  role        public.app_role not null default 'lecteur',
  created_at  timestamptz not null default now()
);

create or replace function public.mon_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.peut_lire()
returns boolean language sql stable set search_path = public
as $$ select public.mon_role() is not null $$;

create or replace function public.peut_ecrire()
returns boolean language sql stable set search_path = public
as $$ select coalesce(public.mon_role() in ('admin', 'gestionnaire'), false) $$;

-- Le tout premier compte créé dans Supabase devient administrateur.
-- Ensuite, seuls les comptes générés par l'administrateur reçoivent un
-- profil (la fonction Edge le crée) : une inscription sauvage n'a aucun accès.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    insert into public.profiles (id, identifiant, nom, role)
    values (new.id,
            coalesce(substring(regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9._-]', '', 'g')
                               from '^[a-z0-9._-]{3,32}'), 'admin'),
            coalesce(new.raw_user_meta_data ->> 'nom', 'Administrateur'),
            'admin')
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Données métier
-- ---------------------------------------------------------------------
create table public.clients (
  id         bigint generated always as identity primary key,
  nom        text not null check (length(trim(nom)) > 0),
  telephone  text,
  email      text,
  adresse    text,
  notes      text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null
);

create table public.fournisseurs (
  id         bigint generated always as identity primary key,
  nom        text not null check (length(trim(nom)) > 0),
  contact    text,
  telephone  text,
  email      text,
  adresse    text,
  notes      text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null
);

create table public.produits (
  id             bigint generated always as identity primary key,
  reference      text unique,
  designation    text not null check (length(trim(designation)) > 0),
  categorie      text,
  quantite       integer not null default 0 check (quantite >= 0),
  prix_achat     numeric(14, 2) not null default 0 check (prix_achat >= 0),
  prix_vente     numeric(14, 2) not null default 0 check (prix_vente >= 0),
  seuil_alerte   integer not null default 5 check (seuil_alerte >= 0),
  fournisseur_id bigint references public.fournisseurs(id) on delete set null,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users(id) on delete set null
);

create table public.ventes (
  id            bigint generated always as identity primary key,
  date          date not null default current_date,
  client_id     bigint references public.clients(id) on delete set null,
  produit_id    bigint not null references public.produits(id) on delete restrict,
  quantite      integer not null check (quantite > 0),
  prix_unitaire numeric(14, 2) not null check (prix_unitaire >= 0),
  montant       numeric(16, 2) generated always as (quantite * prix_unitaire) stored,
  mode_paiement text not null default 'Espèces',
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users(id) on delete set null
);

-- Commandes passées aux fournisseurs (approvisionnement).
-- Passer une commande au statut « reçue » ajoute la quantité au stock.
create table public.commandes (
  id             bigint generated always as identity primary key,
  date           date not null default current_date,
  fournisseur_id bigint references public.fournisseurs(id) on delete set null,
  produit_id     bigint not null references public.produits(id) on delete restrict,
  quantite       integer not null check (quantite > 0),
  prix_unitaire  numeric(14, 2) not null default 0 check (prix_unitaire >= 0),
  montant        numeric(16, 2) generated always as (quantite * prix_unitaire) stored,
  statut         text not null default 'en attente'
                 check (statut in ('en attente', 'reçue', 'annulée')),
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users(id) on delete set null
);

create table public.depenses (
  id            bigint generated always as identity primary key,
  date          date not null default current_date,
  libelle       text not null check (length(trim(libelle)) > 0),
  categorie     text,
  montant       numeric(14, 2) not null check (montant >= 0),
  mode_paiement text not null default 'Espèces',
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users(id) on delete set null
);

-- Livraisons aux clients.
create table public.livraisons (
  id         bigint generated always as identity primary key,
  date       date not null default current_date,
  client_id  bigint references public.clients(id) on delete set null,
  vente_id   bigint references public.ventes(id) on delete set null,
  adresse    text,
  livreur    text,
  frais      numeric(14, 2) not null default 0 check (frais >= 0),
  statut     text not null default 'en préparation'
             check (statut in ('en préparation', 'en cours', 'livrée', 'annulée')),
  notes      text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null
);

create index on public.ventes (date);
create index on public.ventes (produit_id);
create index on public.commandes (statut);
create index on public.depenses (date);
create index on public.livraisons (statut);

-- ---------------------------------------------------------------------
-- Stock : mouvements automatiques, dans la même transaction que l'écriture
-- ---------------------------------------------------------------------
create or replace function public.ventes_stock()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  dispo integer;
  prix  numeric;
begin
  -- On remet d'abord en stock l'ancienne vente (modification ou suppression)
  if tg_op in ('UPDATE', 'DELETE') then
    update produits set quantite = quantite + old.quantite where id = old.produit_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  select quantite, prix_vente into dispo, prix
    from produits where id = new.produit_id for update;
  if not found then
    raise exception 'Produit introuvable';
  end if;
  if dispo < new.quantite then
    raise exception 'Stock insuffisant : % disponible(s), % demandé(s)', dispo, new.quantite;
  end if;
  if new.prix_unitaire is null then
    new.prix_unitaire := prix;
  end if;
  update produits set quantite = quantite - new.quantite where id = new.produit_id;
  return new;
end $$;

create trigger ventes_stock
  before insert or update of produit_id, quantite or delete on public.ventes
  for each row execute function public.ventes_stock();

-- Ajoute (ou retire si négatif) une quantité au stock, sans jamais passer sous zéro.
create or replace function public.ajuster_stock(p_produit bigint, p_delta integer)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  dispo integer;
begin
  if p_delta = 0 then return; end if;
  select quantite into dispo from produits where id = p_produit for update;
  if not found then raise exception 'Produit introuvable'; end if;
  if dispo + p_delta < 0 then
    raise exception 'Impossible : le stock deviendrait négatif (% en stock, % à retirer). La marchandise a probablement déjà été vendue.', dispo, -p_delta;
  end if;
  update produits set quantite = quantite + p_delta where id = p_produit;
end $$;
revoke execute on function public.ajuster_stock(bigint, integer) from public, anon, authenticated;

create or replace function public.commandes_stock()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  avant integer := 0;  -- quantité déjà entrée en stock par l'ancienne version
  apres integer := 0;  -- quantité à entrer en stock par la nouvelle version
begin
  if tg_op <> 'INSERT' and old.statut = 'reçue' then avant := old.quantite; end if;
  if tg_op <> 'DELETE' and new.statut = 'reçue' then apres := new.quantite; end if;

  if tg_op = 'UPDATE' and old.produit_id = new.produit_id then
    perform ajuster_stock(new.produit_id, apres - avant);
  else
    if avant > 0 then perform ajuster_stock(old.produit_id, -avant); end if;
    if apres > 0 then perform ajuster_stock(new.produit_id, apres); end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger commandes_stock
  before insert or update of produit_id, quantite, statut or delete on public.commandes
  for each row execute function public.commandes_stock();

-- ---------------------------------------------------------------------
-- Tableau de bord
-- ---------------------------------------------------------------------
create or replace function public.tableau_de_bord()
returns json
language sql stable security invoker set search_path = public
as $$
  select json_build_object(
    'ca',               coalesce((select sum(montant) from ventes), 0),
    'ca_mois',          coalesce((select sum(montant) from ventes
                                   where date >= date_trunc('month', current_date)), 0),
    'depenses',         coalesce((select sum(montant) from depenses), 0),
    'depenses_mois',    coalesce((select sum(montant) from depenses
                                   where date >= date_trunc('month', current_date)), 0),
    'commandes_attente',(select count(*) from commandes where statut = 'en attente'),
    'livraisons_cours', (select count(*) from livraisons where statut in ('en préparation', 'en cours')),
    'valeur_stock',     coalesce((select sum(quantite * prix_achat) from produits), 0),
    'nb_clients',       (select count(*) from clients),
    'alertes',          coalesce((select json_agg(json_build_object(
                                     'designation', designation,
                                     'quantite', quantite,
                                     'seuil', seuil_alerte) order by quantite)
                                   from produits where quantite <= seuil_alerte), '[]'::json)
  )
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profil : soi-même ou admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.mon_role() = 'admin');
-- Aucune écriture directe sur profiles : elle passe par la fonction Edge.

do $$
declare t text;
begin
  foreach t in array array['clients','fournisseurs','produits','ventes','commandes','depenses','livraisons']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "lecture" on public.%I for select to authenticated using (public.peut_lire())', t);
    execute format('create policy "ajout" on public.%I for insert to authenticated with check (public.peut_ecrire())', t);
    execute format('create policy "modification" on public.%I for update to authenticated using (public.peut_ecrire()) with check (public.peut_ecrire())', t);
    execute format('create policy "suppression" on public.%I for delete to authenticated using (public.peut_ecrire())', t);
  end loop;
end $$;

-- Droits explicites : le schéma fonctionne même si l'option Supabase
-- « Automatically expose new tables » est désactivée (recommandé).
grant usage on schema public to authenticated;
grant execute on function public.mon_role(), public.peut_lire(), public.peut_ecrire() to authenticated;
revoke execute on function public.handle_new_user(), public.ventes_stock(), public.commandes_stock()
  from public, anon, authenticated;

-- Les visiteurs non connectés n'ont accès à rien.
revoke all on all tables in schema public from anon;
revoke execute on function public.tableau_de_bord() from public, anon;
grant execute on function public.tableau_de_bord() to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on
  public.clients, public.fournisseurs, public.produits, public.ventes,
  public.commandes, public.depenses, public.livraisons
  to authenticated;
