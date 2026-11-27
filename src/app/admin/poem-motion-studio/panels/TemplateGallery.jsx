"use client";
// Template gallery for Quick Create: search, All / Favourites / Recent filter, favourite toggles (prefs-backed).
// Memoised list (pure galleryList, capped at MAX_GALLERY); each card draws the real renderer via TemplatePicker's Thumb.
import { memo, useMemo, useState } from "react";
import { TEMPLATES } from "@/lib/motion-studio/templates";
import { galleryList } from "@/lib/motion-studio/quick-create";
import { Thumb, sampleScenes } from "../TemplatePicker";

const FILTERS = [
  ["all", "All"],
  ["favourites", "Favourites"],
  ["recent", "Recent"],
];

const Card = memo(function Card({ tpl, on, fav, scenes, onPick, onFav }) {
  return (
    <li className="pms-gcard" data-on={on ? "true" : "false"}>
      <button
        type="button"
        className="pms-gpick"
        aria-pressed={on}
        onClick={() => onPick(tpl.id)}
        aria-label={`Use the ${tpl.name} template`}
      >
        <Thumb id={tpl.id} scenes={scenes} width={72} tick={0} />
        <span className="mt-1 block text-sm font-semibold">{tpl.name}</span>
        <span className="block text-xs" style={{ color: "var(--mute)" }}>
          {tpl.mood}
        </span>
      </button>
      <button
        type="button"
        className="pms-gfav"
        aria-pressed={fav}
        aria-label={
          fav
            ? `Remove ${tpl.name} from favourites`
            : `Add ${tpl.name} to favourites`
        }
        onClick={() => onFav(tpl.id, !fav)}
      >
        <span aria-hidden="true">{fav ? "★" : "☆"}</span>
      </button>
    </li>
  );
});

export default function TemplateGallery({
  value,
  onChange,
  favourites,
  recent,
  onFavourite,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const scenes = useMemo(() => sampleScenes(null), []);
  const list = useMemo(
    () => galleryList(TEMPLATES, { query, filter, favourites, recent }),
    [query, filter, favourites, recent],
  );
  return (
    <div role="group" aria-label="Choose a look" className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1" style={{ minWidth: 160 }}>
          <span className="pms-lbl">Search looks</span>
          <input
            type="search"
            className="pms-field"
            value={query}
            maxLength={80}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="rain, warm, minimal…"
          />
        </label>
        <div className="pms-chips" role="group" aria-label="Show looks">
          {FILTERS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              className="pms-btn"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <p role="status" className="text-sm" style={{ color: "var(--mute)" }}>
          {filter === "favourites"
            ? "No favourite looks yet. Use the star on a card."
            : filter === "recent"
              ? "No recently used looks yet."
              : "No look matches that search."}
        </p>
      ) : (
        <ul className="pms-gallery" aria-label="Template gallery">
          {list.map((t) => (
            <Card
              key={t.id}
              tpl={t}
              on={value === t.id}
              fav={favourites.includes(t.id)}
              scenes={scenes}
              onPick={onChange}
              onFav={onFavourite}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
