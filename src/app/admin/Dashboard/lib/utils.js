// src/app/admin/Dashboard/lib/utils.js
export const calculateStats = (items) => {
    const total = items.length;
    const published = items.filter(item => item.status === 'published').length;
    return {
      total,
      published,
      draft: total - published
    };
  };