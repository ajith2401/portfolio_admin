// src/app/admin/Dashboard/components/editors/ProjectEditor.js
'use client';

import React, { useState } from 'react';
import {
  Input,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { PROJECT_CATEGORIES } from '../../lib/constants';

export const ProjectEditor = ({ content, onSave, onClose }) => {
  const [formData, setFormData] = useState(content || {
    title: '',
    description: '',
    shortDescription: '',
    category: PROJECT_CATEGORIES[0],
    technologies: [],
    images: {
      thumbnail: '',
      banner: '',
      gallery: []
    },
    links: {
      github: '',
      live: '',
      demo: ''
    },
    status: 'draft',
    featured: false
  });

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      onSave(formData);
    }} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Short Description</label>
        <Input
          value={formData.shortDescription}
          onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Full Description</label>
        <textarea
          className="w-full min-h-[200px] p-2 border rounded-md"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Category</label>
        <Select
          value={formData.category}
          onValueChange={(value) => setFormData({ ...formData, category: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_CATEGORIES.map(category => (
              <SelectItem key={category} value={category}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Technologies</label>
        <Input
          value={formData.technologies.join(', ')}
          onChange={(e) => setFormData({
            ...formData,
            technologies: e.target.value.split(',').map(tech => tech.trim())
          })}
          placeholder="Enter technologies separated by commas"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">GitHub Link</label>
          <Input
            value={formData.links.github}
            onChange={(e) => setFormData({
              ...formData,
              links: { ...formData.links, github: e.target.value }
            })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Live Demo Link</label>
          <Input
            value={formData.links.live}
            onChange={(e) => setFormData({
              ...formData,
              links: { ...formData.links, live: e.target.value }
            })}
          />
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="featured"
          checked={formData.featured}
          onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
          className="rounded border-gray-300"
        />
        <label htmlFor="featured" className="text-sm font-medium">
          Featured Project
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Status</label>
        <Select
          value={formData.status}
          onValueChange={(value) => setFormData({ ...formData, status: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">
          Save
        </Button>
      </div>
    </form>
  );
};