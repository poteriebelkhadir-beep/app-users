import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const maxImages = 3;
const maxImageBytes = 5 * 1024 * 1024;
const imageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const responseKeys = [
  "pomme", "vanne_1", "palette", "vanne_2", "vasque", "rampe_2_sorties",
  "erogateurs", "tige_commande", "pedale", "flotteur", "ressort", "qualite_eau",
];

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function valideImage(type: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.subarray(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  if (type === "image/webp") {
    return String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  }
  return false;
}

function validerRapport(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const rapport = value as Record<string, unknown>;
  const rapporteur = rapport.rapporteur as Record<string, unknown> | null;
  const localisation = rapport.localisation as Record<string, unknown> | null;
  const reponses = rapport.reponses as Record<string, unknown> | null;
  const valeurs = ["BON", "MANQUE", "NON CONFORME", "N/A"];

  return ["LF", "NISSAN", "ST"].includes(String(rapport.secteur))
    && typeof rapport.operationnelle === "boolean"
    && typeof rapport.unite === "string" && rapport.unite.length > 0 && rapport.unite.length <= 100
    && typeof rapport.emplacement === "string" && rapport.emplacement.length > 0 && rapport.emplacement.length <= 150
    && typeof rapport.remarques === "string" && rapport.remarques.length <= 500
    && Boolean(rapporteur)
    && typeof rapporteur?.nom === "string" && rapporteur.nom.trim().length > 0 && rapporteur.nom.length <= 60
    && typeof rapporteur.prenom === "string" && rapporteur.prenom.trim().length > 0 && rapporteur.prenom.length <= 60
    && Boolean(localisation)
    && typeof localisation?.latitude === "number" && Number.isFinite(localisation.latitude) && localisation.latitude >= -90 && localisation.latitude <= 90
    && typeof localisation.longitude === "number" && Number.isFinite(localisation.longitude) && localisation.longitude >= -180 && localisation.longitude <= 180
    && typeof localisation.precision === "number" && Number.isFinite(localisation.precision) && localisation.precision >= 0 && localisation.precision <= 100000
    && Boolean(reponses)
    && responseKeys.every((key) => typeof reponses?.[key] === "string" && valeurs.includes(String(reponses[key])));
}

function classerErreur(error: { code?: string; message?: string }) {
  if (error.code === "P0001") {
    return error.message?.includes("doublon_recent")
      ? { type: "doublon", message: "Un rapport a déjà été transmis récemment pour cet emplacement. Réessayez dans dix minutes." }
      : { type: "limite", message: "Trop de rapports ont été transmis en peu de temps. Réessayez dans une minute." };
  }
  if (["22023", "23502", "23514", "22P02", "42501"].includes(error.code ?? "")) {
    return { type: "validation", message: "Certaines informations ne sont pas acceptées. Vérifiez le formulaire, puis réessayez." };
  }
  return { type: "serveur", message: "Supabase n'a pas confirmé la transmission. Vos réponses sont conservées ; réessayez." };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "Méthode non autorisée." }, 405);
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return reply({ error: "Format de requête invalide." }, 400);
  }

  let formulaire: FormData;
  let rapport: unknown;
  try {
    formulaire = await request.formData();
    rapport = JSON.parse(String(formulaire.get("rapport") ?? ""));
  } catch {
    return reply({ error: "Rapport invalide." }, 400);
  }

  const images = formulaire.getAll("images");
  if (!validerRapport(rapport) || images.length < 1 || images.length > maxImages
      || images.some((image) => !(image instanceof File) || image.size === 0
        || image.size > maxImageBytes || !imageTypes.has(image.type))) {
    return reply({ error: "Le formulaire ou les photos ne sont pas valides." }, 400);
  }

  const env = Deno.env.toObject();
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return reply({ error: "Le stockage des photos n’est pas configuré." }, 503);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const payload = rapport as {
    secteur: "LF" | "NISSAN" | "ST";
    rapporteur: { nom: string; prenom: string };
    unite: string;
    emplacement: string;
    reponses: Record<string, string>;
    remarques: string;
    operationnelle: boolean;
    localisation: { latitude: number; longitude: number; precision: number };
  };
  const uploaded: string[] = [];

  try {
    for (const entry of images) {
      const image = entry as File;
      const bytes = new Uint8Array(await image.arrayBuffer());
      if (!valideImage(image.type, bytes)) {
        await admin.storage.from("rapports-photos").remove(uploaded);
        return reply({ error: "Une photo ne correspond pas à son format déclaré." }, 400);
      }
      const path = `${payload.secteur}/${crypto.randomUUID()}.${imageTypes.get(image.type)}`;
      const { error } = await admin.storage.from("rapports-photos").upload(path, bytes, {
        contentType: image.type,
        upsert: false,
      });
      if (error) throw error;
      uploaded.push(path);
    }

    const { data, error } = await admin.rpc("inserer_rapport", {
      p_secteur: payload.secteur,
      p_nom: payload.rapporteur.nom,
      p_prenom: payload.rapporteur.prenom,
      p_unite: payload.unite,
      p_emplacement: payload.emplacement,
      p_reponses: payload.reponses,
      p_remarques: payload.remarques,
      p_operationnelle: payload.operationnelle,
      p_latitude: payload.localisation.latitude,
      p_longitude: payload.localisation.longitude,
      p_precision_gps: payload.localisation.precision,
      p_photos: uploaded,
    });

    if (error) {
      await admin.storage.from("rapports-photos").remove(uploaded);
      return reply({ ok: false, erreur: classerErreur(error) });
    }

    const ligne = Array.isArray(data) ? data[0] : data;
    if (!ligne || typeof ligne.rapport_id !== "string" || typeof ligne.recu_le !== "string") {
      await admin.storage.from("rapports-photos").remove(uploaded);
      return reply({ ok: false, erreur: { type: "serveur", message: "Réponse Supabase invalide." } });
    }

    return reply({ ok: true, id: ligne.rapport_id, created_at: ligne.recu_le });
  } catch {
    if (uploaded.length) await admin.storage.from("rapports-photos").remove(uploaded);
    return reply({ ok: false, erreur: { type: "serveur", message: "L'envoi des photos a échoué. Réessayez." } });
  }
});
