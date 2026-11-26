"use client";
import { Btn } from "../studio-ui";
import { useStudio } from "../studio-context";

export default function PosterPanel() {
  const {
    comp,
    doPoster,
    progress,
    update,
  } = useStudio();
  return (
<section aria-label="Poster" className="space-y-3">
                  <h2 className="text-lg font-semibold">Feed poster (4:5)</h2>
                  <p className="text-sm" style={{ color: "var(--mute)" }}>
                    Choose the stanzas for the poster. Text is never shrunk
                    below a readable size; if it won’t fit, you’ll be told and
                    can make a multi-card set.
                  </p>
                  <fieldset>
                    <legend className="pms-lbl">Stanzas to include</legend>
                    {comp.scenes.map((s, i) =>
                      s.kind === "title" ? null : (
                        <label
                          key={s.id}
                          className="flex min-h-11 items-start gap-2 py-1 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={
                              !comp.poster.sceneIds.length ||
                              comp.poster.sceneIds.includes(s.id)
                            }
                            onChange={(e) =>
                              update((c) => {
                                const all = c.scenes
                                  .filter((x) => x.kind !== "title")
                                  .map((x) => x.id);
                                const cur = c.poster.sceneIds.length
                                  ? c.poster.sceneIds
                                  : all;
                                c.poster.sceneIds = e.target.checked
                                  ? all.filter(
                                      (id) => cur.includes(id) || id === s.id,
                                    )
                                  : cur.filter((id) => id !== s.id);
                                return c;
                              })
                            }
                          />{" "}
                          <span lang="ta">
                            {i}. {s.lines[0]}
                            {s.lines.length > 1 ? " …" : ""}
                          </span>
                        </label>
                      ),
                    )}
                  </fieldset>
                  <div className="flex flex-wrap gap-2">
                    <Btn
                      primary
                      disabled={progress !== null}
                      onClick={() => doPoster("image/png", false)}
                    >
                      Poster PNG
                    </Btn>
                    <Btn
                      disabled={progress !== null}
                      onClick={() => doPoster("image/jpeg", false)}
                    >
                      Poster JPEG
                    </Btn>
                    <Btn
                      disabled={progress !== null}
                      onClick={() => doPoster("image/png", true)}
                    >
                      Multi-card set (PNG ZIP)
                    </Btn>
                    <Btn
                      disabled={progress !== null}
                      onClick={() => doPoster("image/jpeg", true)}
                    >
                      Multi-card set (JPEG ZIP)
                    </Btn>
                  </div>
                </section>
  );
}
