// src/app/admin/Dashboard/lib/utils.js

// Fix: Added type checking to ensure items is an array before filtering
export const calculateStats = (items) => {
  // Make sure items is an array before attempting to use array methods
  if (!items || !Array.isArray(items)) {
    return {
      total: 0,
      published: 0,
      draft: 0
    };
  }

  const total = items.length;
  const published = items.filter(item => item.status === 'published').length;
  const draft = items.filter(item => item.status === 'draft').length;
  
  return {
    total,
    published,
    draft
  };
};