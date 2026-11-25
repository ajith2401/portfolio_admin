// src/app/api/writings/route.js
import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { Writing } from "@/models";
import { uploadImage } from "@/lib/cloudinary";
import { notifyWritingSubscribers } from "@/lib/notificationHandler";
import { getAuthenticatedUser, requireAuth, validateOrigin } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rateLimit";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  buildWritingChanges,
  toPublicShape,
  CATEGORIES,
  LANGUAGES,
} from "@/lib/writing-service";
import { notifyPortfolio } from "@/lib/revalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIBRARY_FIELDS = {
  title: 1,
  slug: 1,
  excerpt: 1,
  category: 1,
  language: 1,
  status: 1,
  contentFormat: 1,
  version: 1,
  publishedAt: 1,
  createdAt: 1,
  updatedAt: 1,
  lastModified: 1,
  wordCount: 1,
  readTime: 1,
  featured: 1,
  trending: 1,
  "images.thumbnail": 1,
  "images.small": 1,
  "seo.robots": 1,
  importedFrom: 1,
};
const STATUS_RANK = { draft: 0, published: 1, archived: 2 };

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);

    // Check authentication to determine whether drafts may be viewed
    const auth = await getAuthenticatedUser(request);
    const isAuthenticatedAdmin =
      auth.valid && ["admin", "editor"].includes(auth.user.role);

    const query = {};

    // Category / language filters: only allow known values (never pass objects/operators through)
    const category = searchParams.get("category");
    if (category && category !== "All Writings") {
      if (!CATEGORIES.includes(category)) {
        return NextResponse.json(
          { error: "Unknown category" },
          { status: 400 },
        );
      }
      query.category = category;
    }
    const language = searchParams.get("language");
    if (language) {
      if (!LANGUAGES.includes(language)) {
        return NextResponse.json(
          { error: "Unknown language" },
          { status: 400 },
        );
      }
      query.language = language;
    }

    // Unauthenticated callers may ONLY retrieve published content.
    if (!isAuthenticatedAdmin) {
      query.status = "published";
    } else {
      const status = searchParams.get("status");
      if (status) {
        if (!["draft", "published", "archived"].includes(status)) {
          return NextResponse.json(
            { error: "Unknown status" },
            { status: 400 },
          );
        }
        query.status = status;
      }
    }

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate && !Number.isNaN(new Date(startDate).getTime())) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
      }
      if (endDate && !Number.isNaN(new Date(endDate).getTime())) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
      if (!Object.keys(query.createdAt).length) delete query.createdAt;
    }

    const search = (searchParams.get("search") || "").trim().slice(0, 100);
    if (search) {
      query.$text = { $search: search };
    }

    const sortBy = searchParams.get("sortBy") || "date";
    const sort = {};
    switch (sortBy) {
      case "rating":
        sort.averageRating = -1;
        sort.createdAt = -1;
        break;
      case "oldest":
        sort.createdAt = 1;
        break;
      case "title":
        sort.title = 1;
        break;
      case "updated":
        sort.updatedAt = -1;
        break;
      case "date":
      default:
        sort.createdAt = -1;
        break;
    }

    const parsedPage = parseInt(searchParams.get("page") || "1", 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const parsedLimit = parseInt(searchParams.get("limit") || "12", 10);
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 50)
        : 12;
    const skip = (page - 1) * limit;

    let writings;
    if (isAuthenticatedAdmin && searchParams.get("view") === "library") {
      // Content library: drafts first, then published, then archived; newest edit first. Never loads bodies.
      const rows = await Writing.aggregate([
        { $match: query },
        {
          $addFields: {
            _rank: {
              $switch: {
                branches: Object.entries(STATUS_RANK).map(([k, v]) => ({
                  case: { $eq: ["$status", k] },
                  then: v,
                })),
                default: 3,
              },
            },
          },
        },
        {
          $sort:
            sortBy === "updated" || sortBy === "date"
              ? { _rank: 1, updatedAt: -1 }
              : { _rank: 1, ...sort },
        },
        { $skip: skip },
        { $limit: limit },
        { $project: { ...LIBRARY_FIELDS, _id: 1 } },
      ]);
      writings = rows.map((r) => ({
        ...r,
        importedFrom: r.importedFrom
          ? {
              importedAt: r.importedFrom.importedAt,
              hasOriginal: Boolean(r.importedFrom.markdown),
            }
          : undefined,
      }));
    } else {
      writings = await Writing.find(query)
        .select(
          "title slug excerpt body images publishedAt category language averageRating totalRatings status featured trending performance contentFormat",
        )
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();
    }

    const total = await Writing.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const currentPage = page > totalPages ? totalPages : page;

    return NextResponse.json({
      writings,
      pagination: { total, pages: totalPages, current: currentPage, limit },
      filters: {
        category: category || null,
        language: language || null,
        startDate: startDate || null,
        endDate: endDate || null,
        search: search || null,
        sortBy,
      },
    });
  } catch (error) {
    console.error("Error fetching writings:", error);
    return NextResponse.json(
      { error: "Failed to fetch writings" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
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

  const rateLimit = applyRateLimit(request, "create-writing", 30, 60 * 1000);
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  try {
    await connectDB();

    let input;
    let imageFile;
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      try {
        const formData = await request.formData();
        const raw = formData.get("writing") || formData.get("content");
        if (!raw) {
          return NextResponse.json(
            { error: "Writing data is required" },
            { status: 400 },
          );
        }
        input = typeof raw === "string" ? JSON.parse(raw) : raw;
        imageFile = formData.get("image");
      } catch {
        return NextResponse.json(
          { error: "Invalid form data" },
          { status: 400 },
        );
      }
    } else {
      try {
        input = await request.json();
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON data" },
          { status: 400 },
        );
      }
    }

    const plan = await buildWritingChanges({
      input,
      existing: null,
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
      return NextResponse.json(
        { error: "Validation failed", details: plan.errors },
        { status: plan.status },
      );
    }

    const data = { ...plan.set };
    if (imageFile && typeof imageFile === "object" && imageFile.type) {
      const allowedMimes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
      ];
      if (!allowedMimes.includes(imageFile.type)) {
        return NextResponse.json(
          { error: "Invalid image format. Allowed: JPEG, PNG, WEBP, GIF" },
          { status: 400 },
        );
      }
      if (imageFile.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Image size exceeds maximum allowed 5MB limit" },
          { status: 400 },
        );
      }
      try {
        const buffer = await imageFile.arrayBuffer();
        const dataURI = `data:${imageFile.type};base64,${Buffer.from(buffer).toString("base64")}`;
        const uploaded = await uploadImage(dataURI);
        for (const [k, v] of Object.entries(uploaded || {})) {
          if (
            ["small", "medium", "large", "thumbnail"].includes(k) &&
            typeof v === "string"
          )
            data[`images.${k}`] = v;
        }
      } catch (error) {
        console.error("Image upload error:", error);
        return NextResponse.json(
          { error: "Failed to upload image" },
          { status: 500 },
        );
      }
    }

    // Dotted paths (seo.title, images.alt ...) are expanded by Mongoose when passed through set().
    const doc = new Writing({});
    for (const [path, value] of Object.entries(data)) doc.set(path, value);
    doc.version = 1;
    await doc.save();

    let revalidate = { status: "skipped" };
    if (doc.status === "published") {
      notifyWritingSubscribers(doc).catch((error) =>
        console.error("Error sending writing notifications:", error),
      );
      revalidate = await notifyPortfolio({ slug: doc.slug });
    }

    return NextResponse.json(
      { ...toPublicShape(doc), warnings: plan.warnings, revalidate },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating writing:", error);
    if (error.name === "ValidationError") {
      const details = Object.values(error.errors).map((err) => err.message);
      return NextResponse.json(
        { error: "Validation failed", details },
        { status: 422 },
      );
    }
    if (error.code === 11000) {
      return NextResponse.json(
        { error: "A writing with this slug already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Failed to create writing" },
      { status: 500 },
    );
  }
}
