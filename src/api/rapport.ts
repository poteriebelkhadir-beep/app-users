import { getClient } from './client';
import type { ErreurApi, PayloadRapport, ResultatEnvoi } from '../types';

const attendre = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function classerErreur(error: { code?: string; message?: string; name?: string }): ErreurApi['type'] {
  if (error.code === 'PGRST202' || error.code === '42501' || error.code === 'PGRST301') return 'configuration';
  if (error.code === 'P0001') return error.message?.includes('doublon_recent') ? 'doublon' : 'limite';
  if (['22023', '23502', '23514', '22P02'].includes(error.code ?? '')) return 'validation';
  if (['57014', '08006', '08001', 'PGRST000'].includes(error.code ?? '')) return 'reseau';
  if (error.name === 'FetchError' || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
    return 'reseau';
  }
  return 'serveur';
}

/**
 * Ce projet Supabase n'a pas de fonction Edge : les photos sont uploadées
 * directement dans le bucket public "photos-controles", puis la seule
 * fonction RPC ouverte à anon (inserer_rapport) reçoit les URLs obtenues.
 */
async function televerserPhotos(secteur: string, images: File[]): Promise<string[]> {
  const client = getClient();
  const urls: string[] = [];
  for (const image of images) {
    const extension = EXTENSIONS[image.type] ?? 'jpg';
    const chemin = `${secteur}/${crypto.randomUUID()}.${extension}`;
    const { error } = await client.storage.from('photos-controles').upload(chemin, image, {
      contentType: image.type,
      upsert: false,
    });
    if (error) throw error;
    const { data } = client.storage.from('photos-controles').getPublicUrl(chemin);
    urls.push(data.publicUrl);
  }
  return urls;
}

async function envoyer(payload: PayloadRapport): Promise<ResultatEnvoi> {
  try {
    const photos = await televerserPhotos(payload.secteur, payload.images);

    const { data, error } = await getClient().rpc('inserer_rapport', {
      p_secteur: payload.secteur,
      p_nom: payload.rapporteur.nom,
      p_prenom: payload.rapporteur.prenom,
      p_unite: payload.unite,
      p_emplacement: payload.emplacement,
      p_reponses: payload.reponses,
      p_remarques: payload.remarques,
      p_photos: photos,
      p_operationnelle: payload.operationnelle,
      p_localisation: payload.localisation,
    });

    if (error) {
      return { ok: false, erreur: { type: classerErreur(error), message: error.message } };
    }
    const ligne = Array.isArray(data) ? data[0] : data;
    if (!ligne || typeof ligne.rapport_id !== 'string' || typeof ligne.recu_le !== 'string') {
      return { ok: false, erreur: { type: 'serveur', message: 'Réponse Supabase invalide' } };
    }
    return { ok: true, id: ligne.rapport_id, created_at: ligne.recu_le };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connexion impossible';
    const type: ErreurApi['type'] = message.startsWith('Configuration Supabase manquante')
      ? 'configuration'
      : 'reseau';
    return { ok: false, erreur: { type, message } };
  }
}

/**
 * Transmet un rapport via la seule fonction RPC ouverte à anon.
 * Une seconde tentative est faite uniquement en cas d'échec réseau :
 * les rapports sont immuables, un doublon est refusé par le serveur.
 */
export async function submitReport(payload: PayloadRapport): Promise<ResultatEnvoi> {
  const premiere = await envoyer(payload);
  if (premiere.ok || premiere.erreur.type !== 'reseau') return premiere;

  await attendre(700);
  return envoyer(payload);
}
