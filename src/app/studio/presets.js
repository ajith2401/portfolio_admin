// src/app/studio/presets.js
// Poetry Studio composes a single artefact: a flat, printed poetry-book page.
// Presets are *editions* (publishing contexts), not themes. One Physicality
// slider drives every optical effect; editions just set sensible starting points.

// Intrinsic canvas resolution. Preview is scaled-to-fit; export captures these
// dimensions x pixelRatio, so downloads are resolution-independent. The page is
// 2:3 — the proportion of most printed poetry collections.
export const ASPECTS = {
  book: { id: "book", label: "Page 2:3", w: 1080, h: 1620 },
  "4:5": { id: "4:5", label: "Post 4:5", w: 1080, h: 1350 },
  "1:1": { id: "1:1", label: "Square", w: 1080, h: 1080 },
  "9:16": { id: "9:16", label: "Story", w: 1080, h: 1920 },
};

// Paper stocks named as a printer would. `base` is the sheet; `wash` is soft
// uneven printed light layered over it at an intensity set by Physicality;
// `ink` is the text colour that reads right on that stock.
export const PAPERS = [
  {
    id: "fresh",
    label: "Fresh Print",
    base: "#FCFCFA",
    wash: "radial-gradient(120% 120% at 30% 15%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.04) 100%)",
    ink: "#1B1A18",
  },
  {
    id: "ivory",
    label: "Ivory",
    base: "#F6EFE1",
    wash: "radial-gradient(120% 110% at 25% 12%, rgba(255,251,240,0.7) 0%, rgba(0,0,0,0) 45%), radial-gradient(130% 130% at 80% 95%, rgba(120,95,55,0.12) 0%, rgba(0,0,0,0) 60%)",
    ink: "#2A241B",
  },
  {
    id: "library",
    label: "Library Copy",
    base: "#EBDCBE",
    wash: "radial-gradient(120% 120% at 20% 10%, rgba(255,246,222,0.6) 0%, rgba(0,0,0,0) 40%), radial-gradient(140% 140% at 90% 100%, rgba(120,82,30,0.25) 0%, rgba(0,0,0,0) 60%)",
    ink: "#3A2E1C",
  },
  {
    id: "handmade",
    label: "Handmade",
    base: "#E4D5B8",
    wash: "radial-gradient(120% 120% at 25% 15%, rgba(255,246,225,0.5) 0%, rgba(0,0,0,0) 45%), radial-gradient(140% 140% at 85% 95%, rgba(90,60,25,0.22) 0%, rgba(0,0,0,0) 60%)",
    ink: "#3B2F1B",
  },
];

export const PAPER_BY_ID = Object.fromEntries(PAPERS.map((p) => [p.id, p]));

export const END_MARKS = [
  { id: "none", label: "None", glyph: "" },
  { id: "square", label: "Square", glyph: "■" },
  { id: "dot", label: "Dot", glyph: "•" },
  { id: "asterism", label: "Asterism", glyph: "⁂" },
  { id: "fleuron", label: "Fleuron", glyph: "❦" },
];

