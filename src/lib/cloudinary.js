// src/lib/cloudinary.js
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Convert FormData File to buffer
async function fileToBuffer(file) {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export const uploadGeneratedImage = async (buffer, options = {}) => {
  try {
    // Add buffer validation with more detailed error
    if (!buffer || !(buffer instanceof Buffer)) {
      console.error('Invalid buffer:', buffer);
      throw new Error('Invalid image data provided');
    }

    // Add size check
    if (buffer.length === 0) {
      throw new Error('Empty image buffer provided');
    }

    // Create upload stream with more detailed configuration
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder || 'writings',
          resource_type: 'image', // Explicitly set resource type
          format: 'png',  // Specify format
          transformation: [
            { quality: 'auto:good' }, // Optimize quality
            { fetch_format: 'auto' },  // Auto select best format
            // Responsive versions
            { 
              width: 200, 
              height: 200, 
              crop: "fill", 
              quality: "auto",
              transformation: [
                { format: 'webp' }
              ]
            },
            { 
              width: 600, 
              height: 600, 
              crop: "fill", 
              quality: "auto",
              transformation: [
                { format: 'webp' }
              ]
            },
            { 
              width: 1200, 
              height: 1200, 
              crop: "fill", 
              quality: "auto",
              transformation: [
                { format: 'webp' }
              ]
            }
          ],
          ...options
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(new Error(`Failed to upload image: ${error.message}`));
            return;
          }

          if (!result || !result.secure_url) {
            reject(new Error('Invalid response from Cloudinary'));
            return;
          }

          resolve({
            original: result.secure_url,
            small: result.secure_url.replace('/upload/', '/upload/w_200,h_200,c_fill,q_auto,f_webp/'),
            medium: result.secure_url.replace('/upload/', '/upload/w_600,h_600,c_fill,q_auto,f_webp/'),
            large: result.secure_url.replace('/upload/', '/upload/w_1200,h_1200,c_fill,q_auto,f_webp/')
          });
        }
      );

      // Add error handling for the stream
      const stream = bufferToStream(buffer);
      stream.on('error', (error) => {
        console.error('Stream error:', error);
        reject(new Error('Failed to process image stream'));
      });

      stream.pipe(uploadStream);
    });
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    // Include more error details
    throw new Error(`Failed to upload image: ${error.message}`);
  }
};

// Improved buffer to stream conversion
const bufferToStream = (buffer) => {
  return new Readable({
    read() {
      try {
        this.push(buffer);
        this.push(null);
      } catch (error) {
        console.error('Error in stream read:', error);
        this.destroy(error);
      }
    }
  });
};

export const uploadImage = async (file) => {
  try {
    // Check if the file is a File object from FormData
    if (file instanceof File || (typeof File !== 'undefined' && file instanceof File)) {
      // Convert File to buffer
      const buffer = await fileToBuffer(file);
      
      // Create a stream from the buffer and upload
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'writings',
            resource_type: 'auto', // Auto-detect resource type
          },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              reject(new Error(`Failed to upload image: ${error.message}`));
              return;
            }
            
            resolve({
              small: result.secure_url.replace('/upload/', '/upload/w_200,h_200,c_fill,q_auto/'),
              medium: result.secure_url.replace('/upload/', '/upload/w_600,h_600,c_fill,q_auto/'),
              large: result.secure_url.replace('/upload/', '/upload/w_1200,h_1200,c_fill,q_auto/')
            });
          }
        );
        
        const stream = bufferToStream(buffer);
        stream.pipe(uploadStream);
      });
    } else {
      // If it's already a path or buffer, use it directly
      const result = await cloudinary.uploader.upload(file, {
        folder: 'writings',
        transformation: [
          { width: 200, height: 200, crop: "fill", quality: "auto" },
          { width: 600, height: 600, crop: "fill", quality: "auto" },
          { width: 1200, height: 1200, crop: "fill", quality: "auto" }
        ]
      });

      return {
        small: result.secure_url.replace('/upload/', '/upload/w_200,h_200,c_fill,q_auto/'),
        medium: result.secure_url.replace('/upload/', '/upload/w_600,h_600,c_fill,q_auto/'),
        large: result.secure_url.replace('/upload/', '/upload/w_1200,h_1200,c_fill,q_auto/')
      };
    }
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
};

// Destroys one asset by an already-validated public id (see image-ownership.js). Callers must not pass user input.
export const destroyAsset = async (publicId) => {
  if (typeof publicId !== 'string' || !/^writings\/[A-Za-z0-9_-]{1,100}$/.test(publicId)) {
    throw new Error('Refusing to delete: invalid public id');
  }
  return cloudinary.uploader.destroy(publicId);
};

// Legacy signature kept for callers; now strict: only our own Cloudinary URLs, never an arbitrary path segment.
// Prefer deleteOwnedImages() (image-cleanup.js), which also checks that the asset is not shared.
export const deleteImage = async (imageUrl) => {
  try {
    const publicId = cloudinaryPublicId(imageUrl);
    if (!publicId) return;
    await destroyAsset(publicId);
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error?.message);
  }
};
