// src/app/api/delete-image/route.js
import { NextResponse } from 'next/server';
import { deleteImage } from '@/lib/cloudinary';
import { requireAuth, validateOrigin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request) {
  const auth = await requireAuth(request, ['admin']);
  if (!auth.authorized) {
    return auth.response;
  }

  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden: Invalid request origin' }, { status: 403 });
  }

  try {
    const data = await request.json().catch(() => null);
    if (!data || !data.imageUrl || typeof data.imageUrl !== 'string') {
      return NextResponse.json(
        { message: 'Valid image URL is required' },
        { status: 400 }
      );
    }

    const { imageUrl } = data;

    // Validate that the image URL is a valid Cloudinary URL
    let parsedUrl;
    try {
      parsedUrl = new URL(imageUrl);
    } catch {
      return NextResponse.json({ message: 'Malformed image URL' }, { status: 400 });
    }

    if (!parsedUrl.hostname.endsWith('cloudinary.com')) {
      return NextResponse.json({ message: 'URL does not belong to the allowed media storage provider' }, { status: 400 });
    }

    await deleteImage(imageUrl);

    return NextResponse.json({ success: true, message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting image:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete image' },
      { status: 500 }
    );
  }
}
