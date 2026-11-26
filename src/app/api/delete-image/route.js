// src/app/api/delete-image/route.js
// Removes one image from ONE writing. The asset must be referenced by that writing, must be one of our own
// Cloudinary URLs, and must not be shared with any other document.
import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import { Writing } from '@/models';
import { requireAuth, validateOrigin } from '@/lib/auth';
import { deleteOwnedImages } from '@/lib/image-cleanup';
import { cloudinaryPublicId } from '@/lib/image-ownership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEYS = ['small', 'medium', 'large', 'thumbnail'];

export async function DELETE(request) {
  const auth = await requireAuth(request, ['admin']);
  if (!auth.authorized) return auth.response;
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden: Invalid request origin' }, { status: 403 });
  }

  const data = await request.json().catch(() => null);
  const { writingId, imageUrl } = data || {};
  if (typeof writingId !== 'string' || !mongoose.isValidObjectId(writingId)) {
    return NextResponse.json({ message: 'A valid writingId is required' }, { status: 400 });
  }
  if (typeof imageUrl !== 'string' || !cloudinaryPublicId(imageUrl)) {
    return NextResponse.json({ message: 'Not a deletable image URL' }, { status: 400 });
  }

  try {
    await connectDB();
    const writing = await Writing.findById(writingId).select('images').lean();
    if (!writing) return NextResponse.json({ message: 'Writing not found' }, { status: 404 });

    const keys = KEYS.filter((k) => writing.images?.[k] === imageUrl);
    if (!keys.length) {
      // Same status for "not yours" and "not there": no oracle for other writings' assets.
      return NextResponse.json({ message: 'Image is not attached to this writing' }, { status: 404 });
    }

    // Detach first so the shared-asset check and the writing agree, then destroy if nothing else uses it.
    await Writing.updateOne({ _id: writingId }, { $unset: Object.fromEntries(keys.map((k) => [`images.${k}`, ''])) });
    const result = await deleteOwnedImages([imageUrl], { ownerModel: 'Writing', ownerId: writing._id });
    return NextResponse.json({
      success: true,
      detached: keys.length,
      deleted: result.deleted.length,
      keptBecauseShared: result.skipped.some((s) => s.reason === 'shared'),
    });
  } catch (error) {
    console.error('Error deleting image:', error?.message);
    return NextResponse.json({ success: false, message: 'Failed to delete image' }, { status: 500 });
  }
}
