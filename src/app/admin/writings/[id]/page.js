import WritingStudio from "../WritingStudio";

export const metadata = { title: "Edit writing · Admin", robots: { index: false, follow: false } };

export default async function WritingEditPage({ params }) {
  const { id } = await params;
  return <WritingStudio id={id} />;
}
