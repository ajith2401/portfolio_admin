// src/app/api/delete-image/route.js
import { NextResponse } from 'next/server';
import { deleteImage } from '@/lib/cloudinary';

export async function DELETE(request) {
  try {
    // Parse the JSON body from the request
    const data = await request.json();
    const { imageUrl } = data;

    if (!imageUrl) {
      return NextResponse.json(
        { message: 'No image URL provided' },
        { status: 400 }
      );
    }

    await deleteImage(imageUrl);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting image:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}