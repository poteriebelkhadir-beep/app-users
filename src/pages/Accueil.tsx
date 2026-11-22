import { useState } from "react";
import { useNavigate } from "react-router";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { useRapport } from "../context/RapportContext";
import { BoutonPrincipal } from "../components/Chrome";

interface Position {
  coords: { latitude: number; longitude: number; accuracy: number };
}

// Dans l'APK (WebView native), l'API navigator.geolocation du navigateur ne
// déclenche pas la boîte de dialogue de permission Android de façon fiable :
// il faut passer par le pont natif de Capacitor, qui demande explicitement
// ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION (fusionnées dans le manifest
// par le plugin @capacitor/geolocation). Sur le web, on garde l'API navigateur.
async function lirePosition(): Promise<Position> {
  if (Capacitor.isNativePlatform()) {
    const statut = await Geolocation.checkPermissions();
    if (statut.location !== "granted" && statut.coarseLocation !== "granted") {
      const demande = await Geolocation.requestPermissions();
      if (demande.location !== "granted" && demande.coarseLocation !== "granted") {
        throw new Error("Autorisez la localisation pour commencer le contrôle.");
      }
    }
    return Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("La géolocalisation n’est pas disponible sur cet appareil."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    });
  });
}

function messagePosition(error: unknown): string {
  if (error instanceof GeolocationPositionError) {
    if (error.code === error.PERMISSION_DENIED) return "Autorisez la localisation pour commencer le contrôle.";
    if (error.code === error.TIMEOUT) return "La localisation met trop de temps. Réessayez à l’extérieur.";
  }
  return error instanceof Error ? error.message : "Position GPS indisponible. Réessayez.";
}

export default function PageAccueil() {
  const navigate = useNavigate();
  const { etat, maj } = useRapport();
  const [localisationEnCours, setLocalisationEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  async function commencer() {
    if (etat.operationnelle === null || localisationEnCours) return;
    setErreur("");
    setLocalisationEnCours(true);
    try {
      const position = await lirePosition();
      maj({
        operationnelle: etat.operationnelle,
        localisation: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          precision: position.coords.accuracy,
        },
      });
      navigate("/rapport/secteur");
    } catch (error) {
      setErreur(messagePosition(error));
    } finally {
      setLocalisationEnCours(false);
    }
  }

  return (
    <main className="papier-grain flex min-h-screen items-center justify-center px-5 py-10">
      <div className="relative z-10 w-full max-w-md text-center">
        <div className="monter mx-auto w-44 sm:w-52">
          <img
            src="/logo-hsely.webp"
            alt="Logo HSELY"
            className="aspect-square w-full object-contain"
            fetchPriority="high"
          />
        </div>
        <p className="monter d1 etiquette mt-3 text-[10px] text-acier">Contrôle terrain</p>
        <h1 className="monter d1 display mt-2 text-[2rem] leading-tight text-pin sm:text-[2.4rem]">
          HSELY
        </h1>
        <p className="monter d1 mt-1 text-[13px] text-acier">Douches de sécurité</p>

        <fieldset className="monter d2 mt-9">
          <legend className="mx-auto display text-[1.55rem] text-pin sm:text-[1.75rem]">
            La douche est-elle opérationnelle ?
          </legend>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              { value: true, label: "Oui" },
              { value: false, label: "Non" },
            ].map((option) => {
              const selected = etat.operationnelle === option.value;
              return (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => maj({ operationnelle: option.value })}
                  className={`min-h-14 border text-[15px] font-semibold transition ${
                    selected
                      ? "border-pin bg-pin text-white"
                      : "border-sable bg-[#fdfcf6] text-pin hover:border-pin/40"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="monter d3 mt-7">
          {erreur && (
            <p role="alert" className="mb-3 border-l-2 border-argile bg-argile/[0.06] px-3 py-2 text-left text-[12px] leading-5 text-argile">
              {erreur}
            </p>
          )}
          <BoutonPrincipal
            onClick={commencer}
            disabled={etat.operationnelle === null || localisationEnCours}
            className="w-full justify-between"
          >
            <span>{localisationEnCours ? "Localisation en cours…" : "Commencer le contrôle"}</span>
            {!localisationEnCours && (
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-citron" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="square" />
              </svg>
            )}
          </BoutonPrincipal>
          <p className="mt-3 text-[11px] text-acier">La localisation GPS est requise pour transmettre le rapport.</p>
        </div>

        <div className="monter d3 mx-auto mt-10 max-w-xs" aria-label="Étape 1 sur 4">
          <div className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((step) => (
              <span key={step} className={`h-[3px] flex-1 ${step === 0 ? "bg-citron-fonce" : "bg-sable/70"}`} />
            ))}
          </div>
          <p className="etiquette mt-2 text-[8px] text-acier">Étape 1 / 4 · État</p>
        </div>
      </div>
    </main>
  );
}
