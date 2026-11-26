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
export const Range = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  fmt = (v) => v,
}) => (
  <label className="pms-lbl">
    {label}: {fmt(value)}
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
  </label>
);
