"use client";
import { Btn } from "../studio-ui";
import { useStudio } from "../studio-context";

export default function ProjectPanel() {
  const {
    cloudDialog,
    confirmDel,
    duplicate,
    name,
    projectId,
    remove,
    save,
    saveState,
    setCloudDialog,
    setConfirmDel,
    setName,
  } = useStudio();
  return (
<section aria-label="Project" className="pms-card">
                  <h2 className="text-lg font-semibold">Project</h2>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      aria-label="Project name"
                      className="pms-field"
                      value={name}
                      maxLength={120}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <Btn primary onClick={projectId ? save : () => setCloudDialog(true)}>
                      {projectId ? "Save now" : "Save project to Admin"}
                    </Btn>
                  </div>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--mute)" }}
                    aria-live="polite"
                  >
                    {saveState === "saving"
                      ? "Saving…"
                      : saveState === "saved"
                        ? "Saved."
                        : saveState === "dirty"
                          ? "Autosaving…"
                          : saveState === "error"
                            ? "Save failed — your work is still on screen and a copy is kept on this device."
                            : projectId
                              ? "Autosave is on."
                              : "Not saved to Admin. A recovery copy is kept on this device only."}
                  </p>
                  {cloudDialog && !projectId && (
                    <div role="alertdialog" aria-labelledby="cloud-h" className="mt-3 rounded-lg border p-3">
                      <p id="cloud-h" className="text-sm font-semibold">Save this project to Admin?</p>
                      <p className="text-sm" style={{ color: "var(--mute)" }}>
                        This saves your poem and visual composition in your Admin creative-project library. It does not create or publish a Portfolio Writing record.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Btn primary onClick={() => { setCloudDialog(false); save(); }}>Save project to Admin</Btn>
                        <Btn onClick={() => setCloudDialog(false)}>Not now</Btn>
                      </div>
                    </div>
                  )}
                  {projectId && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Btn onClick={duplicate}>Duplicate</Btn>
                      <Btn onClick={() => setConfirmDel(true)}>
                        Delete project
                      </Btn>
                    </div>
                  )}
                  {confirmDel && (
                    <div
                      role="alertdialog"
                      aria-labelledby="del-h"
                      className="mt-3 rounded-lg border p-3"
                      style={{ borderColor: "var(--err-ink)" }}
                    >
                      <p id="del-h" className="text-sm font-semibold">
                        Delete “{name}” permanently?
                      </p>
                      <p className="text-sm" style={{ color: "var(--mute)" }}>
                        The original writing is not affected. This cannot be
                        undone.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Btn
                          onClick={remove}
                          style={{
                            background: "var(--err-ink)",
                            color: "var(--err-bg)",
                          }}
                        >
                          Yes, delete project
                        </Btn>
                        <Btn onClick={() => setConfirmDel(false)}>Cancel</Btn>
                      </div>
                    </div>
                  )}
                </section>
  );
}
