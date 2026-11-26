// Tamil fonts for Poem Motion Studio, self-hosted by next/font (no runtime request to Google).
// next/font renames families, so the real CSS family strings are exported for the canvas renderer.
// Options must be literal objects (next/font requirement).
import { Noto_Serif_Tamil, Noto_Sans_Tamil, Hind_Madurai, Anek_Tamil, Tiro_Tamil } from "next/font/google";
const serif = Noto_Serif_Tamil({ subsets: ["latin", "tamil"], display: "swap" });
const sans = Noto_Sans_Tamil({ subsets: ["latin", "tamil"], display: "swap" });
const hind = Hind_Madurai({ subsets: ["latin", "tamil"], weight: ["400", "500", "600", "700"], display: "swap" });
const anek = Anek_Tamil({ subsets: ["latin", "tamil"], display: "swap" });
const tiro = Tiro_Tamil({ subsets: ["latin", "tamil"], weight: "400", display: "swap" });
export const fontClass = [serif, sans, hind, anek, tiro].map((f) => f.className).join(" ");
export const FONT_CSS = {
  "noto-serif": serif.style.fontFamily,
  "noto-sans": sans.style.fontFamily,
  "hind-madurai": hind.style.fontFamily,
  anek: anek.style.fontFamily,
  tiro: tiro.style.fontFamily,
};
