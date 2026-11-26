// Tamil fonts for Poem Motion Studio, self-hosted by next/font (no runtime request to Google).
// next/font renames families, so the real CSS family strings are exported for the canvas renderer.
// Options must be literal objects (next/font requirement). The font list itself lives in lib/motion-studio/font-registry.js.
import {
  Noto_Serif_Tamil, Noto_Sans_Tamil, Hind_Madurai, Anek_Tamil, Tiro_Tamil,
  Kavivanar, Mukta_Malar, Catamaran, Pavanam, Baloo_Thambi_2, Meera_Inimai, Arima, Coiny, Oi,
} from "next/font/google";
const serif = Noto_Serif_Tamil({ subsets: ["latin", "tamil"], display: "swap" });
const sans = Noto_Sans_Tamil({ subsets: ["latin", "tamil"], display: "swap" });
const hind = Hind_Madurai({ subsets: ["latin", "tamil"], weight: ["400", "500", "600", "700"], display: "swap" });
const anek = Anek_Tamil({ subsets: ["latin", "tamil"], display: "swap" });
const tiro = Tiro_Tamil({ subsets: ["latin", "tamil"], weight: "400", display: "swap" });
// CANDIDATES (verified:false in the registry): self-hosted the same way, never preloaded (fetched only if a
// composition actually draws with one, which needs the explicit candidate-preview toggle). "Arima Madurai" is not in
// the next/font catalogue (superseded by "Arima"), so it is registered loadable:false and has no face here.
const kavivanar = Kavivanar({ subsets: ["latin", "tamil"], weight: "400", display: "swap", preload: false });
const muktaMalar = Mukta_Malar({ subsets: ["latin", "tamil"], weight: ["400", "500", "600", "700"], display: "swap", preload: false });
const catamaran = Catamaran({ subsets: ["latin", "tamil"], display: "swap", preload: false });
const pavanam = Pavanam({ subsets: ["latin", "tamil"], weight: "400", display: "swap", preload: false });
const balooThambi = Baloo_Thambi_2({ subsets: ["latin", "tamil"], display: "swap", preload: false });
const meeraInimai = Meera_Inimai({ subsets: ["latin", "tamil"], weight: "400", display: "swap", preload: false });
const arima = Arima({ subsets: ["latin", "tamil"], display: "swap", preload: false });
const coiny = Coiny({ subsets: ["latin", "tamil"], weight: "400", display: "swap", preload: false });
const oi = Oi({ subsets: ["latin", "tamil"], weight: "400", display: "swap", preload: false });
// Only the verified five set the page's class (unchanged); candidates' @font-face rules ship with this module's CSS.
export const fontClass = [serif, sans, hind, anek, tiro].map((f) => f.className).join(" ");
export const FONT_CSS = {
  "noto-serif": serif.style.fontFamily,
  "noto-sans": sans.style.fontFamily,
  "hind-madurai": hind.style.fontFamily,
  anek: anek.style.fontFamily,
  tiro: tiro.style.fontFamily,
  kavivanar: kavivanar.style.fontFamily,
  "mukta-malar": muktaMalar.style.fontFamily,
  catamaran: catamaran.style.fontFamily,
  pavanam: pavanam.style.fontFamily,
  "baloo-thambi-2": balooThambi.style.fontFamily,
  "meera-inimai": meeraInimai.style.fontFamily,
  arima: arima.style.fontFamily,
  coiny: coiny.style.fontFamily,
  oi: oi.style.fontFamily,
};