// Editions — the heart of the restraint idea. Selecting one patches a slice of
// settings (face, scale, rhythm, stock, physicality). The reader adjusts from
// there. Order runs quiet → worn.
export const EDITIONS = [
  {
    id: "contemporary",
    label: "Contemporary",
    blurb: "Clean modern Tamil, roomy",
    patch: {
      fontId: "hind-madurai",
      fontSize: 46,
      fontWeight: 400,
      lineHeight: 1.7,
      stanzaSpacing: 1.0,
      textAlign: "left",
      titleAlign: "left",
      paperId: "fresh",
      physicality: 0.22,
      endMark: "dot",
    },
  },
  {
    id: "fine-print",
    label: "Fine Print",
    blurb: "Classic collection, Tiro Tamil",
    patch: {
      fontId: "tiro-tamil",
      fontSize: 46,
      fontWeight: 400,
      lineHeight: 1.72,
      stanzaSpacing: 0.9,
      textAlign: "left",
      titleAlign: "center",
      paperId: "ivory",
      physicality: 0.42,
      endMark: "square",
    },
  },
  {
    id: "beloved-book",
    label: "Beloved Book",
    blurb: "Aged, read a hundred times",
    patch: {
      fontId: "tiro-tamil",
      fontSize: 45,
      fontWeight: 400,
      lineHeight: 1.75,
      stanzaSpacing: 0.9,
      textAlign: "left",
      titleAlign: "center",
      paperId: "library",
      physicality: 0.74,
      endMark: "fleuron",
    },
  },
  {
    id: "journal",
    label: "Poet's Journal",
    blurb: "Handmade paper, intimate",
    patch: {
      fontId: "catamaran",
      fontSize: 48,
      fontWeight: 300,
      lineHeight: 1.7,
      stanzaSpacing: 1.0,
      textAlign: "left",
      titleAlign: "left",
      paperId: "handmade",
      physicality: 0.55,
      endMark: "dot",
    },
  },
  {
    id: "minimal",
    label: "Minimal",
    blurb: "The poem is enough",
    patch: {
      fontId: "tiro-tamil",
      fontSize: 50,
      fontWeight: 400,
      lineHeight: 1.8,
      stanzaSpacing: 1.0,
      textAlign: "center",
      titleAlign: "center",
      paperId: "fresh",
      physicality: 0.12,
      endMark: "none",
    },
  },
];

export const EDITION_BY_ID = Object.fromEntries(EDITIONS.map((e) => [e.id, e]));

// Physicality stages — a named label follows the slider so the value reads as a
// decision, not a number. Continuous underneath; these are just signposts.
export const PHYSICALITY_STAGES = [
  { at: 0.0, label: "Digital proof" },
  { at: 0.25, label: "Fine print" },
  { at: 0.5, label: "Freshly printed" },
  { at: 0.75, label: "Beloved book" },
  { at: 1.0, label: "Well-worn" },
];

export function physicalityLabel(p) {
  let best = PHYSICALITY_STAGES[0];
  for (const s of PHYSICALITY_STAGES)
    if (Math.abs(p - s.at) < Math.abs(p - best.at)) best = s;
  return best.label;
}

// Believable backside show-through. NOT the poem repeated: a quiet block of
// ordinary Tamil lines (self-authored, generic) standing in for the reverse
// page. At ~3% opacity, mirrored and blurred, it reads as texture, never words.
export const GHOST_PAGE = `காலை வெளிச்சம் மெல்ல விரிந்தது
நினைவுகள் நதியென அமைதியில் ஓடின
சொற்கள் மௌனத்தில் கரைந்து போயின
ஒரு பறவை தூரத்தில் பாடிக்கொண்டிருந்தது
நேற்றைய மழை இன்னும் இலைகளில் தங்கியிருந்தது
காற்று பக்கங்களை மெதுவாகப் புரட்டியது`;

// Sample poem seeds the canvas so it never opens blank (matches reference art).
export const SAMPLE_POEM = `யாரும் இல்லாத
இடத்திற்குப் போக வேண்டும்.

அங்கே
நான் கூட
இருக்கக்கூடாது.`;

export const DEFAULT_SETTINGS = {
  edition: "fine-print",
  text: SAMPLE_POEM,
  title: "கவிதை",
  author: "",
  footer: "அன்பினி",
  pageNumber: "103",
  showTitle: true,
  showAuthor: false,
  showFolio: true,
  showFooter: true,
  showGhost: true,
  endMark: "square",
  fontId: "tiro-tamil",
  fontSize: 46,
  fontWeight: 400,
  lineHeight: 1.72,
  letterSpacing: 0,
  stanzaSpacing: 0.9,
  textAlign: "left",
  titleAlign: "center",
  textColor: "#2A241B",
  paperId: "ivory",
  physicality: 0.42,
  gutter: true,
  pageSide: "recto",
  aspect: "book",
  padding: 150,
};
