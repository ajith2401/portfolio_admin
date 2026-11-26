import { fontClass } from "./fonts";
import MotionStudio from "./MotionStudio";

export const metadata = { title: "Poem Motion Studio · Admin", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <div className={fontClass}>
      <MotionStudio />
    </div>
  );
}
