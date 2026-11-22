import { getClient } from './client';
import type { ErreurApi, PayloadRapport, ResultatEnvoi } from '../types';

const attendre = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function envoyer(payload: PayloadRapport): Promise<ResultatEnvoi> {
  try {
    const formulaire = new FormData();
    formulaire.set('rapport', JSON.stringify({
      secteur: payload.secteur,
      rapporteur: payload.rapporteur,
      unite: payload.unite,
      emplacement: payload.emplacement,
      reponses: payload.reponses,
      remarques: payload.remarques,
      operationnelle: payload.operationnelle,
      localisation: payload.localisation,
    }));
    payload.images.forEach((image) => formulaire.append('images', image));

    const { data, error } = await getClient().functions.invoke<ResultatEnvoi>('submit-report', {
      body: formulaire,
    });

    if (error) {
      return { ok: false, erreur: { type: error.name.includes('Fetch') ? 'reseau' : 'serveur', message: error.message } };
    }
    if (!data || typeof data !== 'object' || !('ok' in data)) {
      return { ok: false, erreur: { type: 'serveur', message: 'Réponse Supabase invalide' } };
    }
    return data;
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
