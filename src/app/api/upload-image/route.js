// src/app/api/upload-image/route.js
import { NextResponse } from 'next/server';
import { uploadImage } from '@/lib/cloudinary';
import { requireAuth, validateOrigin } from '@/lib/auth';
import { applyRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Validates file signature (magic bytes) to ensure file matches declared image MIME type
 * @param {Buffer} buffer 
 * @param {string} mimeType 
 * @returns {boolean}
 */
function validateImageMagicBytes(buffer, mimeType) {
  if (!buffer || buffer.length < 12) return false;

  // JPEG: FF D8 FF
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (mimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }

  // GIF: GIF87a or GIF89a (47 49 46 38)
  if (mimeType === 'image/gif') {
    return (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38
    );
  }

  // WEBP: RIFF (52 49 46 46) .... WEBP (57 45 42 50)
  if (mimeType === 'image/webp') {
    return (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    );
  }

  return false;
}

export async function POST(request) {
  const auth = await requireAuth(request, ['admin', 'editor']);
  if (!auth.authorized) {
    return auth.response;
  }

  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden: Invalid request origin' }, { status: 403 });
  }

  const rateLimit = applyRateLimit(request, 'upload-image', 20, 60 * 1000);
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  try {
    const formData = await request.formData();
    const image = formData.get('image');

    if (!image || typeof image !== 'object') {
      return NextResponse.json(
        { message: 'No valid image file provided' },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.has(image.type)) {
      return NextResponse.json(
        { message: 'Invalid file type. Only JPEG, PNG, WEBP, and GIF images are allowed' },
        { status: 400 }
      );
    }

    if (image.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { message: 'Image size exceeds maximum limit of 5MB' },
        { status: 400 }
      );
    }

    const arrayBuffer = await image.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!validateImageMagicBytes(buffer, image.type)) {
      return NextResponse.json(
        { message: 'File contents do not match the expected image signature' },
        { status: 400 }
      );
    }

    const base64Image = buffer.toString('base64');
    const dataURI = `data:${image.type};base64,${base64Image}`;
    
    const result = await uploadImage(dataURI);

    return NextResponse.json({ success: true, imageUrls: result });
  } catch (error) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      { success: false, message: 'Image processing failed' },
      { status: 500 }
    );
  }
}
