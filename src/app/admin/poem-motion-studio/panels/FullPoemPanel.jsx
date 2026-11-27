"use client";
import { FULL_W, PRESETS as FULL_PRESETS } from "@/lib/motion-studio/full-poem";
import { Btn } from "../studio-ui";
import FontSizeControl from "./FontSizeControl";
import { useStudio } from "../studio-context";

export default function FullPoemPanel() {
  const {
    comp,
    doFull,
    fullCanvasRef,
    fullCheck,
    fullHeight,
    fullLayout,
    fullMissing,
    fullPoem,
    fullPreset,
    progress,
    setFull_,
    setMode,
    setTab,
  } = useStudio();
  return (
<section aria-label="Full poem" className="space-y-3">
                  <h2 className="text-lg font-semibold">Full-poem vertical poster</h2>
                  <p className="text-sm" style={{ color: "var(--mute)" }}>
                    The whole poem on one image. No line, stanza or punctuation
                    is dropped. A size you choose is used as chosen; an
                    automatic size is only reduced to fit, down to 40px.
                  </p>
                  <div role="group" aria-label="Layout" className="flex flex-wrap gap-2">
                    {Object.entries(FULL_PRESETS).map(([k, v]) => (
                      <Btn key={k} aria-pressed={fullPreset === k} onClick={() => setFull_({ preset: k })} title={v.note}>
                        {v.label}
                      </Btn>
                    ))}
                  </div>
                  <FontSizeControl
                    label="Poster text size"
                    value={comp.full?.size ?? null}
                    shown={fullLayout?.size ?? null}
                    automatic="Layout size"
                    format="poster"
                    testId="full-size"
                    onChange={(v) => setFull_({ size: v })}
                  />
                  <div role="group" aria-label="Canvas height" className="flex flex-wrap gap-2">
                    <Btn aria-pressed={fullHeight === "standard"} onClick={() => setFull_({ height: "standard" })}>
                      Standard 1080×1920
                    </Btn>
                    <Btn aria-pressed={fullHeight === "extended"} onClick={() => setFull_({ height: "extended" })}>
                      Extended height
                    </Btn>
                  </div>
                  {fullLayout && (
                    <>
                      <p className="text-sm" aria-live="polite">
                        {fullLayout.width}×{fullLayout.height}px · font size {fullLayout.size}px ·{" "}
                        <strong>
                          {fullLayout.level === "good" ? "Readable" : fullLayout.level === "small" ? "Compact" : "Small text (your choice)"}
                        </strong>
                        {fullLayout.shrunk ? ` (reduced from ${fullLayout.presetSize}px to fit)` : ""}
                      </p>
                      <p className="text-xs" style={{ color: fullMissing.length ? "var(--err-ink)" : "var(--mute)" }}>
                        {fullMissing.length
                          ? `${fullMissing.length} problem(s) with this layout; export is blocked: ${fullMissing.slice(0, 3).join("; ")}${fullMissing.length > 3 ? "; …" : ""}`
                          : fullCheck?.partial
                            ? "This layout is partial, not the complete poem."
                            : `All ${fullPoem.stanzas.flat().length} lines are on the poster, exactly as written.`}
                      </p>
                      {!fullLayout.fits && (
                        <div role="alert" className="rounded-lg p-3 text-sm" style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }}>
                          {fullHeight === "standard" ? (
                            <>
                              This poem is too long to fit a single 9:16 image at {fullLayout.size}px.
                              Nothing has been cut. Choose what to do:
                              <div className="mt-2 flex flex-wrap gap-2">
                                {fullLayout.suggestedFits && (
                                  <Btn onClick={() => setFull_({ height: "extended" })}>
                                    One taller image (1080×{fullLayout.suggestedHeight}, {fullLayout.suggestedSize}px text)
                                  </Btn>
                                )}
                                {fullPreset !== "compact" && <Btn onClick={() => setFull_({ preset: "compact" })}>Try Compact</Btn>}
                                <Btn onClick={() => { setMode("advanced"); setTab("story"); }}>Split into Story frames</Btn>
                              </div>
                            </>
                          ) : (
                            `This poem is too long for even the tallest single image at ${fullLayout.size}px. Choose a smaller text size, or use Story frames or the Feed poster card set.`
                          )}
                        </div>
                      )}
                      <canvas
                        ref={fullCanvasRef}
                        role="img"
                        aria-label="Preview of the full-poem poster"
                        className="mx-auto block max-w-full rounded-lg border bg-black"
                        style={{ width: Math.round(FULL_W * 0.34), height: "auto" }}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Btn primary disabled={progress !== null || (fullLayout.fits && fullMissing.length > 0)} onClick={() => doFull("image/png", 1)} title={fullLayout.fits ? undefined : "Exports on the taller canvas so every line fits"}>
                          PNG
                        </Btn>
                        <Btn disabled={progress !== null || (fullLayout.fits && fullMissing.length > 0)} onClick={() => doFull("image/jpeg", 1)}>
                          JPEG
                        </Btn>
                        <Btn disabled={progress !== null || !fullLayout.fits || fullMissing.length > 0 || fullLayout.maxScale < 2} onClick={() => doFull("image/png", 2)}>
                          High-res PNG (2×)
                        </Btn>
                        {fullLayout.maxScale < 2 && (
                          <span className="text-xs" style={{ color: "var(--mute)" }}>2× unavailable: too large for phone canvases.</span>
                        )}
                      </div>
                    </>
                  )}
                </section>
  );
}
