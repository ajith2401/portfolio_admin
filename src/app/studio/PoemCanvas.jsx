// src/app/studio/PoemCanvas.jsx
"use client";
import { forwardRef } from "react";
import { ASPECTS, PAPER_BY_ID, END_MARKS, GHOST_PAGE } from "./presets";
import { FONT_BY_ID } from "./fonts";

const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.9'/%3E%3C/svg%3E\")";

const END_GLYPH = Object.fromEntries(END_MARKS.map((m) => [m.id, m.glyph]));

// Every optical effect is a function of one Physicality value (0..1). Editions
// set a starting point; the slider is the single master control. All lengths
// are in canvas units, so they scale with the export's pixelRatio automatically
// — nothing is hard-coded to screen pixels.
function physics(p) {
  return {
    grain: p * 0.5,
    vignette: p * 0.26,
    wash: Math.min(1, 0.35 + p * 0.65), // paper wash opacity multiplier
    ghost: Math.max(0, p - 0.3) * 0.055, // faint show-through, begins ~0.3
    curvature: Math.max(0, p - 0.15), // soft edge shading
  };
}

const PoemCanvas = forwardRef(function PoemCanvas({ settings }, ref) {
  const { w, h } = ASPECTS[settings.aspect] || ASPECTS.book;
  const font = FONT_BY_ID[settings.fontId] || FONT_BY_ID["tiro-tamil"];
  const paper = PAPER_BY_ID[settings.paperId] || PAPER_BY_ID.ivory;
  const ink = settings.textColor;
  const fx = physics(settings.physicality);

  // Asymmetric margins so text clears the binding fold, as a real page is imposed.
  const pad = settings.padding;
  const inner = settings.gutter ? Math.round(pad * 1.7) : pad;
  const gutterSide = settings.pageSide === "verso" ? "right" : "left";
  const outerSide = gutterSide === "left" ? "right" : "left";
  const padLeft = settings.gutter ? (gutterSide === "left" ? inner : pad) : pad;
  const padRight = settings.gutter
    ? gutterSide === "right"
      ? inner
      : pad
    : pad;

  const poemStyle = {
    fontFamily: font.cssVar,
    fontSize: `${settings.fontSize}px`,
    fontWeight: settings.fontWeight,
    lineHeight: settings.lineHeight,
    letterSpacing: `${settings.letterSpacing}em`,
    textAlign: settings.textAlign,
    color: ink,
  };

  const faint = (a) => hexToRgba(ink, a);
  const endGlyph = END_GLYPH[settings.endMark] || "";

  return (
    <div
      ref={ref}
      className="poem-page"
      style={{
        position: "relative",
        width: `${w}px`,
        height: `${h}px`,
        background: paper.base,
        overflow: "hidden",
        isolation: "isolate",
      }}
    >
      {/* Printed-light wash. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: paper.wash,
          opacity: fx.wash,
          pointerEvents: "none",
        }}
      />

      {/* Backside show-through — the reverse page, mirrored, blurred, faint. */}
      {settings.showGhost && fx.ghost > 0.002 && (
        <div
          style={{
            position: "absolute",
            top: `${pad}px`,
            left: `${padLeft}px`,
            right: `${padRight}px`,
            transform: "scaleX(-1)",
            transformOrigin: "center",
            // Softened with text-shadow, not a CSS filter: filters inside
            // html-to-image's foreignObject rasterize catastrophically slowly at
            // export scale. text-shadow is a cheap paint property and exports fast.
            textShadow: "0 0 1.6px currentColor",
            opacity: fx.ghost,
            color: ink,
            fontFamily: font.cssVar,
            fontSize: `${Math.round(settings.fontSize * 0.82)}px`,
            lineHeight: settings.lineHeight,
            whiteSpace: "pre-wrap",
            textAlign: outerSide,
            pointerEvents: "none",
          }}
        >
          {GHOST_PAGE}
        </div>
      )}

      {/* Paper grain. */}
      {fx.grain > 0.01 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: GRAIN_URL,
            backgroundSize: "180px 180px",
            opacity: fx.grain * 0.5,
            mixBlendMode: "multiply",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Binding gutter shadow on the inner edge. */}
      {settings.gutter && fx.curvature > 0.01 && (
        <div
          style={{
            position: "absolute",
            insetBlock: 0,
            [gutterSide]: 0,
            width: "12%",
            background: `linear-gradient(${gutterSide === "left" ? "90deg" : "270deg"}, rgba(20,12,4,${(0.24 * fx.curvature).toFixed(3)}) 0%, rgba(20,12,4,${(0.07 * fx.curvature).toFixed(3)}) 38%, rgba(0,0,0,0) 100%)`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Page curvature — soft top & bottom edge shading. */}
      {fx.curvature > 0.01 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, rgba(20,12,4,${(0.12 * fx.curvature).toFixed(3)}) 0%, rgba(0,0,0,0) 7%, rgba(0,0,0,0) 93%, rgba(20,12,4,${(0.12 * fx.curvature).toFixed(3)}) 100%)`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Vignette. */}
      {fx.vignette > 0.01 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(118% 118% at 50% 45%, rgba(0,0,0,0) 58%, rgba(0,0,0,${(fx.vignette * 0.55).toFixed(3)}) 100%)`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Content column. */}
      <div
        style={{
          position: "relative",
          height: "100%",
          boxSizing: "border-box",
          padding: `${pad}px ${padRight}px ${pad}px ${padLeft}px`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Title — bold, above the poem, as in printed collections. */}
        <div style={{ minHeight: 24 }}>
          {settings.showTitle && settings.title ? (
            <div
              style={{
                fontFamily: font.cssVar,
                fontWeight: 700,
                fontSize: Math.round(settings.fontSize * 0.86),
                color: ink,
                textAlign: settings.titleAlign,
                marginBottom: 12,
              }}
            >
              {settings.title}
            </div>
          ) : null}
        </div>

        {/* Poem body, optically centred in the remaining space. */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={poemStyle}>
            <PoemBody
              text={settings.text}
              stanzaSpacing={settings.stanzaSpacing}
            />
            {endGlyph ? (
              <div
                style={{
                  marginTop: "0.9em",
                  textAlign: settings.textAlign,
                  fontSize: Math.round(settings.fontSize * 0.5),
                  color: faint(0.6),
                }}
              >
                {endGlyph}
              </div>
            ) : null}
          </div>

          {settings.showAuthor && settings.author ? (
            <div
              style={{
                fontFamily: font.cssVar,
                fontStyle: "italic",
                fontSize: Math.round(settings.fontSize * 0.78),
                color: faint(0.9),
                textAlign: "right",
                marginTop: 52,
              }}
            >
              — {settings.author}
            </div>
          ) : null}
        </div>

        {/* Folio + running footer along the foot margin. */}
        {(settings.showFolio && settings.pageNumber) ||
        (settings.showFooter && settings.footer) ? (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              flexDirection: outerSide === "left" ? "row" : "row-reverse",
              minHeight: 34,
              fontFamily: font.cssVar,
              fontSize: 24,
              color: faint(0.55),
            }}
          >
            <span style={{ letterSpacing: "0.04em" }}>
              {settings.showFolio ? settings.pageNumber : ""}
            </span>
            <span style={{ flex: 1, textAlign: "center" }}>
              {settings.showFooter ? settings.footer : ""}
            </span>
            <span style={{ width: "2ch" }} />
          </div>
        ) : null}
      </div>
    </div>
  );
});

// Render the poem as discrete stanzas: blank lines become a controlled em gap,
// not a doubled line-height, keeping an even typographic colour.
function PoemBody({ text, stanzaSpacing }) {
  const stanzas = String(text)
    .split(/\n[ \t]*\n+/)
    .map((s) => s.replace(/^\n+|\n+$/g, ""))
    .filter((s) => s.trim().length > 0);

  return (
    <>
      {stanzas.map((st, i) => (
        <div
          key={i}
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            marginBottom: i < stanzas.length - 1 ? `${stanzaSpacing}em` : 0,
          }}
        >
          {st}
        </div>
      ))}
    </>
  );
}

function hexToRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return `rgba(0,0,0,${alpha})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}

export default PoemCanvas;
