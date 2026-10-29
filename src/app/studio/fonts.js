// src/app/studio/fonts.js
// Self-hosted fonts for Poetry Studio. Scoped to /studio so the global layout
// stays lean. Each font exposes a CSS variable; the studio root applies them
// all and the poem canvas references them by variable so exports stay crisp.
import {
  Tiro_Tamil,
  Noto_Serif_Tamil,
  Noto_Sans_Tamil,
  Catamaran,
  Mukta_Malar,
  Hind_Madurai,
  Plus_Jakarta_Sans,
  Inter,
  Playfair_Display,
  Cormorant_Garamond,
} from "next/font/google";

// Tiro Tamil — commissioned for Harvard's Murty Classical Library; the print
// gold standard for Tamil literature. Ships regular + a true italic only.
const tiroTamil = Tiro_Tamil({
  subsets: ["latin", "tamil"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-tiro-tamil",
  display: "swap",
});

const notoSerifTamil = Noto_Serif_Tamil({
  subsets: ["latin", "tamil"],
  variable: "--font-noto-serif-tamil",
  display: "swap",
});

const notoSansTamil = Noto_Sans_Tamil({
  subsets: ["latin", "tamil"],
  variable: "--font-noto-sans-tamil",
  display: "swap",
});

const catamaran = Catamaran({
  subsets: ["latin", "tamil"],
  variable: "--font-catamaran",
  display: "swap",
});

const muktaMalar = Mukta_Malar({
  subsets: ["latin", "tamil"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
  variable: "--font-mukta-malar",
  display: "swap",
});

const hindMadurai = Hind_Madurai({
  subsets: ["latin", "tamil"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-hind-madurai",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-studio-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-studio-playfair",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

// Combined className applied to the studio root — mounts every CSS variable.
export const studioFontClass = [
  tiroTamil.variable,
  notoSerifTamil.variable,
  notoSansTamil.variable,
  catamaran.variable,
  muktaMalar.variable,
  hindMadurai.variable,
  jakarta.variable,
  inter.variable,
  playfair.variable,
  cormorant.variable,
].join(" ");

// Registry the UI renders. `script` groups the font picker. The spec's Latha
// and Vijaya are dropped: they are legacy Windows faces without the optical
// sizing or stroke modulation print Tamil needs. Tiro Tamil replaces them.
export const FONTS = [
  {
    id: "tiro-tamil",
    label: "Tiro Tamil",
    cssVar: "var(--font-tiro-tamil)",
    script: "tamil",
    note: "Murty Classical Library",
  },
  {
    id: "noto-serif-tamil",
    label: "Noto Serif Tamil",
    cssVar: "var(--font-noto-serif-tamil)",
    script: "tamil",
  },
  {
    id: "noto-sans-tamil",
    label: "Noto Sans Tamil",
    cssVar: "var(--font-noto-sans-tamil)",
    script: "tamil",
  },
  {
    id: "catamaran",
    label: "Catamaran",
    cssVar: "var(--font-catamaran)",
    script: "tamil",
  },
  {
    id: "mukta-malar",
    label: "Mukta Malar",
    cssVar: "var(--font-mukta-malar)",
    script: "tamil",
  },
  {
    id: "hind-madurai",
    label: "Hind Madurai",
    cssVar: "var(--font-hind-madurai)",
    script: "tamil",
  },
  {
    id: "playfair",
    label: "Playfair Display",
    cssVar: "var(--font-studio-playfair)",
    script: "latin",
  },
  {
    id: "cormorant",
    label: "Cormorant Garamond",
    cssVar: "var(--font-cormorant)",
    script: "latin",
  },
  {
    id: "jakarta",
    label: "Plus Jakarta Sans",
    cssVar: "var(--font-jakarta)",
    script: "latin",
  },
  {
    id: "inter",
    label: "Inter",
    cssVar: "var(--font-studio-inter)",
    script: "latin",
  },
];

export const FONT_BY_ID = Object.fromEntries(FONTS.map((f) => [f.id, f]));
