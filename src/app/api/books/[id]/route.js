// Admin Book update / archive. Every change that can alter public content (publish, unpublish, archive,
// restore, slug or text edits) refreshes the public site through the same authenticated channel as writings.
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import { Book } from "@/models";
import { requireAuth, validateOrigin } from "@/lib/auth";
import { buildBookChanges } from "@/lib/book-service";
import { notifyPortfolio } from "@/lib/revalidate";
import { isBookPublic } from "@/lib/content-contract/book-visibility.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Book not found" }, { status: 404 });

export async function GET(request, { params }) {
  const auth = await requireAuth(request, ["admin"]);
  if (!auth.authorized) return auth.response;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return notFound();
  await connectDB();
  const book = await Book.findById(id).lean();
  return book ? NextResponse.json({ book }) : notFound();
}

async function apply(request, id, forced) {
  if (!mongoose.isValidObjectId(id)) return notFound();
  const body = forced ? { status: forced } : await request.json().catch(() => null);
  const { changes, errors } = buildBookChanges(body, { partial: true });
  if (errors.length) return NextResponse.json({ error: "Invalid book", details: errors }, { status: 400 });
  try {
    await connectDB();
    const book = await Book.findById(id);
    if (!book) return notFound();
    const before = { slug: book.slug, wasPublic: isBookPublic(book) };
    book.set(changes);
    await book.save();
    const after = isBookPublic(book);
    // Refresh whenever the book was or is public: covers publish, unpublish, archive, restore, rename, edits.
    let revalidate = { status: "skipped" };
    if (before.wasPublic || after) {
      const previousSlugs = [...new Set([before.slug, ...(book.slugHistory || []).map((h) => h.slug)])].filter((s) => s && s !== book.slug);
      revalidate = await notifyPortfolio({ slug: book.slug, previousSlugs, section: "book" });
    }
    return NextResponse.json({ book, revalidate });
  } catch (e) {
    if (e?.code === 11000 || /already used/.test(e?.message || "")) return NextResponse.json({ error: "That slug is already in use" }, { status: 409 });
    if (e?.name === "ValidationError") return NextResponse.json({ error: "Invalid book" }, { status: 400 });
    console.error("update book failed:", e?.message);
    return NextResponse.json({ error: "Failed to update book" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ["admin"]);
  if (!auth.authorized) return auth.response;
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: "Forbidden: Invalid request origin" }, { status: 403 });
  }
  return apply(request, (await params).id);
}
export async function PATCH(request, { params }) {
  const auth = await requireAuth(request, ["admin"]);
  if (!auth.authorized) return auth.response;
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: "Forbidden: Invalid request origin" }, { status: 403 });
  }
  return apply(request, (await params).id);
}

// DELETE archives (soft). Hard deletion of a Book is deliberately not offered.
export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ["admin"]);
  if (!auth.authorized) return auth.response;
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: "Forbidden: Invalid request origin" }, { status: 403 });
  }
  return apply(request, (await params).id, "archived");
}
