"use client";
import { Btn, slug } from "../studio-ui";
import { useStudio } from "../studio-context";

export default function StoryPanel() {
  const {
    doStillsZip,
    doStory,
    name,
    progress,
    stills,
  } = useStudio();
  return (
<section aria-label="Story" className="space-y-3">
                  <h2 className="text-lg font-semibold">Story frames</h2>
                  <p className="text-sm" style={{ color: "var(--mute)" }}>
                    One 1080×1920 frame per scene, in order, with your template
                    and background. Post them as an Instagram Story sequence.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Btn
                      primary
                      disabled={progress !== null}
                      onClick={() => doStory("image/png")}
                    >
                      Render PNG frames
                    </Btn>
                    <Btn
                      disabled={progress !== null}
                      onClick={() => doStory("image/jpeg")}
                    >
                      Render JPEG frames
                    </Btn>
                  </div>
                  {stills && (
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <Btn onClick={doStillsZip}>Download all as ZIP</Btn>
                      </div>
                      <ol className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {stills.urls.map((u, i) => (
                          <li key={u}>
                            <img
                              src={u}
                              alt={`Story frame ${i + 1} of ${stills.urls.length}`}
                              className="w-full rounded border"
                            />
                            <a
                              className="mt-1 block min-h-11 py-2 text-center text-sm underline"
                              href={u}
                              download={`${slug(name)}-story-${String(i + 1).padStart(2, "0")}.${stills.type === "image/png" ? "png" : "jpg"}`}
                            >
                              Download {i + 1}
                            </a>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </section>
  );
}
