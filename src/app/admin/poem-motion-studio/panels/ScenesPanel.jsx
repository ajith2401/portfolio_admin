"use client";
import { useState } from "react";
import * as E from "@/lib/motion-studio/scene-edit";
import { Btn, Field, Range } from "../studio-ui";
import { useStudio } from "../studio-context";
import { FitScenesButton } from "./FitScenesDialog";

export default function ScenesPanel() {
  const {
    S,
    comp,
    flash,
    poemMissing,
    seekScene,
    setScenes,
    setSel,
  } = useStudio();
  // an over-long line edit is refused as a whole (never cut); the message stays under that line until the next edit
  const [lineErr, setLineErr] = useState(null);
  return (
<section aria-label="Scenes">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">
                      Scenes ({comp.scenes.length})
                    </h2>
                    <FitScenesButton />
                    <Btn
                      onClick={() => {
                        if (comp.originalScenes.length) {
                          setScenes(() => structuredClone(comp.originalScenes));
                          flash(
                            "ok",
                            "Restored the original automatic arrangement.",
                          );
                        }
                      }}
                      disabled={!comp.originalScenes.length}
                    >
                      Restore original arrangement
                    </Btn>
                  </div>
                  {poemMissing.length > 0 && (
                    <p
                      role="alert"
                      className="mt-2 rounded-lg px-3 py-2 text-sm"
                      style={{
                        background: "var(--warn-bg)",
                        color: "var(--warn-ink)",
                      }}
                    >
                      {poemMissing.length} line(s) from the poem are not in any
                      scene: “{poemMissing[0]}”
                      {poemMissing.length > 1 ? "…" : ""}
                    </p>
                  )}
                  <ol className="mt-2 space-y-3">
                    {comp.scenes.map((s, i) => (
                      <li
                        key={s.id}
                        className="pms-card"
                        style={
                          i === S
                            ? {
                                borderColor: "var(--accent)",
                                boxShadow: "0 0 0 2px var(--accent)",
                              }
                            : undefined
                        }
                        aria-current={i === S ? "true" : undefined}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            className="pms-btn"
                            onClick={() => seekScene(i)}
                            aria-label={`Preview scene ${i + 1}`}
                          >
                            {i === S ? "● " : ""}Scene {i + 1} ·{" "}
                            {s.kind === "title" ? "Title" : "Stanza"} ·{" "}
                            {(s.durationMs / 1000).toFixed(1)}s
                          </button>
                          <div className="flex gap-1">
                            <Btn
                              aria-label={`Move scene ${i + 1} up`}
                              disabled={i === 0}
                              onClick={() => {
                                setScenes((x) => E.moveScene(x, i, -1));
                                setSel(i - 1);
                              }}
                            >
                              ↑
                            </Btn>
                            <Btn
                              aria-label={`Move scene ${i + 1} down`}
                              disabled={i === comp.scenes.length - 1}
                              onClick={() => {
                                setScenes((x) => E.moveScene(x, i, 1));
                                setSel(i + 1);
                              }}
                            >
                              ↓
                            </Btn>
                          </div>
                        </div>
                        <div className="mt-2 space-y-2">
                          {s.lines.map((l, li) => (
                            <div key={li}>
                            <div className="flex items-center gap-1">
                              <input
                                aria-label={`Scene ${i + 1} line ${li + 1}`}
                                aria-invalid={lineErr?.key === `${s.id}:${li}` || undefined}
                                aria-describedby={lineErr?.key === `${s.id}:${li}` ? `line-err-${i}-${li}` : undefined}
                                className="pms-field"
                                lang="ta"
                                value={l}
                                onFocus={() => setSel(i)}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const err = E.lineEditError(v);
                                  if (err) return setLineErr({ key: `${s.id}:${li}`, msg: err }); // previous text kept
                                  setLineErr(null);
                                  setScenes(
                                    (x) => E.editLine(x, i, li, v),
                                    `line-${i}-${li}`,
                                  );
                                }}
                              />
                              <select
                                aria-label={`Move scene ${i + 1} line ${li + 1} to`}
                                className="pms-field"
                                style={{ width: 92 }}
                                value=""
                                onChange={(e) => {
                                  if (e.target.value !== "")
                                    setScenes((x) =>
                                      E.moveLine(
                                        x,
                                        i,
                                        li,
                                        Number(e.target.value),
                                        1e6,
                                      ),
                                    );
                                }}
                              >
                                <option value="">Move…</option>
                                {comp.scenes.map(
                                  (_, j) =>
                                    j !== i && (
                                      <option key={j} value={j}>
                                        → Scene {j + 1}
                                      </option>
                                    ),
                                )}
                              </select>
                              {li > 0 && (
                                <Btn
                                  aria-label={`Split scene ${i + 1} before line ${li + 1}`}
                                  onClick={() =>
                                    setScenes((x) => E.splitScene(x, i, li))
                                  }
                                >
                                  Split
                                </Btn>
                              )}
                            </div>
                            {lineErr?.key === `${s.id}:${li}` && (
                              <p
                                id={`line-err-${i}-${li}`}
                                role="alert"
                                className="mt-1 text-sm"
                                style={{ color: "var(--warn-ink)" }}
                              >
                                {lineErr.msg}
                              </p>
                            )}
                            </div>
                          ))}
                        </div>
                        {comp?.motion?.writing?.mode && comp.motion.writing.mode !== "none" && (
                          <label className="mt-2 flex items-center gap-2 text-sm" style={{ minHeight: 44 }}>
                            <input
                              type="checkbox"
                              checked={!!s.noWrite}
                              onChange={(e) =>
                                setScenes(
                                  (x) =>
                                    x.map((sc, j) => {
                                      if (j !== i) return sc;
                                      const n = { ...sc };
                                      if (e.target.checked) n.noWrite = true;
                                      else delete n.noWrite;
                                      return n;
                                    }),
                                  `nowrite-${i}`,
                                )
                              }
                            />
                            Scene {i + 1}: no writing (uses the normal text animation)
                          </label>
                        )}
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <Range
                            label={`Scene ${i + 1} seconds`}
                            value={s.durationMs / 1000}
                            min={3}
                            max={12}
                            step={0.5}
                            onChange={(v) =>
                              setScenes(
                                (x) => E.setDuration(x, i, v * 1000),
                                `dur-${i}`,
                              )
                            }
                            fmt={(v) => `${v}s`}
                          />
                          <Range
                            label={`Scene ${i + 1} text position`}
                            value={s.offsetY || 0}
                            min={-30}
                            max={30}
                            onChange={(v) =>
                              setScenes(
                                (x) =>
                                  E.setScenePresentation(x, i, { offsetY: v }),
                                `off-${i}`,
                              )
                            }
                            fmt={(v) =>
                              v === 0
                                ? "auto"
                                : `${v > 0 ? "↓" : "↑"}${Math.abs(v)}%`
                            }
                          />
                          <Range
                            label={`Scene ${i + 1} text size`}
                            value={s.scale || 1}
                            min={0.6}
                            max={1.4}
                            step={0.05}
                            onChange={(v) =>
                              setScenes(
                                (x) =>
                                  E.setScenePresentation(x, i, { scale: v }),
                                `sc-${i}`,
                              )
                            }
                            fmt={(v) => `${Math.round(v * 100)}%`}
                          />
                          <Field label={`Scene ${i + 1} alignment`}>
                            <select
                              aria-label={`Scene ${i + 1} alignment`}
                              className="pms-field"
                              value={s.align || ""}
                              onChange={(e) =>
                                setScenes((x) =>
                                  E.setScenePresentation(x, i, {
                                    align: e.target.value || null,
                                  }),
                                )
                              }
                            >
                              <option value="">Use style default</option>
                              <option value="left">Left</option>
                              <option value="center">Center</option>
                              <option value="right">Right</option>
                            </select>
                          </Field>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {i < comp.scenes.length - 1 && (
                            <Btn
                              onClick={() =>
                                setScenes((x) => E.mergeNext(x, i))
                              }
                            >
                              Merge with next
                            </Btn>
                          )}
                          <Btn
                            onClick={() =>
                              setScenes((x) => E.duplicateScene(x, i))
                            }
                          >
                            Duplicate
                          </Btn>
                          <Btn
                            onClick={() =>
                              setScenes((x) => E.removeScene(x, i))
                            }
                            aria-label={`Remove scene ${i + 1} from the video`}
                          >
                            Remove from video
                          </Btn>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
  );
}
