// src/app/studio/Controls.jsx
"use client";
import { FONTS } from "./fonts";
import {
  EDITIONS,
  PAPERS,
  ASPECTS,
  END_MARKS,
  physicalityLabel,
} from "./presets";
import { autoFontSize } from "./lib";
import {
  Section,
  Field,
  TextInput,
  TextArea,
  Slider,
  Segmented,
  SwatchGrid,
  Toggle,
  Disclosure,
  RadioCards,
} from "./ui";

// The left rail, ordered by the restraint principle: a poet makes a few good
// decisions (poem, edition, paper, physicality) on the surface; the fine
// typographic controls wait under "Print details" for when they're wanted.
export default function Controls({ settings, patch }) {
  const set = (k) => (v) => patch({ [k]: v });

  const applyEdition = (ed) => patch({ edition: ed.id, ...ed.patch });

  const runAutoFit = () => {
    const { w, h } = ASPECTS[settings.aspect];
    patch({
      fontSize: autoFontSize(settings.text, {
        w,
        h,
        padding: settings.padding,
        lineHeight: settings.lineHeight,
        stanzaSpacing: settings.stanzaSpacing,
      }),
    });
  };

  const tamilFonts = FONTS.filter((f) => f.script === "tamil");
  const latinFonts = FONTS.filter((f) => f.script === "latin");

  return (
    <div>
      {/* Content */}
      <Section title="The poem">
        <Field label="Text" hint="line breaks & stanzas preserved">
          <TextArea
            rows={7}
            value={settings.text}
            onChange={(e) => patch({ text: e.target.value })}
            placeholder="உங்கள் கவிதை இங்கே…"
            style={{ fontFamily: "var(--font-tiro-tamil)" }}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title">
            <TextInput
              value={settings.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </Field>
          <Field label="Author">
            <TextInput
              value={settings.author}
              onChange={(e) => patch({ author: e.target.value })}
              placeholder="optional"
            />
          </Field>
        </div>
      </Section>

      {/* Editions */}
      <Section title="Edition">
        <RadioCards
          items={EDITIONS}
          value={settings.edition}
          onChange={(id) => applyEdition(EDITIONS.find((e) => e.id === id))}
        />
      </Section>

      {/* Paper */}
      <Section title="Paper">
        <SwatchGrid
          items={PAPERS}
          value={settings.paperId}
          onChange={(id) =>
            patch({
              paperId: id,
              textColor: PAPERS.find((p) => p.id === id).ink,
            })
          }
          renderSwatch={(p) => (
            <span
              className="block h-full w-full"
              style={{ background: p.base }}
            />
          )}
        />
      </Section>

      {/* Physicality — the master slider. */}
      <Section title="Physicality">
        <Field
          label={physicalityLabel(settings.physicality)}
          hint="paper, ink, show-through, wear"
        >
          <Slider
            value={settings.physicality}
            min={0}
            max={1}
            step={0.01}
            onChange={set("physicality")}
            format={(v) => `${Math.round(v * 100)}`}
          />
        </Field>
        <p className="text-xs leading-relaxed text-stone-400">
          Left is a clean digital proof; right is a well-thumbed library copy.
          One move, dozens of quiet adjustments.
        </p>
      </Section>

      {/* Everything else, tucked away. */}
      <Disclosure title="Print details">
        <Field label="Show on page">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Toggle
              label="Title"
              checked={settings.showTitle}
              onChange={set("showTitle")}
            />
            <Toggle
              label="Author"
              checked={settings.showAuthor}
              onChange={set("showAuthor")}
            />
            <Toggle
              label="Page number"
              checked={settings.showFolio}
              onChange={set("showFolio")}
            />
            <Toggle
              label="Running footer"
              checked={settings.showFooter}
              onChange={set("showFooter")}
            />
            <Toggle
              label="Backside show-through"
              checked={settings.showGhost}
              onChange={set("showGhost")}
            />
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Page number">
            <TextInput
              value={settings.pageNumber}
              onChange={(e) => patch({ pageNumber: e.target.value })}
            />
          </Field>
          <Field label="Running footer">
            <TextInput
              value={settings.footer}
              onChange={(e) => patch({ footer: e.target.value })}
              placeholder="book / section"
            />
          </Field>
        </div>

        <Field label="End mark">
          <Segmented
            value={settings.endMark}
            onChange={set("endMark")}
            options={END_MARKS.map((m) => ({
              value: m.id,
              label: m.glyph || "—",
            }))}
          />
        </Field>

        <Field label="Font">
          <select
            value={settings.fontId}
            onChange={(e) => patch({ fontId: e.target.value })}
            className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
          >
            <optgroup label="Tamil">
              {tamilFonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                  {f.note ? ` · ${f.note}` : ""}
                </option>
              ))}
            </optgroup>
            <optgroup label="Latin">
              {latinFonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>

        <Field label="Size" hint="auto-fit available">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Slider
                value={settings.fontSize}
                min={20}
                max={96}
                onChange={set("fontSize")}
                format={(v) => `${v}px`}
              />
            </div>
            <button
              type="button"
              onClick={runAutoFit}
              className="shrink-0 rounded-md border border-stone-200 px-2.5 py-1 text-[11px] font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-800"
            >
              Auto-fit
            </button>
          </div>
        </Field>

        <Field label="Weight">
          <Segmented
            value={settings.fontWeight}
            onChange={set("fontWeight")}
            options={[
              { value: 300, label: "Light" },
              { value: 400, label: "Regular" },
              { value: 500, label: "Medium" },
              { value: 700, label: "Bold" },
            ]}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Poem align">
            <Segmented
              value={settings.textAlign}
              onChange={set("textAlign")}
              options={[
                { value: "left", label: "L" },
                { value: "center", label: "C" },
                { value: "right", label: "R" },
              ]}
            />
          </Field>
          <Field label="Title align">
            <Segmented
              value={settings.titleAlign}
              onChange={set("titleAlign")}
              options={[
                { value: "left", label: "L" },
                { value: "center", label: "C" },
                { value: "right", label: "R" },
              ]}
            />
          </Field>
        </div>

        <Field label="Line height">
          <Slider
            value={settings.lineHeight}
            min={1.1}
            max={2.6}
            step={0.05}
            onChange={set("lineHeight")}
            format={(v) => v.toFixed(2)}
          />
        </Field>
        <Field label="Stanza spacing" hint="gap between verses">
          <Slider
            value={settings.stanzaSpacing}
            min={0}
            max={3}
            step={0.1}
            onChange={set("stanzaSpacing")}
            format={(v) => `${v.toFixed(1)}em`}
          />
        </Field>
        <Field label="Letter spacing" hint="Latin only — avoid for Tamil">
          <Slider
            value={settings.letterSpacing}
            min={-0.05}
            max={0.4}
            step={0.01}
            onChange={set("letterSpacing")}
            format={(v) => `${v.toFixed(2)}em`}
          />
        </Field>

        <Field label="Ink">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={settings.textColor}
              onChange={(e) => patch({ textColor: e.target.value })}
              className="h-9 w-12 cursor-pointer rounded border border-stone-200 bg-white p-0.5"
            />
            <TextInput
              value={settings.textColor}
              onChange={(e) => patch({ textColor: e.target.value })}
              className="flex-1"
            />
          </div>
        </Field>

        <Field label="Binding">
          <Toggle
            label="Gutter margin"
            checked={settings.gutter}
            onChange={set("gutter")}
          />
        </Field>
        {settings.gutter && (
          <Field label="Page side" hint="widens the inner margin">
            <Segmented
              value={settings.pageSide}
              onChange={set("pageSide")}
              options={[
                { value: "recto", label: "Recto ›" },
                { value: "verso", label: "‹ Verso" },
              ]}
            />
          </Field>
        )}

        <Field label="Aspect ratio">
          <Segmented
            value={settings.aspect}
            onChange={set("aspect")}
            options={Object.values(ASPECTS).map((a) => ({
              value: a.id,
              label: a.label,
            }))}
          />
        </Field>
        <Field label="Margins">
          <Slider
            value={settings.padding}
            min={60}
            max={300}
            step={4}
            onChange={set("padding")}
            format={(v) => `${v}px`}
          />
        </Field>
      </Disclosure>
    </div>
  );
}
