import { useNavigate } from "react-router";
import { useRapport } from "../context/RapportContext";
import { BoutonPrincipal } from "../components/Chrome";

export default function PageAccueil() {
  const navigate = useNavigate();
  const { etat, maj } = useRapport();

  async function commencer() {
    if (etat.operationnelle === null) return;
    maj({
      operationnelle: etat.operationnelle,
      localisation: null,
    });
    navigate("/rapport/secteur");
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
          <BoutonPrincipal
            onClick={commencer}
            disabled={etat.operationnelle === null}
            className="w-full justify-between"
          >
            <span>Commencer le contrôle</span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-citron" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="square" />
            </svg>
          </BoutonPrincipal>
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
