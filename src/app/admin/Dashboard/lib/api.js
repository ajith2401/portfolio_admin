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

  async fetchTechBlogs(page = 1) {
    try {
      const res = await fetch(`/api/tech-blog?page=${page}`);
      const data = await res.json();
      return data; // Return the full response object with techBlogs and pagination
    } catch (error) {
      console.error('Error fetching tech blogs:', error);
      return { techBlogs: [], pagination: { total: 0, pages: 1, current: 1 } };
    }
  },

  async fetchProjects(page = 1) {
    try {
      const res = await fetch(`/api/projects?page=${page}`);
      const data = await res.json();
      return data; // Return the full response object with projects and pagination
    } catch (error) {
      console.error('Error fetching projects:', error);
      return { projects: [], pagination: { total: 0, pages: 1, current: 1 } };
    }
  },

  async createContent(type, data) {
    // Check if we have a File object in the data
    if (data.image instanceof File || (data.images && Object.values(data.images).some(img => img instanceof File))) {
      // If we have files, use FormData approach
      const formData = new FormData();
      
      // Remove file objects from the data to avoid JSON serialization issues
      const dataWithoutFiles = { ...data };
      
      if (data.image instanceof File) {
        formData.append('image', data.image);
        delete dataWithoutFiles.image;
      }
      
      if (data.images) {
        // Handle each image in the images object if there are any File objects
        Object.entries(data.images).forEach(([key, value]) => {
          if (value instanceof File) {
            formData.append(`image_${key}`, value);
            delete dataWithoutFiles.images[key];
          }
        });
      }
      
      // Add the data as JSON
      formData.append('content', JSON.stringify(dataWithoutFiles));
      
      const res = await fetch(`/api/${type}`, {
        method: 'POST',
        body: formData
      });
      
      return res.json();
    } else {
      // No files, use JSON approach
      const res = await fetch(`/api/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      return res.json();
    }
  },

  async updateContent(type, id, data) {
    // Check if we have a File object in the data
    if (data.image instanceof File || (data.images && Object.values(data.images).some(img => img instanceof File))) {
      // If we have files, use FormData approach
      const formData = new FormData();
      
      // Remove file objects from the data to avoid JSON serialization issues
      const dataWithoutFiles = { ...data };
      
      if (data.image instanceof File) {
        formData.append('image', data.image);
        delete dataWithoutFiles.image;
      }
      
      if (data.images) {
        // Handle each image in the images object if there are any File objects
        Object.entries(data.images).forEach(([key, value]) => {
          if (value instanceof File) {
            formData.append(`image_${key}`, value);
            delete dataWithoutFiles.images[key];
          }
        });
      }
      
      // Add the data as JSON
      formData.append('content', JSON.stringify(dataWithoutFiles));
      
      const res = await fetch(`/api/${type}/${id}`, {
        method: 'PUT',
        body: formData
      });
      
      return res.json();
    } else {
      // No files, use JSON approach
      const res = await fetch(`/api/${type}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      return res.json();
    }
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