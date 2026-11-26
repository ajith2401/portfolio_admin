import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import { Writing } from "@/models";
import MotionProject from "@/lib/motion-studio/project-model";
import { normalizeComposition } from "@/lib/motion-studio/composition";
import { poemFromWriting } from "@/lib/motion-studio/poem";
import { poemHash } from "@/lib/motion-studio/poem-hash";
import { requireAuth, validateOrigin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cleanName = (v) => (typeof v === "string" ? v.trim().slice(0, 120) : "");

export async function GET(request) {
  const auth = await requireAuth(request, ["admin", "editor"]);
  if (!auth.authorized) return auth.response;
  try {
    await connectDB();
    const rows = await MotionProject.find({}, { name: 1, sourceTitle: 1, "composition.format": 1, "composition.templateId": 1, updatedAt: 1 })
      .sort({ updatedAt: -1 }).limit(100).lean();
    return NextResponse.json({ projects: rows });
  } catch (e) {
    console.error("motion-projects list:", e);
    return NextResponse.json({ error: "Failed to list projects" }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireAuth(request, ["admin", "editor"]);
  if (!auth.authorized) return auth.response;
  if (!validateOrigin(request)) return NextResponse.json({ error: "Forbidden: Invalid request origin" }, { status: 403 });
  try {
    const body = await request.json();
    const name = cleanName(body?.name);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    await connectDB();
    let source = {};
    if (body?.sourceWritingId != null) {
      if (!mongoose.isValidObjectId(body.sourceWritingId)) return NextResponse.json({ error: "Invalid source writing" }, { status: 400 });
      const w = await Writing.findById(body.sourceWritingId).select("title body content contentFormat version").lean();
      if (!w) return NextResponse.json({ error: "Source writing not found" }, { status: 404 });
      source = { sourceWritingId: w._id, sourceTitle: String(w.title || "").slice(0, 300), sourceHash: poemHash(poemFromWriting(w)), sourceVersion: Number.isFinite(w.version) ? w.version : undefined };
    }
    const composition = normalizeComposition(body?.composition);
    // A poem typed/pasted/imported in the Studio is stored ONLY as this project's own snapshot (composition.poem), after the
    // author explicitly chose "Save project to Admin". It never creates or touches a Writing record.
    if (body?.sourceWritingId == null && composition.poem) {
      source = { sourceKind: "manual", sourceTitle: composition.poem.title.slice(0, 300), sourceHash: poemHash({ stanzas: composition.poem.stanzas }) };
    } else if (source.sourceWritingId) source.sourceKind = "writing";
    const doc = await MotionProject.create({ name, ...source, createdBy: String(auth.user.userId || "").slice(0, 64), composition });
    return NextResponse.json({ project: doc }, { status: 201 });
  } catch (e) {
    if (e instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    console.error("motion-projects create:", e);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
