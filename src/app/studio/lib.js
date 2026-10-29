// src/app/studio/lib.js
"use client";
import { useEffect, useRef, useState } from "react";

// Load an image source, resolving on decode. Bounded so a bad source can never
// hang the export button.
function loadImage(src, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(
      () => reject(new Error("Image load timed out")),
      timeoutMs,
    );
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Image failed to load"));
    };
    img.src = src;
  });
}

// Export the poem node at full resolution.
//
// We rasterize the page ourselves rather than call html-to-image's toPng/
// toCanvas: this build's canvas step (its internal createImage) never resolves
// on our tree and hangs the tab. Instead we use its `toSvg` — which cleanly
// clones the node, inlines computed styles, and base64-embeds the fonts (so
// Tamil glyphs stay intact) — then draw that SVG onto a canvas. Because an SVG
// is vector, drawing it scaled by pixelRatio re-rasterizes crisply, so a
// 1080-wide page exports at 3240px with no quality loss.
export async function exportPoem(
  node,
  { format = "png", pixelRatio = 3, fileName = "poem" } = {},
) {
  const mod = await import("html-to-image");
  const w = node.offsetWidth;
  const h = node.offsetHeight;

  const svgUrl = await mod.toSvg(node, {
    style: { transform: "none", margin: "0" },
  });
  const img = await loadImage(svgUrl);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * pixelRatio);
  canvas.height = Math.round(h * pixelRatio);
  const ctx = canvas.getContext("2d");
  if (format === "jpg") {
    ctx.fillStyle = "#ffffff"; // JPG has no alpha; give it a paper-white ground
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const dataUrl =
    format === "jpg"
      ? canvas.toDataURL("image/jpeg", 0.96)
      : canvas.toDataURL("image/png");

  const link = document.createElement("a");
  link.download = `${fileName}.${format === "jpg" ? "jpg" : "png"}`;
  link.href = dataUrl;
  link.click();
  return dataUrl;
}

// Suggest a font size (px, in canvas space) that fills the page without
// overflow — the lightweight "smart layout" pass. Scales down as the poem grows
// in line count and length; centered short poems get larger type.
export function autoFontSize(
  text,
  { w, h, padding, lineHeight = 1.75, stanzaSpacing = 0.9 },
) {
  // Model the real layout: stanzas separated by controlled gaps, not blank
  // lines. Height cost is text-lines x lineHeight + stanza-gaps x stanzaSpacing.
  const stanzas = String(text)
    .split(/\n[ \t]*\n+/)
    .map((s) => s.replace(/^\n+|\n+$/g, ""))
    .filter((s) => s.trim().length > 0);

  const textLines = stanzas.reduce((n, s) => n + s.split("\n").length, 0) || 1;
  const gaps = Math.max(0, stanzas.length - 1);
  const longest = stanzas
    .flatMap((s) => s.split("\n"))
    .reduce((m, l) => Math.max(m, l.length), 1);

  const availH = h - padding * 2;
  const availW = w - padding * 2;

  const heightUnits = textLines * lineHeight + gaps * stanzaSpacing;
  const byHeight = availH / heightUnits;
  // Width budget: assume Tamil/Latin glyphs average ~0.62em wide.
  const byWidth = availW / (longest * 0.62);

  const size = Math.min(byHeight, byWidth);
  return Math.round(Math.max(20, Math.min(96, size)));
}

// Track a container's box and return the scale that fits `w x h` inside it,
// capped at 1 so the canvas never renders larger than its intrinsic size.
export function useFitScale(w, h) {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { clientWidth, clientHeight } = el;
      if (!clientWidth || !clientHeight) return;
      setScale(Math.min(clientWidth / w, clientHeight / h, 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  return { ref, scale };
}
