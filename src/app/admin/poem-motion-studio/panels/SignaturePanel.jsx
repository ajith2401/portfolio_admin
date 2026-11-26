"use client";
import { ALIGN } from "@/lib/motion-studio/composition";
import { SIG_DEFAULTS, SIG_LEGACY, SIG_SIZE_MAX, SIG_SIZE_MIN, isLegacySignature, newSignatureDefaults } from "@/lib/motion-studio/signature";
import { Btn, Field, Range } from "../studio-ui";
import { useStudio } from "../studio-context";

/** Signature controls: show/hide, text, size, vertical position, alignment. The preview redraws live from comp.branding. */
export default function SignaturePanel() {
  const { comp, update } = useStudio();
  const b = comp.branding;
  const legacy = isLegacySignature(b);
  const key = comp.format in SIG_DEFAULTS.yPct ? comp.format : "reel";
  const size = legacy ? SIG_LEGACY.size : b.size;
  const yPct = legacy ? SIG_LEGACY.yPct[key] : b.yPct ?? SIG_DEFAULTS.yPct[key];
  const align = legacy ? SIG_LEGACY.align : b.align;
  const set = (patch, coalesce) => update((c) => {
    // the first edit of a legacy signature materialises its current values, so nothing else moves
    if (isLegacySignature(c.branding)) c.branding = { ...c.branding, size: SIG_LEGACY.size, yPct: SIG_LEGACY.yPct[key], align: SIG_LEGACY.align };
    Object.assign(c.branding, patch);
    return c;
  }, coalesce);
  return (
    <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-2" aria-label="Signature">
      <legend className="pms-lbl">Signature</legend>
      <Field label="Signature">
        <input
          aria-label="Signature"
          className="pms-field"
          value={b.signature}
          maxLength={60}
          onChange={(e) => update((c) => { c.branding.signature = e.target.value; return c; }, "sig")}
        />
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          aria-label="Show signature"
          className="h-5 w-5"
          checked={b.show}
          onChange={(e) => update((c) => { c.branding.show = e.target.checked; return c; })}
        />{" "}
        Show signature
      </label>
      <Range
        label="Signature size"
        value={size}
        min={SIG_SIZE_MIN}
        max={SIG_SIZE_MAX}
        onChange={(v) => set({ size: Math.round(v) }, "sigsize")}
        fmt={(v) => `${v}px`}
      />
      <Range
        label="Signature position"
        value={Math.round(yPct * 100)}
        min={5}
        max={99}
        onChange={(v) => set({ yPct: v / 100 }, "sigy")}
        fmt={(v) => `${v}% down`}
      />
      <fieldset>
        <legend className="pms-lbl">Signature alignment</legend>
        <div className="flex flex-wrap gap-2">
          {ALIGN.map((a) => (
            <Btn
              key={a}
              className="min-h-11 min-w-11"
              aria-label={`Signature align ${a}`}
              aria-pressed={align === a}
              onClick={() => set({ align: a })}
            >
              {a[0].toUpperCase() + a.slice(1)}
            </Btn>
          ))}
        </div>
      </fieldset>
      <div>
        <Btn
          className="min-h-11"
          aria-label="Use new signature defaults"
          onClick={() => update((c) => { c.branding = { ...c.branding, ...newSignatureDefaults() }; return c; })}
        >
          Use new signature defaults
        </Btn>
        <p className="text-xs" style={{ color: "var(--mute)" }}>
          {legacy ? "This project keeps its original signature (30px, centred, low). " : ""}New defaults: {SIG_DEFAULTS.size}px, centred, about 61% down in Reel/Story.
        </p>
      </div>
    </fieldset>
  );
}
