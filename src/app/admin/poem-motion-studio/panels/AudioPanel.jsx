"use client";
import { Btn, Field, Range } from "../studio-ui";
import { useStudio } from "../studio-context";

export default function AudioPanel() {
  const {
    audioInfo,
    caps,
    clearAudio,
    comp,
    recOk,
    recState,
    setAudio,
    toggleRecord,
    update,
  } = useStudio();
  return (
<section aria-label="Audio" className="space-y-3">
                  <h2 className="text-lg font-semibold">Audio</h2>
                  <p className="text-sm" style={{ color: "var(--mute)" }}>
                    Add your own recitation or sound. No music is bundled, and
                    audio never leaves this device. The MP4 gets AAC audio when
                    your browser supports it; otherwise export stays silent.
                  </p>
                  {caps && !caps.aac && (
                    <p className="text-sm" style={{ color: "var(--warn-ink)" }}>
                      This browser cannot encode AAC, so audio can be previewed
                      but won’t be included in the MP4.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <label className="pms-btn inline-flex cursor-pointer items-center">
                      Upload audio
                      <input
                        type="file"
                        accept="audio/*"
                        className="sr-only"
                        aria-label="Upload audio"
                        onChange={(e) =>
                          e.target.files?.[0] &&
                          setAudio(
                            e.target.files[0],
                            e.target.files[0].name.slice(0, 60),
                          )
                        }
                      />
                    </label>
                    <Btn
                      onClick={toggleRecord}
                      aria-pressed={recState === "recording"}
                      disabled={
                        !recOk.ok && recState !== "recording"
                      }
                    >
                      {recState === "recording"
                        ? "■ Stop recording"
                        : "● Record recitation"}
                    </Btn>
                    {audioInfo && <Btn onClick={clearAudio}>Remove audio</Btn>}
                  </div>
                  {!recOk.ok && (
                    <p className="text-sm" style={{ color: "var(--mute)" }}>
                      {recOk.reason}
                    </p>
                  )}
                  {recState === "recording" && (
                    <p role="status" className="text-sm">
                      Recording… speak now. Press stop when finished.
                    </p>
                  )}
                  {audioInfo && (
                    <div className="pms-card space-y-3">
                      <p className="text-sm">
                        {audioInfo.label} · {audioInfo.seconds.toFixed(1)}s ·{" "}
                        {audioInfo.type}
                      </p>
                      {audioInfo.url && (
                        <audio
                          controls
                          src={audioInfo.url}
                          aria-label="Audio playback"
                          className="w-full"
                        />
                      )}
                      <Range
                        label="Trim start (s)"
                        value={comp.audio.trimStartMs / 1000}
                        min={0}
                        max={Math.max(0, audioInfo.seconds - 0.5)}
                        step={0.1}
                        onChange={(v) =>
                          update((c) => {
                            c.audio.trimStartMs = v * 1000;
                            return c;
                          }, "ts")
                        }
                      />
                      <Range
                        label="Trim end (s, 0 = full)"
                        value={comp.audio.trimEndMs / 1000}
                        min={0}
                        max={audioInfo.seconds}
                        step={0.1}
                        onChange={(v) =>
                          update((c) => {
                            c.audio.trimEndMs = v * 1000;
                            return c;
                          }, "te")
                        }
                      />
                      <Range
                        label="Volume"
                        value={comp.audio.volume}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(v) =>
                          update((c) => {
                            c.audio.volume = v;
                            return c;
                          }, "vol")
                        }
                        fmt={(v) => `${Math.round(v * 100)}%`}
                      />
                      <Range
                        label="Fade in (ms)"
                        value={comp.audio.fadeInMs}
                        min={0}
                        max={5000}
                        step={100}
                        onChange={(v) =>
                          update((c) => {
                            c.audio.fadeInMs = v;
                            return c;
                          }, "fi")
                        }
                      />
                      <Range
                        label="Fade out (ms)"
                        value={comp.audio.fadeOutMs}
                        min={0}
                        max={5000}
                        step={100}
                        onChange={(v) =>
                          update((c) => {
                            c.audio.fadeOutMs = v;
                            return c;
                          }, "fo")
                        }
                      />
                      <Field label="If the audio is longer than the video">
                        <select
                          aria-label="Audio length handling"
                          className="pms-field"
                          value={comp.audio.fitVideo}
                          onChange={(e) =>
                            update((c) => {
                              c.audio.fitVideo = e.target.value;
                              return c;
                            })
                          }
                        >
                          <option value="extend">
                            Extend the last scene to fit
                          </option>
                          <option value="keep">
                            Cut the audio at the video end
                          </option>
                        </select>
                      </Field>
                    </div>
                  )}
                </section>
  );
}
