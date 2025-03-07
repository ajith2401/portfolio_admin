// src/app/admin/Dashboard/components/editors/MarkdownEditor.jsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Input,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { TECH_BLOG_CATEGORIES } from '../../lib/constants';
import { ImageUpload } from '../ImageUpload';
import { 
  Bold, 
  Italic, 
  Strikethrough, 
  Link as LinkIcon, 
  List, 
  ListOrdered, 
  Code, 
  Quote, 
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Minus,
} from 'lucide-react';

export const MarkdownEditor = ({ content, onSave, onClose }) => {
  const [formData, setFormData] = useState(content || {
    title: '',
    subtitle: '',
    content: '',
    category: TECH_BLOG_CATEGORIES[0],
    tags: [],
    status: 'draft',
    author: {
      name: '',
      email: ''
    },
    images: {
      small: '',
      medium: '',
      large: ''
    }
  });
  const [preview, setPreview] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    // Simple markdown to HTML conversion for preview
    let html = formData.content
      .replace(/# (.*$)/gm, '<h1>$1</h1>')
      .replace(/## (.*$)/gm, '<h2>$1</h2>')
      .replace(/### (.*$)/gm, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/~~(.*?)~~/g, '<del>$1</del>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>')
      .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width:100%">')
      .replace(/^\> (.*$)/gm, '<blockquote>$1</blockquote>')
      .replace(/^\- (.*$)/gm, '<ul><li>$1</li></ul>')
      .replace(/^(\d+)\. (.*$)/gm, '<ol><li>$2</li></ol>')
      .replace(/^\-\- (.*$)/gm, '<ul style="margin-left:20px"><li>$1</li></ul>')
      .replace(/^---$/gm, '<hr>')
      .replace(/\n/g, '<br>');
      
    // Fix lists (merge adjacent list items)
    html = html.replace(/<\/ul><ul>/g, '')
      .replace(/<\/ol><ol>/g, '');
      
    setPreview(html);
  }, [formData.content]);

  const insertMarkdown = (markdownType) => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = formData.content.substring(start, end);
    let replacement = '';
    
    switch (markdownType) {
      case 'bold':
        replacement = `**${selectedText || 'bold text'}**`;
        break;
      case 'italic':
        replacement = `*${selectedText || 'italic text'}*`;
        break;
      case 'strikethrough':
        replacement = `~~${selectedText || 'strikethrough text'}~~`;
        break;
      case 'link':
        replacement = `[${selectedText || 'link text'}](https://example.com)`;
        break;
      case 'ul':
        replacement = `- ${selectedText || 'list item'}`;
        break;
      case 'ol':
        replacement = `1. ${selectedText || 'list item'}`;
        break;
      case 'code':
        replacement = selectedText.includes('\n') 
          ? `\`\`\`\n${selectedText || 'code block'}\n\`\`\``
          : `\`${selectedText || 'inline code'}\``;
        break;
      case 'quote':
        replacement = `> ${selectedText || 'blockquote'}`;
        break;
      case 'h1':
        replacement = `# ${selectedText || 'Heading 1'}`;
        break;
      case 'h2':
        replacement = `## ${selectedText || 'Heading 2'}`;
        break;
      case 'h3':
        replacement = `### ${selectedText || 'Heading 3'}`;
        break;
      case 'image':
        replacement = `![${selectedText || 'alt text'}](https://example.com/image.jpg)`;
        break;
      case 'hr':
        replacement = `\n---\n`;
        break;
      default:
        replacement = selectedText;
    }
    
    const newContent = 
      formData.content.substring(0, start) + 
      replacement + 
      formData.content.substring(end);
      
    setFormData({ ...formData, content: newContent });
    
    // Refocus and set cursor position after the inserted markdown
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + replacement.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleImageUpload = (imageType, url) => {
    setFormData({
      ...formData,
      images: {
        ...formData.images,
        [imageType]: url
      }
    });
  };

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      onSave(formData);
    }} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
              {TECH_BLOG_CATEGORIES.map(category => (
                <SelectItem key={category} value={category}>
                  {category.split('-').map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1)
                  ).join(' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Subtitle</label>
        <Input
          value={formData.subtitle}
          onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Featured Images</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ImageUpload 
            label="Small (thumbnail)" 
            currentImage={formData.images.small}
            onImageUploaded={(url) => handleImageUpload('small', url)}
          />
          <ImageUpload 
            label="Medium (card)" 
            currentImage={formData.images.medium}
            onImageUploaded={(url) => handleImageUpload('medium', url)}
          />
          <ImageUpload 
            label="Large (header)" 
            currentImage={formData.images.large}
            onImageUploaded={(url) => handleImageUpload('large', url)}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Content</label>
        <div className="border rounded-md overflow-hidden">
          <div className="bg-gray-100 p-2 border-b flex flex-wrap gap-2">
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={() => insertMarkdown('bold')}
              title="Bold"
            >
              <Bold className="w-4 h-4" />
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={() => insertMarkdown('italic')}
              title="Italic"
            >
              <Italic className="w-4 h-4" />
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={() => insertMarkdown('strikethrough')}
              title="Strikethrough"
            >
              <Strikethrough className="w-4 h-4" />
            </Button>
            <span className="border-r mx-1 h-6"></span>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={() => insertMarkdown('h1')}
              title="Heading 1"
            >
              <Heading1 className="w-4 h-4" />
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={() => insertMarkdown('h2')}
              title="Heading 2"
            >
              <Heading2 className="w-4 h-4" />
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={() => insertMarkdown('h3')}
              title="Heading 3"
            >
              <Heading3 className="w-4 h-4" />
            </Button>
            <span className="border-r mx-1 h-6"></span>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={() => insertMarkdown('link')}
              title="Link"
            >
              <LinkIcon className="w-4 h-4" />
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={() => insertMarkdown('image')}
              title="Image"
            >
              <ImageIcon className="w-4 h-4" />
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={() => insertMarkdown('code')}
              title="Code"
            >
              <Code className="w-4 h-4" />
            </Button>
            <span className="border-r mx-1 h-6"></span>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={() => insertMarkdown('ul')}
              title="Bullet List"
            >
              <List className="w-4 h-4" />
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={() => insertMarkdown('ol')}
              title="Numbered List"
            >
              <ListOrdered className="w-4 h-4" />
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={() => insertMarkdown('quote')}
              title="Quote"
            >
              <Quote className="w-4 h-4" />
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={() => insertMarkdown('hr')}
              title="Horizontal Rule"
            >
              <Minus className="w-4 h-4" />
            </Button>
          </div>
          
          <Tabs defaultValue="write">
            <TabsList className="w-full bg-gray-50 border-b">
              <TabsTrigger value="write" className="flex-1">Write</TabsTrigger>
              <TabsTrigger value="preview" className="flex-1">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="write" className="m-0">
              <textarea
                ref={textareaRef}
                className="w-full min-h-[400px] p-4 border-none outline-none font-mono text-sm"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                required
              />
            </TabsContent>
            <TabsContent value="preview" className="m-0">
              <div 
                className="w-full min-h-[400px] p-4 prose max-w-none"
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Author Name</label>
          <Input
            value={formData.author.name}
            onChange={(e) => setFormData({
              ...formData,
              author: { ...formData.author, name: e.target.value }
            })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Author Email</label>
          <Input
            type="email"
            value={formData.author.email}
            onChange={(e) => setFormData({
              ...formData,
              author: { ...formData.author, email: e.target.value }
            })}
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Tags</label>
        <Input
          value={formData.tags.join(', ')}
          onChange={(e) => setFormData({
            ...formData,
            tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean)
          })}
          placeholder="Enter tags separated by commas"
        />
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