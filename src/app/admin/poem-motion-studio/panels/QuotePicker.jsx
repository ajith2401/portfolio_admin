"use client";
// Quote (EXCERPT) line selector. The author ticks whole source lines; nothing is ever edited. The output is always
// labelled as an excerpt ("N of M lines") and never presented as the complete poem.
import { useState } from "react";
import { Btn, Field } from "../studio-ui";
import { useStudio } from "../studio-context";
import { QUOTE_MAX_LINES } from "@/lib/motion-studio/route-checks";

const FORMAT_LABEL = {
  poster: "Poster 4:5",
  square: "Square 1:1",
  reel: "Reel 9:16",
  story: "Story 9:16",
};

export default function QuotePicker() {
  const { caps, doQuote, fullPoem, progress } = useStudio();
  const [picked, setPicked] = useState([]); // keys "stanza:line"
  const [format, setFormat] = useState("poster");
  const stanzas = fullPoem?.stanzas || [];
  const total = stanzas.flat().filter((l) => l !== "").length;
  const toggle = (k) =>
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  // selection in SOURCE order, carrying the exact source text (the validator re-checks it byte for byte)
  const selection = stanzas.flatMap((st, s) =>
    st
      .map((text, l) => ({ stanza: s, line: l, text }))
      .filter((x) => x.text !== "" && picked.includes(`${x.stanza}:${x.line}`)),
  );
  const tooMany = selection.length > QUOTE_MAX_LINES;
  const busy = progress !== null;
  if (!stanzas.length) return null;
  return (
    <fieldset className="grid gap-2" aria-label="Quote (excerpt)">
      <legend className="pms-lbl">Quote (excerpt)</legend>
      <p className="text-xs" style={{ color: "var(--mute)" }}>
        Pick whole lines to share as an excerpt. It is labelled as an excerpt,
        never as the full poem.
      </p>
      <div className="grid max-h-56 gap-1 overflow-auto rounded border p-2">
        {stanzas.map((st, s) => (
          <div key={s} className="grid gap-1">
            {st.map((text, l) =>
              text === "" ? null : (
                <label key={l} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={picked.includes(`${s}:${l}`)}
                    onChange={() => toggle(`${s}:${l}`)}
                  />
                  <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>
                </label>
              ),
            )}
            {s < stanzas.length - 1 && <hr style={{ opacity: 0.3 }} />}
          </div>
        ))}
      </div>
      <p className="text-xs" role="status" data-coverage="partial">
        Excerpt: {selection.length} of {total} lines (partial)
        {tooMany ? ` — at most ${QUOTE_MAX_LINES} lines` : ""}
      </p>
      <Field label="Quote format">
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          {Object.entries(FORMAT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Btn
          disabled={busy || !selection.length || tooMany}
          onClick={() => doQuote(selection, format, "image")}
        >
          Export quote PNG (excerpt)
        </Btn>
        <Btn
          disabled={busy || !selection.length || tooMany || !caps?.mp4}
          onClick={() => doQuote(selection, format, "video")}
        >
          Export animated quote MP4 (excerpt)
        </Btn>
      </div>
    </fieldset>
  );
}
