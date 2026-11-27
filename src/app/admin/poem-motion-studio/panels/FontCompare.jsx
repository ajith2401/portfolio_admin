"use client";
// Font comparison: the SAME specimen (your poem's first lines, or a Tamil test text with Grantha letters, pulli,
// vowel signs, mixed English and punctuation) set in every Studio font, side by side. Verified fonts are always shown;
// candidate fonts appear only when the author asks, are fetched on demand (their @font-face is only requested when a
// row renders) and are labelled "Candidate – unreviewed" — never shown as approved.
import { useState } from "react";
import {
  FONT_REGISTRY,
  CANDIDATE_LABEL,
  canBody,
  canTitle,
} from "@/lib/motion-studio/font-registry";
import { FONT_CSS } from "../fonts";
import { Btn } from "../studio-ui";

export const SPECIMEN =
  "ஸ்ரீ க்ஷ ஜ ஷ ஸ ஹ — க் ங் ச் ஞ்\nகொ கோ கௌ தொ தோ வெள்ளை நிலா\n“Rain”, poem 2026! ? ; : … (௧௨௩)";
const ROLE = {
  body: "Poem text",
  display: "Titles only",
  both: "Poem text & titles",
};

export default function FontCompare({
  poemLines = [],
  current,
  previewOn,
  onUse,
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
        Compare fonts side by side
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
        <ul className="space-y-3" aria-label="Font specimens">
          {list.map((f) => {
            const usable = canBody(f.id) && (f.verified || previewOn);
            return (
              <li
                key={f.id}
                className="rounded-lg border p-3"
                style={{
                  borderColor:
                    f.id === current
                      ? "var(--accent)"
                      : "var(--line, rgba(127,127,127,.3))",
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <strong>{f.label}</strong> · {ROLE[f.role]} ·{" "}
                    <span
                      style={{
                        color: f.verified ? "var(--ok-ink)" : "var(--warn-ink)",
                      }}
                    >
                      {f.verified ? "Verified" : CANDIDATE_LABEL}
                    </span>
                    {f.upstream ? (
                      <span style={{ color: "var(--mute)" }}>
                        {" "}
                        · {f.upstream.licence}
                      </span>
                    ) : null}
                  </span>
                  {f.id === current ? (
                    <span className="text-xs">In use</span>
                  ) : usable ? (
                    <Btn
                      onClick={() => onUse(f.id)}
                      aria-label={`Use ${f.label} for the poem`}
                    >
                      Use
                    </Btn>
                  ) : !canBody(f.id) && canTitle(f.id) ? (
                    <span className="text-xs" style={{ color: "var(--mute)" }}>
                      Title font only
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: "var(--mute)" }}>
                      Turn on candidate preview to use
                    </span>
                  )}
                </div>
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
                  {text}
                </p>
              </li>
            );
          })}
        </ul>
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
