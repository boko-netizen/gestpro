// GestPro : gestion des comptes utilisateurs (réservée à l'administrateur).
// Tourne côté serveur sur Supabase (Edge Function) : la clé de service
// n'est jamais envoyée au navigateur.
//
// Actions (POST JSON { action, ... }) :
//   list                                 -> liste des comptes
//   create  { identifiant, nom, role }   -> crée un compte, renvoie le mot de passe (une seule fois)
//   reset   { id }                       -> nouveau mot de passe (une seule fois)
//   set_role{ id, role }                 -> change le rôle
//   delete  { id }                       -> supprime le compte (accès coupé)

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const ROLES = ["admin", "gestionnaire", "lecteur"] as const;
type Role = typeof ROLES[number];

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

// Mot de passe aléatoire sans caractères ambigus (0/O, 1/l/I)
export function genererMotDePasse(longueur = 14): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%*-_";
  const max = 256 - (256 % alphabet.length); // évite le biais modulo
  let out = "";
  while (out.length < longueur) {
    const buf = crypto.getRandomValues(new Uint8Array(longueur * 2));
    for (const b of buf) {
      if (b < max && out.length < longueur) out += alphabet[b % alphabet.length];
    }
  }
  return out;
}

function verifierRole(role: unknown): Role {
  if (typeof role !== "string" || !ROLES.includes(role as Role)) {
    throw new HttpError(400, "Rôle invalide");
  }
  return role as Role;
}

function verifierId(id: unknown): string {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "Compte invalide");
  return id;
}

async function nombreAdmins(admin: SupabaseClient): Promise<number> {
  const { count, error } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  if (error) throw error;
  return count ?? 0;
}

async function roleDe(admin: SupabaseClient, id: string): Promise<Role | null> {
  const { data, error } = await admin.from("profiles").select("role").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data?.role as Role) ?? null;
}

export async function traiter(req: Request, admin: SupabaseClient, domaine: string): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  try {
    // 1. Qui appelle ? Le jeton est vérifié par Supabase Auth.
    const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jeton) throw new HttpError(401, "Non authentifié");
    const { data: { user }, error: errUser } = await admin.auth.getUser(jeton);
    if (errUser || !user) throw new HttpError(401, "Session expirée, reconnectez-vous");
    if ((await roleDe(admin, user.id)) !== "admin") throw new HttpError(403, "Réservé à l'administrateur");

    const body = await req.json().catch(() => ({}));

    switch (body.action) {
      case "list": {
        const { data: profils, error } = await admin.from("profiles")
          .select("id, identifiant, nom, role, created_at").order("identifiant");
        if (error) throw error;
        const { data: auth, error: e2 } = await admin.auth.admin.listUsers({ perPage: 1000 });
        if (e2) throw e2;
        const derniere = new Map(auth.users.map((u) => [u.id, u.last_sign_in_at]));
        return json({ users: profils.map((p) => ({ ...p, last_sign_in_at: derniere.get(p.id) ?? null, moi: p.id === user.id })) });
      }

      case "create": {
        const identifiant = String(body.identifiant ?? "").trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,32}$/.test(identifiant)) {
          throw new HttpError(400, "Identifiant : 3 à 32 caractères (lettres minuscules, chiffres, . _ -)");
        }
        const role = verifierRole(body.role);
        const nom = String(body.nom ?? "").trim().slice(0, 100) || null;
        const { data: existe } = await admin.from("profiles").select("id").eq("identifiant", identifiant).maybeSingle();
        if (existe) throw new HttpError(409, "Cet identifiant existe déjà");

        const motDePasse = genererMotDePasse();
        const { data, error } = await admin.auth.admin.createUser({
          email: `${identifiant}@${domaine}`,
          password: motDePasse,
          email_confirm: true,
          user_metadata: { nom, identifiant },
        });
        if (error) throw new HttpError(400, error.message.includes("already") ? "Cet identifiant existe déjà" : error.message);
        const { error: e2 } = await admin.from("profiles")
          .upsert({ id: data.user.id, identifiant, nom, role });
        if (e2) {
          await admin.auth.admin.deleteUser(data.user.id); // pas de compte à moitié créé
          throw e2;
        }
        return json({ id: data.user.id, identifiant, mot_de_passe: motDePasse });
      }

      case "reset": {
        const id = verifierId(body.id);
        if (!(await roleDe(admin, id))) throw new HttpError(404, "Compte introuvable");
        const motDePasse = genererMotDePasse();
        const { error } = await admin.auth.admin.updateUserById(id, { password: motDePasse });
        if (error) throw error;
        return json({ mot_de_passe: motDePasse });
      }

      case "set_role": {
        const id = verifierId(body.id);
        const role = verifierRole(body.role);
        const actuel = await roleDe(admin, id);
        if (!actuel) throw new HttpError(404, "Compte introuvable");
        if (id === user.id && role !== "admin") throw new HttpError(400, "Vous ne pouvez pas retirer votre propre rôle d'administrateur");
        if (actuel === "admin" && role !== "admin" && (await nombreAdmins(admin)) <= 1) {
          throw new HttpError(400, "Il doit rester au moins un administrateur");
        }
        const { error } = await admin.from("profiles").update({ role }).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "delete": {
        const id = verifierId(body.id);
        if (id === user.id) throw new HttpError(400, "Vous ne pouvez pas supprimer votre propre compte");
        const actuel = await roleDe(admin, id);
        if (!actuel) throw new HttpError(404, "Compte introuvable");
        if (actuel === "admin" && (await nombreAdmins(admin)) <= 1) {
          throw new HttpError(400, "Il doit rester au moins un administrateur");
        }
        const { error } = await admin.auth.admin.deleteUser(id); // le profil part en cascade
        if (error) throw error;
        return json({ ok: true });
      }

      default:
        throw new HttpError(400, "Action inconnue");
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: (e as Error)?.message ?? "Erreur serveur" }, 500);
  }
}

// --- Démarrage du service ---
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const domaine = Deno.env.get("LOGIN_DOMAIN") ?? "gestpro.local";
Deno.serve((req) => traiter(req, admin, domaine));
