// Admin Book list + create. Public reads stay on the Portfolio site.
import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { Book } from "@/models";
import { requireAuth, validateOrigin } from "@/lib/auth";
import { buildBookChanges } from "@/lib/book-service";
import { notifyPortfolio } from "@/lib/revalidate";
import { isBookPublic } from "@/lib/content-contract/book-visibility.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireAuth(request, ["admin"]);
  if (!auth.authorized) return auth.response;
  await connectDB();
  const books = await Book.find({}).select("title slug status publishYear featured updatedAt").sort({ updatedAt: -1 }).limit(200).lean();
  return NextResponse.json({ books });
}

export async function POST(request) {
  const auth = await requireAuth(request, ["admin"]);
  if (!auth.authorized) return auth.response;
  if (!validateOrigin(request)) return NextResponse.json({ error: "Forbidden: Invalid request origin" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const { changes, errors } = buildBookChanges(body);
  if (errors.length) return NextResponse.json({ error: "Invalid book", details: errors }, { status: 400 });
  try {
    await connectDB();
    const book = await Book.create({ status: "draft", ...changes });
    const revalidate = isBookPublic(book) ? await notifyPortfolio({ slug: book.slug, section: "book" }) : { status: "skipped" };
    return NextResponse.json({ book, revalidate }, { status: 201 });
  } catch (e) {
    if (e?.code === 11000) return NextResponse.json({ error: "That slug is already in use" }, { status: 409 });
    if (e?.name === "ValidationError") return NextResponse.json({ error: "Invalid book" }, { status: 400 });
    console.error("create book failed:", e?.message);
    return NextResponse.json({ error: "Failed to create book" }, { status: 500 });
  }
}
