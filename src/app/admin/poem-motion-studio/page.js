import { fontClass } from "./fonts";
import MotionStudio from "./MotionStudio";

export const metadata = {
  title: "Poem Motion Studio · Admin",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    // fontClass registers the Tamil faces the canvas draws with; the Studio chrome keeps the Admin UI font
    // (the first class alone would otherwise turn every button and label serif).
    <div
      className={fontClass}
      style={{
        fontFamily:
          "var(--font-inter), var(--font-noto-tamil), system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <MotionStudio />
    </div>
  );
}
