// src/app/admin/Dashboard/lib/api.js
export const api = {
async fetchWritings(page = 1) {
  try {
    const res = await fetch(`/api/writings?page=${page}`);
    const data = await res.json();
    return data; // Return the full response object with writings and pagination
  } catch (error) {
    console.error('Error fetching writings:', error);
    return { writings: [], pagination: { total: 0, pages: 1, current: 1 } };
  }
},
  async fetchTechBlogs() {
    try {
      const res = await fetch('/api/tech-blog');
      const  data = await res.json();
      return data.techBlogs || []; // Extract techBlogs array from nested data
    } catch (error) {
      console.error('Error fetching tech blogs:', error);
      return [];
    }
  },

  async fetchProjects() {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      return data.projects || []; // Extract projects array from nested data
    } catch (error) {
      console.error('Error fetching projects:', error);
      return [];
    }
  },

  async createContent(type, data) {
    const res = await fetch(`/api/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async updateContent(type, id, data) {
    // Create a FormData object
    const formData = new FormData();
    
    // Add the data as a JSON string under the 'writing' key
    formData.append('writing', JSON.stringify(data));
    
    // If there's an image in the data, handle it separately
    if (data.image instanceof File) {
      formData.append('image', data.image);
      // Remove the image from the JSON data to avoid duplication
      const dataWithoutImage = { ...data };
      delete dataWithoutImage.image;
      // Replace the 'writing' entry with the updated data
      formData.set('writing', JSON.stringify(dataWithoutImage));
    }
    
    const res = await fetch(`/api/${type}/${id}`, {
      method: 'PUT',
      // Don't set Content-Type here - the browser will set it automatically with the boundary
      body: formData
    });
    return res.json();
  },

  async deleteContent(type, id) {
    await fetch(`/api/${type}/${id}`, {
      method: 'DELETE'
    });
  },

  async generateImage(writingId) {
    const res = await fetch(`/api/writings/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writingId })
    });
    return res.json();
  }
};

