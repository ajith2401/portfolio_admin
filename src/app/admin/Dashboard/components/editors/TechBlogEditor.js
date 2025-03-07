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
} from '@/components/ui';
import { TECH_BLOG_CATEGORIES } from '../../lib/constants';
import ImageUpload from '@/lib/ImageUpload';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const TechBlogEditor = ({ content, onSave, onClose }) => {

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
  const [activeTab, setActiveTab] = useState('write');
  const textareaRef = useRef(null);
  
  useEffect(() => {
    if (!formData.content) {
      setPreview(''); // Clear preview if no content
      return;
    }
  
    const timeoutId = setTimeout(() => {
      let html = formData.content;
      
      // Process code blocks first to avoid conflicts with other formatting
      html = html.replace(/```([\s\S]*?)```/g, (match, codeContent) => {
        return `<pre class="bg-gray-100 p-3 my-3 rounded overflow-x-auto"><code>${codeContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
      });
      
      // Inline code
      html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded font-mono text-sm">$1</code>');
      
      // Process headings (make sure to match at line beginning)
      html = html.replace(/^# (.*)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-3">$1</h1>');
      html = html.replace(/^## (.*)$/gm, '<h2 class="text-xl font-bold mt-5 mb-2">$1</h2>');
      html = html.replace(/^### (.*)$/gm, '<h3 class="text-lg font-bold mt-4 mb-2">$1</h3>');
      
      // Process blockquotes - handle multi-line blockquotes
      html = html.replace(/^> (.*)(?:\n^> (.*))*$/gm, (match) => {
        const content = match.split('\n')
          .map(line => line.replace(/^> (.*)$/, '$1'))
          .join('<br>');
        return `<blockquote class="border-l-4 border-gray-300 pl-4 py-1 my-4 italic text-gray-700">${content}</blockquote>`;
      });
      
      // Process ordered lists - match consecutive numbered lines
      html = html.replace(/^(\d+)\. (.*)(?:\n^(\d+)\. (.*))*$/gm, (match) => {
        const items = match.split('\n')
          .map(line => {
            const itemMatch = line.match(/^(\d+)\. (.*)$/);
            return itemMatch ? `<li>${itemMatch[2]}</li>` : line;
          })
          .join('');
        return `<ol class="list-decimal pl-6 my-4">${items}</ol>`;
      });
      
      // Process unordered lists - match consecutive bulleted lines
      html = html.replace(/^- (.*)(?:\n^- (.*))*$/gm, (match) => {
        const items = match.split('\n')
          .map(line => {
            const itemMatch = line.match(/^- (.*)$/);
            return itemMatch ? `<li>${itemMatch[1]}</li>` : line;
          })
          .join('');
        return `<ul class="list-disc pl-6 my-4">${items}</ul>`;
      });
      
      // Process text formatting
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
      html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
      
      // Process links with styling
      html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="text-blue-600 hover:underline">$1</a>');
      
      // Process images with styling - fixed to properly handle Cloudinary URLs
      html = html.replace(/!\[(.*?)\]\((https?:\/\/[^)]+)\)/g, (match, altText, url) => {
        return `<img src="${url}" alt="${altText}" class="max-w-full h-auto my-4 rounded" />`;
      });
      
      // Process horizontal rule
      html = html.replace(/^---$/gm, '<hr class="my-6 border-t border-gray-300" />');
      
      // Process paragraphs and line breaks
      // Split into paragraphs on double newlines
      const paragraphs = html.split(/\n\n+/);
      
      html = paragraphs.map(para => {
        // Skip wrapping if paragraph already contains block-level HTML
        if (
          para.startsWith('<h1') || 
          para.startsWith('<h2') || 
          para.startsWith('<h3') || 
          para.startsWith('<ul') || 
          para.startsWith('<ol') || 
          para.startsWith('<blockquote') || 
          para.startsWith('<pre') ||
          para.startsWith('<hr')
        ) {
          return para;
        }
        
        // Check for image markdown that wasn't processed earlier
        if (para.match(/!\[.*?\]\(.*?\)/)) {
          // Process any remaining image that may not have been caught earlier
          let processedPara = para.replace(/!\[(.*?)\]\((https?:\/\/[^)]+)\)/g, 
            '<img src="$2" alt="$1" class="max-w-full h-auto my-4 rounded" />');
          
          // Replace single newlines with <br> tags
          processedPara = processedPara.replace(/\n/g, '<br>');
          return `<p class="my-3">${processedPara}</p>`;
        }
        
        // Regular paragraph handling
        const withLineBreaks = para.replace(/\n/g, '<br>');
        return `<p class="my-3">${withLineBreaks}</p>`;
      }).join('\n\n');
      
      setPreview(html);
    }, 300);
  
    return () => clearTimeout(timeoutId);
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
        // Fix for list - handle multiple lines
        if (selectedText.includes('\n')) {
          replacement = selectedText
            .split('\n')
            .map(line => line.trim() ? `- ${line}` : '')
            .join('\n');
        } else {
          replacement = `- ${selectedText || 'list item'}`;
        }
        break;
      case 'ol':
        // Fix for ordered list - handle multiple lines
        if (selectedText.includes('\n')) {
          replacement = selectedText
            .split('\n')
            .map((line, i) => line.trim() ? `${i+1}. ${line}` : '')
            .join('\n');
        } else {
          replacement = `1. ${selectedText || 'list item'}`;
        }
        break;
      case 'code':
        replacement = selectedText.includes('\n') 
          ? `\`\`\`\n${selectedText || 'code block'}\n\`\`\``
          : `\`${selectedText || 'inline code'}\``;
        break;
      case 'quote':
        // Fix for blockquote - handle multiple lines
        if (selectedText.includes('\n')) {
          replacement = selectedText
            .split('\n')
            .map(line => line.trim() ? `> ${line}` : '')
            .join('\n');
        } else {
          replacement = `> ${selectedText || 'blockquote'}`;
        }
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
        // Improved image insertion with a realistic placeholder or keeping an existing URL
        const imageUrl = selectedText.match(/^https?:\/\//) 
          ? selectedText 
          : 'https://example.com/image.jpg';
        replacement = `![${selectedText.match(/^https?:\/\//) ? 'alt text' : selectedText || 'alt text'}](${imageUrl})`;
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
    setFormData(prevData => ({
      ...prevData,
      images: {
        ...prevData.images,
        [imageType]: url
      }
    }));
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
            onChange={(e) => setFormData(prevData => ({ ...prevData, title: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <Select
            value={formData.category}
            onValueChange={(value) => setFormData(prevData => ({ ...prevData, category: value }))}
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
          onChange={(e) => setFormData(prevData => ({ ...prevData, subtitle: e.target.value }))}
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
          
          <Tabs defaultValue="write" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full bg-gray-50 border-b">
              <TabsTrigger value="write" className="flex-1">Write</TabsTrigger>
              <TabsTrigger value="preview" className="flex-1">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="write" className="m-0">
              <textarea
                ref={textareaRef}
                className="w-full min-h-[400px] p-4 border-none outline-none font-mono text-sm"
                value={formData.content}
                onChange={(e) => setFormData(prevData => ({ ...prevData, content: e.target.value }))}
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
            onChange={(e) => setFormData(prevData => ({
              ...prevData,
              author: { ...prevData.author, name: e.target.value }
            }))}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Author Email</label>
          <Input
            type="email"
            value={formData.author.email}
            onChange={(e) => setFormData(prevData => ({
              ...prevData,
              author: { ...prevData.author, email: e.target.value }
            }))}
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Tags</label>
        <Input
          value={formData.tags.join(', ')}
          onChange={(e) => setFormData(prevData => ({
            ...prevData,
            tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean)
          }))}
          placeholder="Enter tags separated by commas"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Status</label>
        <Select
          value={formData.status}
          onValueChange={(value) => setFormData(prevData => ({ ...prevData, status: value }))}
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