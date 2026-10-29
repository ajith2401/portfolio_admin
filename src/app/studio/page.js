// src/app/studio/page.js
// Server wrapper: mounts the studio font CSS variables on an ancestor so the
// poem canvas (and its full-res export) can reference every face by variable,
// without loading these fonts into the global app layout.
import { studioFontClass } from "./fonts";
import StudioApp from "./StudioApp";

export const metadata = {
  title: "Poetry Studio · Ajithkumar",
  description:
    "Create beautiful, book-quality poem images in Tamil and English.",
};

export default function StudioPage() {
  return (
    <div className={studioFontClass}>
      <StudioApp />
    </div>
  );
}
