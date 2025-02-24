// src/app/admin/Dashboard/lib/api.js
export const api = {
  async fetchWritings() {
    const res = await fetch('/api/writings');
    return res.json();
  },

  async fetchTechBlogs() {
    const res = await fetch('/api/tech-blog');
    return res.json();
  },

  async fetchProjects() {
    const res = await fetch('/api/projects');
    return res.json();
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
    const res = await fetch(`/api/${type}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
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

