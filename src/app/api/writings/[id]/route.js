// src/app/api/writings/[id]/route.js
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import { Writing, Comment } from "@/models";
import { deleteImage, uploadImage } from "@/lib/cloudinary";
import { getAuthenticatedUser, requireAuth, validateOrigin } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rateLimit";
import { sanitizeHtml } from "@/lib/sanitize";
import { buildWritingChanges, toPublicShape } from "@/lib/writing-service";
import { notifyPortfolio } from "@/lib/revalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () =>
  NextResponse.json({ error: "Writing not found" }, { status: 404 });

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFound();

    const writing = await Writing.findById(id);
    if (!writing) return notFound();

    const auth = await getAuthenticatedUser(request);
    const isAdmin = auth.valid && ["admin", "editor"].includes(auth.user.role);

    // Drafts and archived writings are visible to authenticated editors only
    if (writing.status !== "published" && !isAdmin) return notFound();

    // Anonymous readers never receive rating e-mails, revisions or import backups
    return NextResponse.json(isAdmin ? writing : toPublicShape(writing));
  } catch (error) {
    console.error("Error fetching writing:", error);
    return NextResponse.json(
      { error: "Failed to fetch writing" },
      { status: 500 },
    );
  }
}

export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ["admin", "editor"]);
  if (!auth.authorized) {
    return auth.response;
  }

  if (!validateOrigin(request)) {
    return NextResponse.json(
      { error: "Forbidden: Invalid request origin" },
      { status: 403 },
    );
  }

  // Autosave is frequent but bounded
  const rateLimit = applyRateLimit(request, "update-writing", 240, 60 * 1000);
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFound();
    await connectDB();

    const existingDoc = await Writing.findById(id);
    if (!existingDoc) return notFound();
    const existing = JSON.parse(JSON.stringify(existingDoc.toObject()));

    const contentType = request.headers.get("content-type") || "";
    let input;
    let image = null;

    try {
      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        const rawData = formData.get("writing") || formData.get("content");
        input = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
        image = formData.get("image");
      } else if (contentType.includes("application/json")) {
        input = await request.json();
      } else {
        return NextResponse.json(
          { error: "Unsupported content type" },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const plan = await buildWritingChanges({
      input,
      existing,
      helpers: {
        exists: async (slug, excludeId) =>
          Boolean(
            await Writing.exists({
              slug,
              ...(excludeId ? { _id: { $ne: excludeId } } : {}),
            }),
          ),
        sanitizeBody: sanitizeHtml,
      },
    });
    if (!plan.ok) {
      const body = {
        error: plan.conflict ? "Conflict" : "Validation failed",
        details: plan.errors,
      };
      if (plan.currentVersion !== undefined)
        body.currentVersion = plan.currentVersion;
      return NextResponse.json(body, { status: plan.status });
    }

    const set = { ...plan.set };
    let oldImages = null;
    if (image && typeof image === "object" && image.type) {
      const allowedMimes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
      ];
      if (!allowedMimes.includes(image.type)) {
        return NextResponse.json(
          { error: "Invalid image format. Allowed: JPEG, PNG, WEBP, GIF" },
          { status: 400 },
        );
      }
      if (image.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Image size exceeds maximum allowed 5MB limit" },
          { status: 400 },
        );
      }
      try {
        const buffer = await image.arrayBuffer();
        const dataURI = `data:${image.type};base64,${Buffer.from(buffer).toString("base64")}`;
        const uploaded = await uploadImage(dataURI);
        for (const [k, v] of Object.entries(uploaded || {})) {
          if (
            ["small", "medium", "large", "thumbnail"].includes(k) &&
            typeof v === "string"
          )
            set[`images.${k}`] = v;
        }
        oldImages = existing.images || null;
      } catch (error) {
        console.error("Error handling image update:", error);
        return NextResponse.json(
          { error: "Failed to update image" },
          { status: 500 },
        );
      }
    }

    for (const [path, value] of Object.entries(set))
      existingDoc.set(path, value);
    // Compare-and-swap on the version: if anyone saved in between, the save matches nothing.
    existingDoc.$where = { version: input.version };
    try {
      await existingDoc.save();
    } catch (error) {
      if (error?.name === "DocumentNotFoundError") {
        return NextResponse.json(
          {
            error: "Conflict",
            details: [
              "This writing was changed elsewhere. Reload before saving.",
            ],
          },
          { status: 409 },
        );
      }
      throw error;
    }

    if (oldImages) {
      // Old files are removed only after the new version is safely stored
      Promise.all(
        Object.entries(oldImages)
          .filter(
            ([k, url]) =>
              ["small", "medium", "large", "thumbnail"].includes(k) &&
              typeof url === "string" &&
              !Object.values(set).includes(url),
          )
          .map(([, url]) => deleteImage(url)),
      ).catch((error) =>
        console.error("Failed to delete replaced image:", error),
      );
    }

    let revalidate = { status: "skipped" };
    if (existing.status === "published" || existingDoc.status === "published") {
      revalidate = await notifyPortfolio({
        slug: existingDoc.slug,
        previousSlugs: plan.slugChange ? [plan.slugChange.from] : [],
      });
    }

    return NextResponse.json({
      ...existingDoc.toObject(),
      ratings: undefined,
      warnings: plan.warnings,
      transition: plan.transition,
      slugChange: plan.slugChange,
      revalidate,
    });
  } catch (error) {
    console.error("Error updating writing:", error);
    if (error.name === "ValidationError") {
      const details = Object.values(error.errors).map((err) => err.message);
      return NextResponse.json(
        { error: "Validation failed", details },
        { status: 422 },
      );
    }
    if (error.code === 11000) {
      return NextResponse.json(
        { error: "Another writing already uses this slug" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Failed to update writing" },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ["admin"]);
  if (!auth.authorized) {
    return auth.response;
  }

  if (!validateOrigin(request)) {
    return NextResponse.json(
      { error: "Forbidden: Invalid request origin" },
      { status: 403 },
    );
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFound();

    const writing = await Writing.findById(id);
    if (!writing) return notFound();

    if (writing.images) {
      const imagePromises = Object.values(writing.images)
        .filter((url) => url && typeof url === "string")
        .map((url) => deleteImage(url));
      await Promise.all(imagePromises);
    }

    const wasPublished = writing.status === "published";
    const slug = writing.slug;
    await Comment.deleteMany({ parentId: id });
    await Writing.findByIdAndDelete(id);

    const revalidate = wasPublished
      ? await notifyPortfolio({ slug })
      : { status: "skipped" };
    return NextResponse.json({
      message: "Writing and associated data deleted successfully",
      revalidate,
    });
  } catch (error) {
    console.error("Error deleting writing:", error);
    return NextResponse.json(
      { error: "Failed to delete writing" },
      { status: 500 },
    );
  }
}
