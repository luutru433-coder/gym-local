import { useEffect, useState } from "react";
import type { ExerciseTechnique as Technique } from "@gym/contracts";
import { Check, Crosshair, X } from "lucide-react";
import { loadExerciseTechnique } from "@gym/catalog/technique";
import { TechniqueFigure } from "./TechniqueFigure";

export default function ExerciseTechnique({ variantId, locale }: { variantId: string; locale: "vi" | "en" }) {
  const [technique, setTechnique] = useState<Technique>();
  const [active, setActive] = useState(0);
  useEffect(() => {
    let current = true;
    void loadExerciseTechnique(variantId).then((loaded) => {
      if (current) setTechnique(loaded);
    });
    return () => {
      current = false;
    };
  }, [variantId]);
  if (!technique) return null;
  const steps = [technique.setup, ...technique.phases];
  const step = steps[Math.min(active, steps.length - 1)];
  const vi = locale === "vi";
  return (
    <section className="technique-section">
      <h3><Crosshair size={19} />{vi ? "Kỹ thuật chi tiết" : "Technique detail"}</h3>
      <div className="technique-steps" role="tablist" aria-label={vi ? "Các pha của động tác" : "Movement phases"}>
        {steps.map((item, index) => <button type="button" role="tab" key={index} aria-selected={index === active} className={index === active ? "technique-step technique-step--active" : "technique-step"} onClick={() => setActive(index)}><span>{index + 1}</span>{item.title[locale]}</button>)}
      </div>
      <div className="technique-panel">
        <TechniqueFigure key={active} figure={step.figure} locale={locale} label={step.title[locale]} marks={step.cues.map((cue, index) => ({ ...cue, badge: index + 1 }))} />
        <ol className="technique-cues">{step.cues.map((cue, index) => <li key={index}><span>{index + 1}</span><p>{cue.text[locale]}</p></li>)}</ol>
      </div>
      <h4 className="technique-subtitle">{vi ? "Lỗi thường gặp và cách sửa" : "Common mistakes and fixes"}</h4>
      <div className="technique-mistakes">
        {technique.mistakes.map((mistake, index) => (
          <article key={index} className="technique-mistake">
            <h5>{mistake.title[locale]}</h5>
            <div className="technique-compare">
              <figure><TechniqueFigure figure={mistake.wrong} tone="wrong" locale={locale} label={`${vi ? "Sai" : "Wrong"}: ${mistake.title[locale]}`} marks={mistake.mark ? [mistake.mark] : []} /><figcaption className="is-wrong"><X size={14} />{vi ? "Sai" : "Wrong"}</figcaption></figure>
              <figure><TechniqueFigure figure={mistake.right} tone="right" locale={locale} label={`${vi ? "Đúng" : "Right"}: ${mistake.fix[locale]}`} marks={mistake.mark ? [mistake.mark] : []} /><figcaption className="is-right"><Check size={14} />{vi ? "Đúng" : "Right"}</figcaption></figure>
            </div>
            <p><strong>{vi ? "Sửa:" : "Fix:"}</strong> {mistake.fix[locale]}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
