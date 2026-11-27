"use client";
// Font comparison: the SAME specimen (your poem's first lines, or a Tamil test text with Grantha letters, pulli,
// vowel signs, mixed English and punctuation) set in every Studio font, side by side. Verified fonts are always shown;
// candidate fonts appear only when the author asks, are fetched on demand (their @font-face is only requested when a
// row renders) and are labelled "Candidate – unreviewed" — never shown as approved.
import { useState } from "react";
import {
  FONT_REGISTRY,
  CANDIDATE_LABEL,
  FONT_CATEGORIES,
  canBody,
  canTitle,
  fontWeights,
} from "@/lib/motion-studio/font-registry";
import { FONT_CSS } from "../fonts";
import { Btn } from "../studio-ui";

export const SPECIMEN =
  "தமிழ் எழுத்து · அன்பின் ஆழம் · வாழ்வின் பயணம்\nஸ்ரீ க்ஷேத்திரம் ஜ ஷ ஸ ஹ — கொ கோ கௌ\n“Rain”, poem 2026! ? ; : … (௧௨௩)";
const TIER = { core: "Core", approved: "Approved", candidate: CANDIDATE_LABEL };
const TIER_INK = { core: "var(--ok-ink)", approved: "var(--ok-ink)", candidate: "var(--warn-ink)" };
const weightText = (id) => {
  const w = fontWeights(id);
  return w.length > 1 ? `weights ${w[0]}–${w[w.length - 1]}` : `weight ${w[0] || 400} only`;
};
const ROLE = {
  body: "Poem text",
  display: "Titles only",
  both: "Poem text & titles",
};

export default function FontCompare({
  poemLines = [],
  current,
  currentTitle,
  previewOn,
  onUse,
  onUseTitle,
}) {
  const [own, setOwn] = useState(poemLines.length > 0);
  const [cands, setCands] = useState(false);
  const [size, setSize] = useState(26);
  const text =
    own && poemLines.length ? poemLines.slice(0, 3).join("\n") : SPECIMEN;
  const list = FONT_REGISTRY.filter((f) => f.verified || (cands && f.loadable));
  const blocked = FONT_REGISTRY.filter((f) => !f.loadable);
  return (
    <details className="pms-card mt-3" aria-label="Compare fonts">
      <summary
        className="cursor-pointer font-semibold"
        style={{ minHeight: 44, display: "flex", alignItems: "center" }}
      >
        Browse fonts by style
      </summary>
      <div className="mt-2 space-y-3">
        <div className="pms-chips" role="group" aria-label="Specimen text">
          <Btn
            aria-pressed={own && poemLines.length > 0}
            disabled={!poemLines.length}
            onClick={() => setOwn(true)}
          >
            My poem
          </Btn>
          <Btn
            aria-pressed={!own || !poemLines.length}
            onClick={() => setOwn(false)}
          >
            Tamil test text
          </Btn>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cands}
            onChange={(e) => setCands(e.target.checked)}
          />{" "}
          Include candidate fonts (not reviewed for Tamil)
        </label>
        <label className="block">
          <span className="pms-lbl">Specimen size {size}px</span>
          <input
            type="range"
            className="w-full"
            style={{ minHeight: 44 }}
            aria-label="Specimen size"
            min={16}
            max={44}
            step={2}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </label>
        {FONT_CATEGORIES.map((cat) => {
          const fonts = list.filter((f) => f.category === cat.id);
          if (!fonts.length) return null;
          return (
            <section key={cat.id} aria-label={`${cat.label} fonts`}>
              <h4 className="pms-lbl mt-2">{cat.label}</h4>
              <ul className="space-y-3" aria-label="Font specimens">
                {fonts.map((f) => {
                  const usable = canBody(f.id) && (f.verified || previewOn);
                  const titleOk = canTitle(f.id) && (f.verified || previewOn);
                  const selected = f.id === current || f.id === currentTitle;
                  return (
                    <li
                      key={f.id}
                      aria-current={selected ? "true" : undefined}
                      className="rounded-lg border p-3"
                      style={{
                        borderColor: selected ? "var(--accent)" : "var(--line, rgba(127,127,127,.3))",
                        borderWidth: selected ? 2 : 1,
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span>
                          <strong>{f.label}</strong> · {ROLE[f.role]} ·{" "}
                          <span style={{ color: TIER_INK[f.tier] }}>{TIER[f.tier]}</span>
                          <span style={{ color: "var(--mute)" }}>
                            {" "}
                            · {weightText(f.id)}
                            {f.upstream ? ` · ${f.upstream.licence}` : ""}
                          </span>
                        </span>
                        <span className="flex flex-wrap gap-2">
                          {f.id === current ? (
                            <span className="text-xs">Poem font</span>
                          ) : usable ? (
                            <Btn onClick={() => onUse(f.id)} aria-label={`Use ${f.label} for the poem`}>
                              Use
                            </Btn>
                          ) : null}
                          {f.id === currentTitle ? (
                            <span className="text-xs">Title font</span>
                          ) : titleOk && onUseTitle ? (
                            <Btn onClick={() => onUseTitle(f.id)} aria-label={`Use ${f.label} for the title`}>
                              Title
                            </Btn>
                          ) : null}
                          {!usable && !titleOk && (
                            <span className="text-xs" style={{ color: "var(--mute)" }}>
                              Turn on candidate preview to use
                            </span>
                          )}
                        </span>
                      </div>
                      {f.reviewNote && !f.verified && (
                        <p className="text-xs" style={{ color: "var(--warn-ink)" }}>
                          {f.reviewNote}
                        </p>
                      )}
                      <p
                        lang="ta"
                        className="mt-2"
                        style={{
                          fontFamily: FONT_CSS[f.id],
                          fontSize: size,
                          lineHeight: 1.7,
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {canBody(f.id) ? text : text.split("\n")[0]}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {blocked.length > 0 && (
          <p className="text-xs" style={{ color: "var(--mute)" }}>
            Not available:{" "}
            {blocked.map((f) => `${f.label} — ${f.why}`).join(" ")}
          </p>
        )}
      </div>
    </details>
  );
}
