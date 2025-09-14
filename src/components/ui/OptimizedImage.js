'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { LoadingSpinner } from './LoadingState';

export function OptimizedImage({ 
  src, 
  alt, 
  width, 
  height,
  sizes = '100vw',
  priority = false,
  className = '',
  onLoad,
  onError
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [blurUrl, setBlurUrl] = useState(null);

  useEffect(() => {
    // Generate blur placeholder
    if (src) {
      generateBlurPlaceholder(src)
        .then(url => setBlurUrl(url))
        .catch(console.error);
    }
  }, [src]);

  const handleLoad = (e) => {
    setLoading(false);
    if (onLoad) onLoad(e);
  };

  const handleError = (e) => {
    setLoading(false);
    setError(true);
    if (onError) onError(e);
  };

  if (error) {
    return (
      <div className={`bg-muted flex items-center justify-center ${className}`}
           style={{ width, height }}>
        <span className="text-sm text-muted-foreground">Image failed to load</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        priority={priority}
        className={`transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'} ${className}`}
        onLoad={handleLoad}
        onError={handleError}
        placeholder={blurUrl ? 'blur' : 'empty'}
        blurDataURL={blurUrl}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
          <LoadingSpinner size="small" />
        </div>
      )}
    </div>
  );
}

async function generateBlurPlaceholder(src) {
  try {
    const response = await fetch(src);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    console.error('Error generating blur placeholder:', error);
    return null;
  }
}

// Image upload with preview and optimization
export function ImageUpload({ 
  value, 
  onChange, 
  maxSize = 5, // in MB
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'],
  aspectRatio = 16/9,
  className = '' 
}) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);

  const validateFile = (file) => {
    if (!file) return 'No file selected';
    if (!acceptedTypes.includes(file.type)) return 'Invalid file type';
    if (file.size > maxSize * 1024 * 1024) return `File size must be less than ${maxSize}MB`;
    return null;
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    const error = validateFile(file);
    if (error) {
      setError(error);
      return;
    }

    try {
      // Create optimized version
      const optimizedFile = await optimizeImage(file, {
        maxWidth: 1200,
        quality: 0.8,
        format: 'webp'
      });

      // Generate preview
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result);
      reader.readAsDataURL(optimizedFile);

      onChange(optimizedFile);
      setError(null);
    } catch (err) {
      setError('Failed to process image');
      console.error('Image processing error:', err);
    }
  };

  return (
    <div className={className}>
      <input
        type="file"
        accept={acceptedTypes.join(',')}
        onChange={handleFileChange}
        className="hidden"
        id="image-upload"
      />
      <label
        htmlFor="image-upload"
        className="cursor-pointer block p-4 border-2 border-dashed rounded-lg hover:border-primary transition-colors"
      >
        {preview ? (
          <OptimizedImage
            src={preview}
            alt="Upload preview"
            width={400}
            height={400 / aspectRatio}
            className="rounded-lg"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2">
            <span className="text-sm text-muted-foreground">
              Click or drag to upload image
            </span>
            <span className="text-xs text-muted-foreground">
              {acceptedTypes.join(', ')} up to {maxSize}MB
            </span>
          </div>
        )}
      </label>
      {error && (
        <p className="text-destructive text-sm mt-1">{error}</p>
      )}
    </div>
  );
}

async function optimizeImage(file, options = {}) {
  const { maxWidth = 1200, quality = 0.8, format = 'webp' } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      // Draw and optimize
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to WebP
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to convert image'));
            return;
          }
          resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '.webp'), {
            type: 'image/webp'
          }));
        },
        `image/${format}`,
        quality
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
