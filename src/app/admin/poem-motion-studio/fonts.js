// Tamil fonts for Poem Motion Studio, self-hosted by next/font (no runtime request to Google).
// next/font renames families, so the real CSS family strings are exported for the canvas renderer.
// Options must be literal objects (next/font requirement). The font list itself lives in lib/motion-studio/font-registry.js.
import {
  Noto_Serif_Tamil, Noto_Sans_Tamil, Hind_Madurai, Anek_Tamil, Tiro_Tamil,
  Kavivanar, Mukta_Malar, Catamaran, Pavanam, Baloo_Thambi_2, Meera_Inimai, Arima, Coiny, Oi,
} from "next/font/google";
import localFont from "next/font/local";
import { canvasFamily } from "@/lib/motion-studio/font-ready";
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
// LOCAL (not on Google Fonts): the ORIGINAL, unmodified OFL files with their OFL.txt beside them (fonts-local/<family>/;
// copies also served at /fonts/licenses/). Korkai/Panai/Vaagai carry Reserved Font Names, so the files are never
// subset, converted or renamed. No synthetic fallback face (adjustFontFallback:false), never preloaded.
const korkai = localFont({
  src: [
    { path: "./fonts-local/korkai/Korkai-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts-local/korkai/Korkai-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts-local/korkai/Korkai-Bold.ttf", weight: "700", style: "normal" },
  ],
  display: "swap", preload: false, adjustFontFallback: false,
});
const panai = localFont({ src: [{ path: "./fonts-local/panai/PanaiVF.ttf", weight: "200 900", style: "normal" }], display: "swap", preload: false, adjustFontFallback: false });
const vaagai = localFont({ src: [{ path: "./fonts-local/vaagai/Vaagai-Regular.ttf", weight: "400", style: "normal" }], display: "swap", preload: false, adjustFontFallback: false });
const neythal = localFont({ src: [{ path: "./fonts-local/neythal/neythal-regular.ttf", weight: "400", style: "normal" }], display: "swap", preload: false, adjustFontFallback: false });
// Only the verified five set the page's class (unchanged); candidates' @font-face rules ship with this module's CSS.
export const fontClass = [serif, sans, hind, anek, tiro].map((f) => f.className).join(" ");
// canvasFamily(): drop next/font's local() "<Font> Fallback" face, which errors on Android and makes Chrome reject the
// whole font string (see font-ready.js). Page CSS (fontClass) is unchanged.
const SERIF_IDS = new Set(["noto-serif", "tiro", "korkai", "arima", "kavivanar", "vaagai"]);
export const FONT_CSS = Object.fromEntries(Object.entries({
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
  korkai: korkai.style.fontFamily,
  panai: panai.style.fontFamily,
  vaagai: vaagai.style.fontFamily,
  neythal: neythal.style.fontFamily,
}).map(([k, v]) => [k, canvasFamily(v, SERIF_IDS.has(k) ? "serif" : "sans-serif")]));
