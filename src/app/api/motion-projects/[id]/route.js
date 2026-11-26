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

// Editors may only change or delete their own projects; admins may manage any. Legacy rows without an owner stay open.
const owns = (auth, p) => auth.user.role === "admin" || !p.createdBy || p.createdBy === String(auth.user.userId);
const denied = () => NextResponse.json({ error: "Forbidden: not your project" }, { status: 403 });
const bad = () => NextResponse.json({ error: "Project not found" }, { status: 404 });

export async function GET(request, { params }) {
  const auth = await requireAuth(request, ["admin", "editor"]);
  if (!auth.authorized) return auth.response;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return bad();
  await connectDB();
  const p = await MotionProject.findById(id).lean();
  if (!p) return bad();
  let sourceChanged = false, sourceMissing = false;
  if (p.sourceWritingId) {
    const w = await Writing.findById(p.sourceWritingId).select("title body content contentFormat version").lean();
    if (!w) sourceMissing = true;
    else sourceChanged = poemHash(poemFromWriting(w)) !== p.sourceHash;
  }
  return NextResponse.json({ project: p, sourceChanged, sourceMissing });
}

export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ["admin", "editor"]);
  if (!auth.authorized) return auth.response;
  if (!validateOrigin(request)) return NextResponse.json({ error: "Forbidden: Invalid request origin" }, { status: 403 });
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return bad();
  try {
    const body = await request.json();
    const set = {};
    if (body?.name !== undefined) {
      const n = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
      if (!n) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      set.name = n;
    }
    if (body?.composition !== undefined) set.composition = normalizeComposition(body.composition);
    await connectDB();
    const existing = await MotionProject.findById(id).select("createdBy").lean();
    if (!existing) return bad();
    if (!owns(auth, existing)) return denied();
    // acknowledgeSource: re-sync the stored hash after the author reviewed a changed poem
    if (body?.acknowledgeSource === true) {
      const cur = await MotionProject.findById(id).select("sourceWritingId").lean();
      if (!cur) return bad();
      if (cur.sourceWritingId) {
        const w = await Writing.findById(cur.sourceWritingId).select("title body content contentFormat version").lean();
        if (w) { set.sourceHash = poemHash(poemFromWriting(w)); if (Number.isFinite(w.version)) set.sourceVersion = w.version; }
      }
    }
    const p = await MotionProject.findByIdAndUpdate(id, { $set: set, $inc: { revision: 1 } }, { new: true }).lean();
    return p ? NextResponse.json({ project: p }) : bad();
  } catch (e) {
    if (e instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    console.error("motion-projects update:", e);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ["admin", "editor"]);
  if (!auth.authorized) return auth.response;
  if (!validateOrigin(request)) return NextResponse.json({ error: "Forbidden: Invalid request origin" }, { status: 403 });
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return bad();
  await connectDB();
  const existing = await MotionProject.findById(id).select("createdBy").lean();
  if (!existing) return bad();
  if (!owns(auth, existing)) return denied();
  const r = await MotionProject.findByIdAndDelete(id);
  return r ? NextResponse.json({ ok: true }) : bad();
}
