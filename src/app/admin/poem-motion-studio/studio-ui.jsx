"use client";
export const cx = (...a) => a.filter(Boolean).join(" ");
export const slug = (s) => (s || "poem").replace(/[^\w஀-௿-]+/g, "-");
export function download(blob, name) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: name,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}
export const Btn = ({ primary, className, ...p }) => (
  <button
    type="button"
    {...p}
    className={cx("pms-btn", primary && "pms-primary", className)}
  />
);
export const Field = ({ label, children, hint }) => (
  <div>
    <label className="pms-lbl">
      {label}
      {children}
    </label>
    {hint && (
      <p className="text-xs" style={{ color: "var(--mute)" }}>
        {hint}
      </p>
    )}
  </div>
);
// A slider plus -/+ buttons for exact, one-step changes (sliders are hard to nudge precisely on a phone).
const roundTo = (v, step) => { const d = (String(step).split(".")[1] || "").length; return Number(v.toFixed(d)); };
export const Range = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  fmt = (v) => v,
}) => {
  const nudge = (dir) => onChange(roundTo(Math.min(max, Math.max(min, Number(value) + dir * step)), step));
  return (
    <div className="pms-lbl">
      <span>{label}: {fmt(value)}</span>
      <div className="flex items-center gap-1">
        <button type="button" className="pms-step" aria-label={`Decrease ${label}`} disabled={Number(value) <= min} onClick={() => nudge(-1)}>−</button>
        <input
          aria-label={label}
          type="range"
          className="w-full"
          style={{ minHeight: 44 }}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button type="button" className="pms-step" aria-label={`Increase ${label}`} disabled={Number(value) >= max} onClick={() => nudge(1)}>+</button>
      </div>
    </div>
  );
};
