"use client";
import { Btn, Field } from "../studio-ui";
import { useStudio } from "../studio-context";

export default function PoemPanel() {
  const {
    applyPoemEdit,
    parsedEdit,
    poemText,
    poemTitle,
    setPoemText,
    setPoemTitle,
    source,
  } = useStudio();
  return (
<section aria-label="Poem" className="pms-card space-y-3">
                  <h2 className="text-lg font-semibold">Poem text</h2>
                  {source?.kind === "writing" ? (
                    <>
                      <p className="text-sm" style={{ color: "var(--mute)" }}>
                        This poem comes from your Portfolio and is read-only
                        here. To change the words, start a new poem by pasting
                        a copy, or edit the original in Writings.
                      </p>
                      <pre lang="ta" className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">{poemText}</pre>
                    </>
                  ) : source?.poem ? (
                    <>
                      <Field label="Title">
                        <input className="pms-field" lang="ta" value={poemTitle} maxLength={300} onChange={(e) => setPoemTitle(e.target.value)} />
                      </Field>
                      <Field label="Poem text (blank line = new stanza)">
                        <textarea
                          aria-label="Poem text"
                          className="pms-field"
                          lang="ta"
                          rows={14}
                          value={poemText}
                          style={{ fontSize: 16, lineHeight: 1.7, whiteSpace: "pre-wrap", resize: "vertical" }}
                          onChange={(e) => setPoemText(e.target.value)}
                        />
                      </Field>
                      {!parsedEdit.ok && (
                        <div role="alert" className="rounded-lg p-3 text-sm" style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }}>
                          <strong>Your text is kept, but scenes cannot be rebuilt yet.</strong>
                          <ul className="mt-1 list-disc pl-5">
                            {parsedEdit.issues.slice(0, 5).map((i, k) => <li key={k}>{i.message}</li>)}
                          </ul>
                        </div>
                      )}
                      <Btn primary disabled={!parsedEdit.ok} onClick={applyPoemEdit}>
                        Apply and rebuild scenes
                      </Btn>
                      <p className="text-xs" style={{ color: "var(--mute)" }}>
                        Rebuilding replaces your scene edits. You can Undo.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--mute)" }}>
                      This project has no stored poem text to edit.
                    </p>
                  )}
                </section>
  );
}
