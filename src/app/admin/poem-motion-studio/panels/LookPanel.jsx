"use client";
import { templateById } from "@/lib/motion-studio/templates";
import { selectableFonts, resolveFonts, CANDIDATE_TOGGLE_LABEL, fontWeights, realWeight, longPoemFontWarning, fontLabel } from "@/lib/motion-studio/font-registry";
import { FONT_PAIRINGS, applyPairing, currentPairing, pairingTitle } from "@/lib/motion-studio/font-pairings";
import { BG_MOTION, PARTICLES, TEXT_IN } from "@/lib/motion-studio/composition";

import SignaturePanel from "./SignaturePanel";
import MaterialPanel from "./MaterialPanel";
import MotionPanel from "./MotionPanel";
import TemplatePicker from "../TemplatePicker";
import MoreLooks from "./MoreLooks";
import { Btn, Field, Range } from "../studio-ui";
import { useStudio } from "../studio-context";
import FontCompare from "./FontCompare";

const WEIGHT_NAMES = { 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold" };
/** Real weights of a font inside the composition whitelist (never a synthesised bold). */
const realWeights = (id) => fontWeights(id).filter((w) => w >= 400 && w <= 700);
/** Font change: keep the weight if the new font has it, otherwise snap to its nearest real weight. */
const setFont = (c, id) => {
  c.style.font = id;
  const ws = realWeights(id);
  if (ws.length && !ws.includes(c.style.weight)) c.style.weight = realWeight(id, c.style.weight);
  if (ws.length && !ws.includes(c.style.weight)) c.style.weight = ws[0];
  delete c.notices;
  return c;
};

const PARTICLE_LABELS = { none: "None", dust: "Floating dust", rain: "Rain", stars: "Stars", light: "Golden motes", mist: "Drifting mist", bokeh: "Soft bokeh", leak: "Light leak", sweep: "Light sweep", ripple: "Water ripple", snow: "Soft snow" };

export default function LookPanel() {
  const {
    comp,
    fontTick,
    mode,
    pickTemplate,
    update,
  } = useStudio();
  const lineCount = comp.scenes.filter((x) => x.kind !== "title").reduce((n, x) => n + x.lines.length, 0);
  const longWarn = longPoemFontWarning(comp.style, lineCount);
  const weights = realWeights(comp.style.font);
  const pairing = currentPairing(comp.style);
  return (
<>
                  <fieldset>
                    <legend className="pms-lbl">Format</legend>
                    <div className="flex flex-wrap gap-2">
                      {["reel", "story", "poster", "square"].map((f) => (
                        <Btn
                          key={f}
                          aria-pressed={comp.format === f}
                          onClick={() => update((c) => ({ ...c, format: f }))}
                        >
                          {f[0].toUpperCase() + f.slice(1)}
                        </Btn>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="pms-lbl">Template</legend>
                    <TemplatePicker comp={comp} tick={fontTick} onPick={pickTemplate} />
                  </fieldset>
                  <MoreLooks comp={comp} tick={fontTick} onPick={pickTemplate} />
                  <MaterialPanel />
                  <MotionPanel />

                  {mode === "advanced" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <fieldset className="sm:col-span-2">
                        <legend className="pms-lbl">Font pairing</legend>
                        <div className="pms-chips" role="group" aria-label="Font pairings">
                          {FONT_PAIRINGS.map((p) => (
                            <Btn
                              key={p.id}
                              aria-pressed={pairing === p.id}
                              title={`${pairingTitle(p)} · ${p.mood}`}
                              onClick={() => update((c) => applyPairing(c, p.id))}
                            >
                              {p.label}
                            </Btn>
                          ))}
                        </div>
                        <p className="text-xs" style={{ color: "var(--mute)" }}>
                          A pairing changes only the fonts, weight, line height and alignment, never your poem or background.
                        </p>
                      </fieldset>
                      <Field label="Font">
                        <select
                          aria-label="Font"
                          className="pms-field"
                          value={comp.style.font}
                          onChange={(e) => update((c) => setFont(c, e.target.value))}
                        >
                          {selectableFonts({ preview: comp.fontPreview === true }).map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <label className="flex items-center gap-2 text-sm sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={comp.fontPreview === true}
                          onChange={(e) =>
                            update((c) => {
                              const on = e.target.checked;
                              // turning it off replaces any candidate font with the template font, with a notice
                              const r = resolveFonts({ font: c.style.font, titleFont: c.style.titleFont, preview: on, fallback: templateById(c.templateId).style.font });
                              c.style.font = r.font;
                              if (r.titleFont) c.style.titleFont = r.titleFont;
                              else delete c.style.titleFont;
                              if (on) c.fontPreview = true;
                              else delete c.fontPreview;
                              if (Object.keys(r.notices).length) c.notices = r.notices;
                              else delete c.notices;
                              return c;
                            })
                          }
                        />
                        {CANDIDATE_TOGGLE_LABEL}
                      </label>
                        <Field label="Title font">
                          <select
                            aria-label="Title font"
                            className="pms-field"
                            value={comp.style.titleFont || ""}
                            onChange={(e) =>
                              update((c) => {
                                if (e.target.value) c.style.titleFont = e.target.value;
                                else delete c.style.titleFont;
                                return c;
                              })
                            }
                          >
                            <option value="">Same as poem font</option>
                            {selectableFonts({ preview: comp.fontPreview === true, role: "title" }).map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                      <Field label="Weight" hint={weights.length <= 1 ? `${fontLabel(comp.style.font)} has one real weight.` : undefined}>
                        <select
                          aria-label="Weight"
                          className="pms-field"
                          value={comp.style.weight}
                          onChange={(e) =>
                            update((c) => {
                              c.style.weight = Number(e.target.value);
                              return c;
                            })
                          }
                        >
                          {weights.map((w) => (
                            <option key={w} value={w}>
                              {WEIGHT_NAMES[w]} ({w})
                            </option>
                          ))}
                          {!weights.includes(comp.style.weight) && (
                            <option value={comp.style.weight}>{comp.style.weight} (saved; drawn at {realWeight(comp.style.font, comp.style.weight)})</option>
                          )}
                        </select>
                      </Field>
                      {(comp.fontPreview === true || comp.notices) && (
                        <p role="status" className="text-sm sm:col-span-2" style={{ color: "var(--err-ink)" }}>
                          {[comp.notices?.unverifiedFont, comp.notices?.displayOnlyFont]
                            .filter(Boolean)
                            .join(" ")}
                          {comp.fontPreview === true &&
                            " Candidate fonts are NOT reviewed for Tamil: every export with one is marked “Font review: unreviewed”."}
                        </p>
                      )}
                      <div className="sm:col-span-2">
                        <FontCompare
                          poemLines={comp.scenes.filter((x) => x.kind !== "title").flatMap((x) => x.lines)}
                          current={comp.style.font}
                          currentTitle={comp.style.titleFont}
                          previewOn={comp.fontPreview === true}
                          onUse={(id) => update((c) => setFont(c, id))}
                          onUseTitle={(id) =>
                            update((c) => {
                              if (id === c.style.font) delete c.style.titleFont;
                              else c.style.titleFont = id;
                              return c;
                            })
                          }
                        />
                      </div>
                      <Range
                        label="Font size"
                        value={comp.style.sizePx}
                        min={16}
                        max={140}
                        step={1}
                        onChange={(v) =>
                          update((c) => {
                            c.style.sizePx = v;
                            return c;
                          }, "size")
                        }
                        fmt={(v) => `${v}px`}
                      />
                      <Range
                        label="Line height"
                        value={comp.style.lineHeight}
                        min={1.2}
                        max={2.4}
                        step={0.05}
                        onChange={(v) =>
                          update((c) => {
                            c.style.lineHeight = v;
                            return c;
                          }, "lh")
                        }
                        fmt={(v) => v.toFixed(2)}
                      />
                      <Range
                        label="Text width"
                        value={comp.style.widthPct}
                        min={50}
                        max={100}
                        step={1}
                        onChange={(v) =>
                          update((c) => {
                            c.style.widthPct = v;
                            return c;
                          }, "width")
                        }
                        fmt={(v) => `${v}%`}
                      />
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!comp.style.shadow}
                          onChange={(e) =>
                            update((c) => {
                              c.style.shadow = e.target.checked;
                              return c;
                            })
                          }
                        />
                        Text shadow
                      </label>
                      {longWarn && (
                        <p role="status" className="text-sm sm:col-span-2" style={{ color: "var(--warn-ink)" }}>
                          {longWarn}
                        </p>
                      )}
                      <Field label="Alignment">
                        <select
                          aria-label="Alignment"
                          className="pms-field"
                          value={comp.style.align}
                          onChange={(e) =>
                            update((c) => {
                              c.style.align = e.target.value;
                              return c;
                            })
                          }
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </Field>
                      <Field label="Vertical position">
                        <select
                          aria-label="Vertical position"
                          className="pms-field"
                          value={comp.style.vAlign}
                          onChange={(e) =>
                            update((c) => {
                              c.style.vAlign = e.target.value;
                              return c;
                            })
                          }
                        >
                          <option value="top">Top</option>
                          <option value="middle">Middle</option>
                          <option value="bottom">Bottom</option>
                        </select>
                      </Field>
                      <Field label="Text colour">
                        <input
                          aria-label="Text colour"
                          type="color"
                          className="pms-field"
                          value={comp.style.color}
                          onChange={(e) =>
                            update((c) => {
                              c.style.color = e.target.value;
                              return c;
                            }, "color")
                          }
                        />
                      </Field>
                      <Field label="Text appears">
                        <select
                          aria-label="Text appears"
                          className="pms-field"
                          value={comp.motion.textIn}
                          onChange={(e) =>
                            update((c) => {
                              c.motion.textIn = e.target.value;
                              return c;
                            })
                          }
                        >
                          {TEXT_IN.map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                          {!TEXT_IN.includes(comp.motion.textIn) && (
                            <option value={comp.motion.textIn}>{comp.motion.textIn} (see Text animation)</option>
                          )}
                        </select>
                      </Field>
                      <Field label="Background motion">
                        <select
                          aria-label="Background motion"
                          className="pms-field"
                          value={comp.motion.bgMotion}
                          onChange={(e) =>
                            update((c) => {
                              c.motion.bgMotion = e.target.value;
                              return c;
                            })
                          }
                        >
                          {BG_MOTION.map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Particles">
                        <select
                          aria-label="Particles"
                          className="pms-field"
                          value={comp.style.particles}
                          onChange={(e) =>
                            update((c) => {
                              c.style.particles = e.target.value;
                              return c;
                            })
                          }
                        >
                          {PARTICLES.map((k) => (
                            <option key={k} value={k}>{PARTICLE_LABELS[k] || k}</option>
                          ))}
                        </select>
                      </Field>
                      <Range
                        label="Vignette"
                        value={comp.style.vignette}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(v) =>
                          update((c) => {
                            c.style.vignette = v;
                            return c;
                          }, "vig")
                        }
                        fmt={(v) => v.toFixed(2)}
                      />
                      <Range
                        label="Dust specks"
                        value={comp.style.grain}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(v) =>
                          update((c) => {
                            c.style.grain = v;
                            return c;
                          }, "grain")
                        }
                        fmt={(v) => v.toFixed(2)}
                      />
                      <SignaturePanel />
                    </div>
                  )}
                </>
  );
}
