// Signature: the SINGLE source of the signature's size, position, alignment and box. drawFrame, validateScene, the
// Full-Poem layout/draw/validate and requiredFaces all read it, so what is validated is what is drawn.
//
// Legacy projects (branding saved before WP6, none of size/yPct/align present) keep their exact old geometry:
// 30px, centred, at 0.8H (Reel/Story) or 0.955H (Poster). New compositions get the new defaults.
import { FONT_FAMILY } from "./render.js";
import { safeRect } from "./safe-zone.js";

export const SIG_LEGACY = Object.freeze({ size: 30, align: "center", yPct: { reel: 0.8, story: 0.8, poster: 0.955 } });
export const SIG_DEFAULTS = Object.freeze({ size: 40, align: "center", yPct: { reel: 0.61, story: 0.61, poster: 0.955 } });
export const SIG_SIZE_MIN = 24, SIG_SIZE_MAX = 64, SIG_Y_MIN = 0.05, SIG_Y_MAX = 0.99;
export const SIG_WEIGHT = 500;
const TOL = 0.5;

/** True when the branding predates WP6 (none of the new fields stored): it must render exactly as before. */
export const isLegacySignature = (b) => !b || (b.size == null && b.yPct == null && b.align == null);

/** The default signature fields for a NEW composition (yPct null = the format's default, so switching format stays sensible). */
export const newSignatureDefaults = () => ({ size: SIG_DEFAULTS.size, yPct: null, align: SIG_DEFAULTS.align });

/**
 * @param {object} comp composition
 * @param {{w:number,h:number,safe?:{side:number},full?:boolean}} fmt canvas (FORMATS entry, or the Full-Poem canvas with full:true)
 * @param {CanvasRenderingContext2D} [ctx] optional measuring ctx for the real width (otherwise an estimate)
 * @returns {null|{show:boolean,text:string,size:number,align:string,x:number,y:number,font:string,rect:object,legacy:boolean,
 *   w:number,left:number,right:number,top:number,bottom:number}} null when the signature is hidden or empty
 */
export function signatureBox(comp, fmt, ctx) {
  const b = comp?.branding;
  if (!(b?.show && b.signature)) return null;
  const legacy = isLegacySignature(b);
  const W = fmt.w, H = fmt.h, side = fmt.safe?.side ?? 0.06;
  const key = comp.format in SIG_LEGACY.yPct ? comp.format : "reel";
  const size = legacy ? SIG_LEGACY.size : b.size ?? SIG_DEFAULTS.size;
  const align = legacy ? SIG_LEGACY.align : b.align ?? SIG_DEFAULTS.align;
  const y = fmt.full ? H - 70 : H * (legacy ? SIG_LEGACY.yPct[key] : b.yPct ?? SIG_DEFAULTS.yPct[key]);
  const x = align === "left" ? W * side : align === "right" ? W - W * side : W / 2;
  const font = `${SIG_WEIGHT} ${size}px ${FONT_FAMILY["noto-sans"]}`;
  let w;
  if (ctx) { ctx.font = font; w = ctx.measureText(b.signature).width; }
  else w = Array.from(b.signature).length * size * 0.6;
  const left = align === "left" ? x : align === "right" ? x - w : x - w / 2;
  const top = y - size / 2, bottom = y + size / 2;
  return { show: true, text: b.signature, size, align, x, y, font, legacy, w, left, right: left + w, top, bottom,
    rect: { x: left, y: top, w, h: size, left, right: left + w, top, bottom } };
}

/** Vertical gap kept between the text and the signature. */
export const sigGap = (size) => Math.round(size * 0.5);

/**
 * The rect the TEXT may use: the format's safe rect minus the signature band when the signature sits inside it
 * (a Reel signature at 61% does). Text goes in the larger remaining part. A signature clear of the safe rect (legacy
 * positions, the Poster default) returns the safe rect unchanged.
 */
export function textRect(comp, fmt, ctx) {
  const rect = safeRect(fmt.w, fmt.h, fmt.safe);
  const sg = signatureBox(comp, fmt, ctx);
  if (!sg) return rect;
  const g = sigGap(sg.size), bandTop = sg.top - g, bandBottom = sg.bottom + g;
  const rTop = rect.y, rBottom = rect.y + rect.h;
  if (bandBottom <= rTop || bandTop >= rBottom) return rect;
  const above = bandTop - rTop, below = rBottom - bandBottom;
  return above >= below ? { ...rect, h: Math.max(0, Math.round(above)) } : { ...rect, y: Math.round(bandBottom), h: Math.max(0, Math.round(below)) };
}

/** Bounds problems of the signature itself (message list; empty = fine). Legacy boxes are checked against the canvas only. */
export const signatureBoundsIssues = (comp, fmt, ctx) => boxBoundsIssues(signatureBox(comp, fmt, ctx), fmt, comp.format);
export function boxBoundsIssues(sg, fmt, format) {
  if (!sg) return [];
  const out = [], W = fmt.w, H = fmt.h;
  if (sg.top < -TOL || sg.bottom > H + TOL || sg.left < -TOL || sg.right > W + TOL) out.push("signature is outside the canvas");
  if (!sg.legacy) {
    const side = (fmt.safe?.side ?? 0.06) * W;
    if (sg.left < side - TOL || sg.right > W - side + TOL) out.push("signature is outside the safe margins horizontally");
    if (!fmt.full && format !== "poster") {
      const r = safeRect(W, H, fmt.safe);
      if (sg.top < r.y - TOL || sg.bottom > r.y + r.h + TOL) out.push("signature is outside the safe area vertically");
    }
  }
  return out;
}

/** True when the vertical span [top,bottom] intersects the signature box (with a tolerance). */
export const overlapsSignature = (sg, top, bottom, tol = 0.5) => !!sg && bottom > sg.top + tol && top < sg.bottom - tol;
