"use client";
import { FONT_KEYS, FONT_LABELS } from "@/lib/motion-studio/templates";
import { BG_MOTION, PARTICLES, TEXT_IN } from "@/lib/motion-studio/composition";
import SignaturePanel from "./SignaturePanel";
import TemplatePicker from "../TemplatePicker";
import { Btn, Field, Range } from "../studio-ui";
import { useStudio } from "../studio-context";

export default function LookPanel() {
  const {
    comp,
    fontTick,
    mode,
    pickTemplate,
    update,
  } = useStudio();
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
                  {mode === "advanced" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Font">
                        <select
                          aria-label="Font"
                          className="pms-field"
                          value={comp.style.font}
                          onChange={(e) =>
                            update((c) => {
                              c.style.font = e.target.value;
                              return c;
                            })
                          }
                        >
                          {FONT_KEYS.map((k) => (
                            <option key={k} value={k}>
                              {FONT_LABELS[k]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Range
                        label="Font size"
                        value={comp.style.sizePx}
                        min={28}
                        max={140}
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
                            <option key={k}>{k}</option>
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
                        label="Film grain"
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
