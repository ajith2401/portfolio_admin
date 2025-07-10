// src/utils/slugGenerator.js

/**
 * Generate a URL-friendly slug from a string
 * @param {string} text - The text to convert to a slug
 * @returns {string} - The generated slug
 */
export function generateSlug(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .toLowerCase()
    .trim()
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, '-')
    // Remove special characters except hyphens
    .replace(/[^a-z0-9-]/g, '')
    // Remove multiple consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Limit length to 100 characters
    .substring(0, 100);
}

/**
 * Ensure a slug is unique by appending a number if necessary
 * @param {string} baseSlug - The base slug to check
 * @param {Function} checkExists - Function to check if slug exists (should return a document or null)
 * @param {string} excludeId - ID to exclude from uniqueness check (for updates)
 * @returns {Promise<string>} - The unique slug
 */
export async function ensureUniqueSlug(baseSlug, checkExists, excludeId = null) {
  if (!baseSlug) {
    throw new Error('Base slug is required');
  }

  let slug = baseSlug;
  let counter = 1;

  // Keep trying until we find a unique slug
  while (true) {
    const existing = await checkExists(slug, excludeId);
    
    if (!existing) {
      return slug;
    }

    // Append counter to make it unique
    slug = `${baseSlug}-${counter}`;
    counter++;

    // Prevent infinite loops
    if (counter > 1000) {
      throw new Error('Unable to generate unique slug after 1000 attempts');
    }
  }
}

/**
 * Validate if a slug is properly formatted
 * @param {string} slug - The slug to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function validateSlug(slug) {
  if (!slug || typeof slug !== 'string') {
    return false;
  }

  // Check if slug matches the required pattern
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slugPattern.test(slug) && slug.length <= 100;
}

/**
 * Clean and normalize a slug
 * @param {string} slug - The slug to clean
 * @returns {string} - The cleaned slug
 */
export function cleanSlug(slug) {
  if (!slug || typeof slug !== 'string') {
    return '';
  }

  return slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
} 