"use client";
// Text animation picker (lib/motion-studio/animation.js). Every option animates whole rows, whole words (split only at
// breakable whitespace) or the whole block: never letters. Preview and export draw through the same animFrame, and
// every video route validates the choice (validateAnimation) before it exports. The Calm / Normal / Expressive feel
// and "Reduce motion" are stored on the composition, so the export is the same on every machine. The browser's
// prefers-reduced-motion setting is only offered as a suggestion; it never changes the export by itself.
import { useEffect, useState } from "react";
import {
  ANIMATIONS,
  ANIMATION_IDS,
  BEHAVIOUR_IDS,
  MOTION_PREFS,
  PREF_LABELS,
  motionPrefOf,
  reduceMotionOf,
} from "@/lib/motion-studio/animation";
import { Btn } from "../studio-ui";
import { useStudio } from "../studio-context";

const PREF_DESC = {
  calm: "Slower, smaller movement.",
  normal: "The default pace.",
  expressive: "A little quicker and fuller.",
};

function useSystemReducedMotion() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  return on;
}

export default function MotionPanel() {
  const { comp, update } = useStudio();
  const systemReduce = useSystemReducedMotion();
  const textIn = comp.motion?.textIn;
  const pref = motionPrefOf(comp);
  const reduce = reduceMotionOf(comp);
  const classic = BEHAVIOUR_IDS.includes(textIn);
  const setMotion = (patch) =>
    update((c) => {
      const m = { ...c.motion, ...patch };
      if (m.pref === undefined) delete m.pref;
      if (m.reduceMotion !== true) delete m.reduceMotion;
      c.motion = m;
      return c;
    });
  return (
    <fieldset>
      <legend className="pms-lbl">Text animation</legend>
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Text animation">
        {ANIMATION_IDS.map((id) => {
          const a = ANIMATIONS[id];
          return (
            <Btn
              key={id}
              aria-pressed={textIn === id}
              aria-label={`Text animation: ${a.label}. ${a.description}`}
              style={{ minHeight: 44, minWidth: 44, textAlign: "left" }}
              className="flex flex-col items-start gap-0.5"
              onClick={() => setMotion({ textIn: id })}
            >
              <span>{a.label}</span>
              <span className="text-xs opacity-75">{a.description}</span>
            </Btn>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Motion feel">
        {MOTION_PREFS.map((p) => (
          <Btn
            key={p}
            aria-pressed={pref === p}
            aria-label={`Motion feel: ${PREF_LABELS[p]}. ${PREF_DESC[p]}`}
            style={{ minHeight: 44, minWidth: 44 }}
            className="flex flex-col items-start gap-0.5"
            onClick={() => setMotion({ pref: p })}
          >
            <span>{PREF_LABELS[p]}</span>
            <span className="text-xs opacity-75">{PREF_DESC[p]}</span>
          </Btn>
        ))}
      </div>
      {classic && (
        <p className="mt-1 text-xs opacity-75">
          Calm / Normal / Expressive apply to the newer animations; the four classic ones keep their original timing.
        </p>
      )}
      <label className="pms-lbl mt-2 flex items-center gap-2" style={{ minHeight: 44 }}>
        <input
          type="checkbox"
          aria-label="Reduce motion"
          style={{ width: 24, height: 24 }}
          checked={reduce}
          onChange={(e) => setMotion({ reduceMotion: e.target.checked ? true : undefined })}
        />
        Reduce motion (every animation becomes a plain fade, background still; preview and export)
      </label>
      {systemReduce && !reduce && (
        <p className="text-xs opacity-75" role="note">
          Your device asks for reduced motion. You can turn on Reduce motion above; it is not applied automatically.
        </p>
      )}
    </fieldset>
  );
}
