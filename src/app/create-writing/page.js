import { redirect } from "next/navigation";

// The old Markdown form is retired. The Tiptap studio is the only authoring path.
export default function CreateWritingPage() {
  redirect("/admin/writings/new");
}
