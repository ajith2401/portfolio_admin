"use client";
// Quick Create: poem (type/paste, or a read-only Portfolio writing) -> output (formats.js ROUTES) -> look (gallery) ->
// Create. Creation goes through the Studio's existing pick()/startManual() path; nothing here edits the poem text.
// QuickCreateCheck then shows the readability notice and the chosen route's OWN validator result (fonts ensured first)
// before its Export button is enabled. The export itself is the existing guarded handler (fonts + validators again).
import { useEffect, useMemo, useState } from "react";
import { parsePoemText } from "@/lib/motion-studio/poem-input";
import { routeById } from "@/lib/motion-studio/formats";
import {
  quickRoutes,
  routeKindLabel,
  gateRoute,
  routeInput,
  formatForRoute,
} from "@/lib/motion-studio/quick-create";
import { Btn } from "../studio-ui";
import { useStudio } from "../studio-context";
import TemplateGallery from "./TemplateGallery";

const ROUTE_LIST = quickRoutes();

export default function QuickCreate({
  writings,
  prefs,
  onFavourite,
  onCreate,
}) {
  const [from, setFrom] = useState("text");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [writingId, setWritingId] = useState("");
  const [routeId, setRouteId] = useState(() =>
    routeById(prefs.lastRoute) && !routeById(prefs.lastRoute).excerpt
      ? prefs.lastRoute
      : "reel-mp4",
  );
  const [templateId, setTemplateId] = useState(
    prefs.recentTemplates[0] || "ink-silence",
  );
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parsePoemText(text, { title }), [text, title]);
  const issues = [];
  if (from === "text" && !parsed.stanzas.length)
    issues.push("Write or paste the poem first.");
  else if (from === "text" && !parsed.ok)
    issues.push(...parsed.issues.slice(0, 5).map((i) => i.message));
  if (from === "writing" && !writingId) issues.push("Choose a Portfolio poem.");
  const create = async () => {
    if (issues.length || busy) return;
    setBusy(true);
    try {
      await onCreate(
        from === "writing"
          ? { kind: "writing", id: writingId }
          : { kind: "manual", text, title },
        { routeId, templateId },
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="pms-card mt-3 space-y-4"
      aria-label="Quick Create"
      role="region"
    >
      <div>
        <h3 className="font-semibold">1. Your poem</h3>
        <div className="pms-chips mt-1" role="group" aria-label="Poem source">
          <Btn aria-pressed={from === "text"} onClick={() => setFrom("text")}>
            Type or paste
          </Btn>
          <Btn
            aria-pressed={from === "writing"}
            onClick={() => setFrom("writing")}
          >
            From Portfolio
          </Btn>
        </div>
        {from === "text" ? (
          <div className="mt-2 space-y-2">
            <label className="block">
              <span className="pms-lbl">Title for Quick Create</span>
              <input
                className="pms-field"
                lang="ta"
                value={title}
                maxLength={300}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="pms-lbl">Quick Create poem</span>
              <textarea
                className="pms-field"
                lang="ta"
                rows={8}
                value={text}
                placeholder={"ஒரு வரி\nஅடுத்த வரி\n\n(blank line = new stanza)"}
                style={{
                  fontSize: 16,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                  resize: "vertical",
                  paddingTop: 8,
                }}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
          </div>
        ) : (
          <label className="mt-2 block">
            <span className="pms-lbl">
              Portfolio poem for Quick Create (read-only)
            </span>
            <select
              className="pms-field"
              value={writingId}
              onChange={(e) => setWritingId(e.target.value)}
            >
              <option value="">Choose a poem…</option>
              {writings.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div>
        <h3 className="font-semibold">2. What to make</h3>
        <div className="pms-routes mt-1" role="group" aria-label="Output">
          {ROUTE_LIST.map((r) => (
            <button
              key={r.id}
              type="button"
              className="pms-btn"
              aria-pressed={routeId === r.id}
              onClick={() => setRouteId(r.id)}
            >
              <span className="block">{r.label}</span>
              <span className="block text-xs opacity-80">
                {routeKindLabel(r.kind)}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <h3 className="font-semibold">3. Look</h3>
        <TemplateGallery
          value={templateId}
          onChange={setTemplateId}
          favourites={prefs.favouriteTemplates}
          recent={prefs.recentTemplates}
          onFavourite={onFavourite}
        />
      </div>
      {issues.length > 0 && (
        <ul
          role="status"
          className="list-disc rounded-lg p-3 pl-7 text-sm"
          style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }}
        >
          {issues.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      <p className="text-xs" style={{ color: "var(--mute)" }}>
        Your words are used exactly as written. Nothing is saved to your
        Portfolio or Admin until you choose to.
      </p>
      <Btn primary disabled={issues.length > 0 || busy} onClick={create}>
        Create
      </Btn>
    </div>
  );
}

const EXPORTS = {
  "reel-mp4": (s) => s.doVideo(),
  "story-mp4": (s) => s.doVideo(),
  "square-mp4": (s) => s.doVideo(),
  "reel-cover": (s) => s.doCover("image/png"),
  poster: (s) => s.doPoster("image/png", false),
  "poster-set": (s) => s.doPoster("image/png", true),
  carousel: (s) => s.doCarousel("image/png"),
  "story-stills": (s) => s.doStory("image/png"),
  "full-poem": (s) => s.doFull("image/png", 1),
};

/** The pre-export check for the route chosen in Quick Create (validator messages live in a role=status region). */
export function QuickCreateCheck({ routeId, onDone }) {
  const s = useStudio();
  const { comp, fullPoem, fullPreset, fullHeight, fontsReady, progress } = s;
  const route = routeById(routeId);
  const [result, setGate] = useState(null);
  // video exports draw in the composition's own format; stills/posters/full-poem choose their own canvas
  const formatOk = !route || route.kind !== "video" || formatForRoute(route) === comp?.format;
  useEffect(() => {
    if (!comp || !route) return;
    let dead = false;
    const h = setTimeout(async () => {
      const ctx =
        typeof document !== "undefined"
          ? document.createElement("canvas").getContext("2d")
          : null;
      const g = await gateRoute(
        routeId,
        comp,
        routeInput(routeId, {
          fullPoem,
          preset: fullPreset,
          height: fullHeight,
        }),
        {
          ctx,
          ensureFonts: () => fontsReady(),
        },
      );
      if (!dead) setGate({ ...g, comp, routeId });
    }, 250);
    return () => {
      dead = true;
      clearTimeout(h);
    };
  }, [comp, routeId, fullPoem, fullPreset, fullHeight]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!route || !comp) return null;
  // a result for an older composition/route is never shown as current: it reads "Checking…" until re-run
  const gate = result && result.comp === comp && result.routeId === routeId ? result : null;
  const allowed = gate?.allowed && formatOk;
  return (
    <section
      className="pms-card mt-3 space-y-2"
      aria-label="Quick Create check"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Ready to export: {route.label}</h3>
        <Btn onClick={onDone} aria-label="Hide the Quick Create check">
          Hide check
        </Btn>
      </div>
      <div role="status" aria-live="polite" className="text-sm">
        {!gate ? (
          <p>Checking fonts and readability for {route.label}…</p>
        ) : allowed ? (
          <p style={{ color: "var(--ok-ink)" }}>
            All lines fit and are readable for {route.label}.
          </p>
        ) : (
          <div
            className="rounded-lg p-2"
            style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }}
          >
            <p className="font-semibold">
              {route.label} can still be exported — it will adjust itself and tell you what changed.
            </p>
            <ul className="mt-1 list-disc pl-5">
              {!formatOk && (
                <li>
                  The format was changed after Quick Create; the video uses the
                  current format ({comp.format}).
                </li>
              )}
              {(gate.messages || []).slice(0, 8).map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        {gate?.allowed && gate.messages.length > 0 && (
          <ul
            className="mt-1 list-disc pl-5"
            style={{ color: "var(--warn-ink)" }}
          >
            {gate.messages.slice(0, 8).map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </div>
      <Btn
        primary
        disabled={progress !== null}
        onClick={() => EXPORTS[routeId]?.(s)}
      >
        Export {route.label}
      </Btn>
    </section>
  );
}
