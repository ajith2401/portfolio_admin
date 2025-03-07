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
import { WRITING_CATEGORIES } from '../../lib/constants';
import SingleImageUpload from '@/components/ui/SingleImageUpload';

export const WritingEditor = ({ content, onSave, onClose }) => {
  const [formData, setFormData] = useState(content || {
    title: '',
    subtitle: '',
    body: '',
    category: WRITING_CATEGORIES[0],
    status: 'draft',
    images: {
      small: '',
      medium: '',
      large: ''
    }
  });

  // Handle image upload 
  const handleImageUpload = (imageUrls) => {
    setFormData(prevData => ({
      ...prevData,
      images: {
        small: imageUrls.small || '',
        medium: imageUrls.medium || '',
        large: imageUrls.large || ''
      }
    }));
  };

  // Insert image into the body content
  const insertImageToContent = (url) => {
    if (!url) return;
    
    // Create proper markdown for the image
    const imageMarkdown = `\n![Image](${url})\n`;
    
    // Insert at the end of the content
    const newBody = formData.body + imageMarkdown;
      
    setFormData(prevData => ({
      ...prevData, 
      body: newBody
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Subtitle</label>
        <Input
          value={formData.subtitle}
          onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Category</label>
        <Select
          defaultValue={formData.category}
          onValueChange={(value) => setFormData({ ...formData, category: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {WRITING_CATEGORIES.map(category => (
              <SelectItem key={category} value={category}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Add Image Upload */}
      <div>
        <label className="block text-sm font-medium mb-1">Featured Image</label>
        <SingleImageUpload 
          currentImage={formData.images.medium}
          onImageUploaded={handleImageUpload}
        />
        
        {/* Insert image buttons */}
        <div className="mt-2 flex flex-wrap gap-2">
          {formData.images.small && (
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={() => insertImageToContent(formData.images.small)}
            >
              Insert Thumbnail
            </Button>
          )}
          {formData.images.medium && (
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={() => insertImageToContent(formData.images.medium)}
            >
              Insert Medium Image
            </Button>
          )}
          {formData.images.large && (
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={() => insertImageToContent(formData.images.large)}
            >
              Insert Large Image
            </Button>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Body</label>
        <textarea
          className="w-full min-h-[300px] p-2 border rounded-md"
          value={formData.body}
          onChange={(e) => setFormData({ ...formData, body: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Status</label>
        <Select
          defaultValue={formData.status}
          onValueChange={(value) => setFormData({ ...formData, status: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select status" />
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