"use client";
import { Btn } from "../studio-ui";
import { useStudio } from "../studio-context";

export default function ExportPanel() {
  const {
    abortRef,
    caps,
    comp,
    doCover,
    doPoster,
    doStory,
    doVideo,
    progress,
    setMode,
    setTab,
  } = useStudio();
  return (
<section aria-label="Export" className="pms-card space-y-3">
                  <h2 className="text-lg font-semibold">Export</h2>
                  {caps === null && (
                    <p className="text-sm" style={{ color: "var(--mute)" }}>
                      Checking what this device can encode…
                    </p>
                  )}
                  {caps && !caps.mp4 && (
                    <p className="text-sm" style={{ color: "var(--warn-ink)" }}>
                      {caps.reason}
                    </p>
                  )}
                  {caps?.mp4 && (
                    <p className="text-xs" style={{ color: "var(--mute)" }}>
                      Verified H.264 encoder ({caps.avcString})
                      {caps.aac ? " and AAC audio" : "; AAC audio unavailable"}.
                      Always play the file on your phone before posting.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Btn
                      primary
                      disabled={
                        !caps?.mp4 ||
                        progress !== null ||
                        comp.format === "poster"
                      }
                      onClick={doVideo}
                    >
                      {progress !== null
                        ? `Working ${Math.round(progress * 100)}%`
                        : `Export ${comp.format === "story" ? "Story" : "Reel"} MP4`}
                    </Btn>
                    {progress !== null && (
                      <Btn onClick={() => abortRef.current?.abort()}>
                        Cancel
                      </Btn>
                    )}
                    <Btn
                      disabled={progress !== null}
                      onClick={() => setTab("full")}
                    >
                      Full-poem poster…
                    </Btn>
                    <Btn
                      disabled={progress !== null}
                      onClick={() => doCover("image/png")}
                    >
                      Reel cover PNG
                    </Btn>
                    <Btn
                      disabled={progress !== null}
                      onClick={() => doPoster("image/png", false)}
                    >
                      Export Feed poster PNG
                    </Btn>
                    <Btn
                      disabled={progress !== null}
                      onClick={() => {
                        setTab("story");
                        setMode("advanced");
                        doStory("image/png");
                      }}
                    >
                      Export Story frames (ZIP)
                    </Btn>
                  </div>
                  {comp.format === "poster" && (
                    <p className="text-xs" style={{ color: "var(--mute)" }}>
                      Switch the format to Reel or Story (Look) to export video.
                    </p>
                  )}
                  {caps && !caps.mp4 && (
                    <p className="text-xs" style={{ color: "var(--mute)" }}>
                      No MP4 on this device: use Story frames (ZIP) and assemble
                      them in any video app.
                    </p>
                  )}
                </section>
  );
}
