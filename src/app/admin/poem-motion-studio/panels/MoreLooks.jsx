"use client";
// P8 template families (6 families x 3 variants), grouped by family, below the six classic templates. Closed by default
// (thumbnails only draw once it is opened). Every card is tagged "Pending design review": the looks are machine-checked
// (fonts, size floors, contrast, validators) but have NO human design sign-off.
import { useState } from "react";
import {
  DESIGN_TEMPLATES,
  groupByFamily,
  PENDING_REVIEW_LABEL,
} from "@/lib/motion-studio/templates";
import TemplatePicker from "../TemplatePicker";

const GROUPS = groupByFamily(DESIGN_TEMPLATES);

export default function MoreLooks({ comp, tick, onPick }) {
  const current = DESIGN_TEMPLATES.some((t) => t.id === comp.templateId);
  const [open, setOpen] = useState(current);
  return (
    <details
      className="pms-card p-2"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="pms-lbl" style={{ minHeight: 44, cursor: "pointer" }}>
        More looks by family ({DESIGN_TEMPLATES.length}) ·{" "}
        {PENDING_REVIEW_LABEL}
      </summary>
      {open && (
        <div className="mt-2 space-y-3">
          {GROUPS.map((g) => (
            <section key={g.id} aria-label={`${g.label} family`}>
              <h3 className="mb-1 text-sm font-semibold">{g.label}</h3>
              <TemplatePicker
                comp={comp}
                tick={tick}
                onPick={onPick}
                templates={g.templates}
                label={`${g.label} looks`}
              />
            </section>
          ))}
        </div>
      )}
    </details>
  );
}
