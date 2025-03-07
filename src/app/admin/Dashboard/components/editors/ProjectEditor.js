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
  Textarea,
} from '@/components/ui';
import SingleImageUpload from '@/components/ui/SingleImageUpload';
import { PROJECT_CATEGORIES } from '../../lib/constants';
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

// Custom PreviewContent component to properly render images
const PreviewContent = ({ content }) => {
  if (!content) return null;
  
  // Process the content to properly render images
  const renderContent = () => {
    const parts = [];
    const regex = /!\[(.*?)\]\((https?:\/\/[^)]+)\)/g;
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      // Add the text before the image
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`} dangerouslySetInnerHTML={{ 
            __html: content.substring(lastIndex, match.index) 
          }} />
        );
      }
      
      // Extract the alt text and image URL
      const [, altText, imageUrl] = match;
      
      // Add the image component
      parts.push(
        <div key={`img-${match.index}`} className="my-4 text-center">
          <img 
            src={imageUrl} 
            alt={altText} 
            className="max-w-full h-auto rounded mx-auto" 
            style={{ display: 'block' }}
          />
        </div>
      );
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add any remaining content after the last image
    if (lastIndex < content.length) {
      parts.push(
        <span key={`text-${lastIndex}`} dangerouslySetInnerHTML={{ 
          __html: content.substring(lastIndex) 
        }} />
      );
    }
    
    return parts;
  };
  
  return (
    <div className="prose max-w-none">
      {renderContent()}
    </div>
  );
};

export const ProjectEditor = ({ content, onSave, onClose }) => {
  const [formData, setFormData] = useState(content || {
    title: '',
    shortDescription: '',
    longDescription: '',
    category: PROJECT_CATEGORIES[0],
    technologies: [],
    stack: [],
    features: [],
    challenges: [],
    achievement: '',
    stats: {
      users: '',
      accuracy: '',
      schemes: ''
    },
    images: {
      small: '',
      medium: '',
      large: '',
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

  const [preview, setPreview] = useState('');
  const [activeTab, setActiveTab] = useState('write');
  const textareaRef = useRef(null);

  // Handle image upload 
  const handleImageUpload = (imageUrls) => {
    setFormData(prevData => ({
      ...prevData,
      images: {
        ...prevData.images,
        small: imageUrls.small || '',
        medium: imageUrls.medium || '',
        large: imageUrls.large || '',
        thumbnail: imageUrls.small || '' // Use small image as thumbnail
      }
    }));
  };

  const handleArrayInput = (key, value) => {
    const arrayValue = Array.isArray(value) 
      ? value 
      : (typeof value === 'string' 
        ? value.split(',').map(item => item.trim()).filter(Boolean)
        : []);
        
    setFormData(prevData => ({
      ...prevData,
      [key]: arrayValue
    }));
  };

  // Helper function to handle nested object updates
  const handleNestedUpdate = (parentKey, key, value) => {
    setFormData(prevData => ({
      ...prevData,
      [parentKey]: {
        ...prevData[parentKey],
        [key]: value
      }
    }));
  };

  // Function to fix broken image markdown syntax
  const fixBrokenImageMarkdown = (text) => {
    if (!text) return '';
    
    // Fix common issue: line breaks between [] and ()
    let fixed = text.replace(/!\[(.*?)\][ \t\r\n]*\([ \t\r\n]*(https?:\/\/[^)]+)[ \t\r\n]*\)/g, '![$1]($2)');
    
    // Fix extra closing parenthesis on separate line
    fixed = fixed.replace(/!\[(.*?)\]\((https?:\/\/[^)]+)\n\)/g, '![$1]($2)');
    
    // Convert bare image URLs to proper markdown
    fixed = fixed.replace(/^(https?:\/\/\S+\.(jpg|jpeg|png|gif|webp))$/gim, '![Image]($1)');
    
    return fixed;
  };
  
  useEffect(() => {
    if (!formData.longDescription) {
      setPreview(''); // Clear preview if no content
      return;
    }
    
    const timeoutId = setTimeout(() => {
      // First fix any broken image markdown
      let processedContent = fixBrokenImageMarkdown(formData.longDescription);
      
      let html = processedContent;
      
      // Process code blocks first to avoid conflicts with other formatting
      html = html.replace(/```([\s\S]*?)```/g, (match, codeContent) => {
        return `<pre class="bg-gray-100 p-3 my-3 rounded overflow-x-auto"><code>${codeContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
      });
      
      // Inline code
      html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded font-mono text-sm">$1</code>');
      
      // Process headings (match at line beginning)
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
        
        // Regular paragraph handling
        const withLineBreaks = para.replace(/\n/g, '<br>');
        return `<p class="my-3">${withLineBreaks}</p>`;
      }).join('\n\n');
      
      setPreview(html);
    }, 300);
  
    return () => clearTimeout(timeoutId);
  }, [formData.longDescription]);

  const insertMarkdown = (markdownType) => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = formData.longDescription.substring(start, end);
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
        // Handle multiple lines for bullet lists
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
        // Handle multiple lines for ordered lists
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
        // Handle multiple lines for blockquotes
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
        // Handle different input types for images
        if (selectedText.match(/^https?:\/\//)) {
          // If selected text is a URL, use it as the image source
          replacement = `![Image](${selectedText})`;
        } else if (selectedText && !selectedText.match(/^https?:\/\//)) {
          // If selected text is not a URL, use it as the alt text
          replacement = `![${selectedText}](https://example.com/image.jpg)`;
        } else {
          // Default case
          replacement = `![Image description](https://example.com/image.jpg)`;
        }
        break;
      case 'hr':
        replacement = `\n---\n`;
        break;
      default:
        replacement = selectedText;
    }
    
    const newLongDescription = 
      formData.longDescription.substring(0, start) + 
      replacement + 
      formData.longDescription.substring(end);
      
    setFormData(prevData => ({
      ...prevData, 
      longDescription: newLongDescription
    }));
    
    // Refocus and set cursor position after insertion
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + replacement.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Insert image into longDescription
  const insertImageToContent = (url) => {
    if (!url || !textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    
    // Create proper markdown for the image
    const imageMarkdown = `![Image](${url})`;
    
    // Insert at cursor position
    const newLongDescription = 
      formData.longDescription.substring(0, start) + 
      imageMarkdown + 
      formData.longDescription.substring(start);
      
    setFormData(prevData => ({
      ...prevData, 
      longDescription: newLongDescription
    }));
    
    // Set cursor position after the inserted markdown
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + imageMarkdown.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Process any string values that should be arrays before saving
    const processedFormData = { ...formData };
    
    // Process technologies
    if (typeof processedFormData.technologies === 'string') {
      processedFormData.technologies = processedFormData.technologies.split(',').map(item => item.trim()).filter(Boolean);
    }
    
    // Process stack
    if (typeof processedFormData.stack === 'string') {
      processedFormData.stack = processedFormData.stack.split(',').map(item => item.trim()).filter(Boolean);
    }
    
    // Process features
    if (typeof processedFormData.features === 'string') {
      processedFormData.features = processedFormData.features.split(',').map(item => item.trim()).filter(Boolean);
    }
    
    // Process challenges
    if (typeof processedFormData.challenges === 'string') {
      processedFormData.challenges = processedFormData.challenges.split(',').map(item => item.trim()).filter(Boolean);
    }
    
    // Now save the processed data
    onSave(processedFormData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Title *</label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Short Description *</label>
        <Input
          value={formData.shortDescription}
          onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
          required
          placeholder="Brief overview of the project (displayed in cards)"
        />
      </div>

      {/* Featured Image Upload */}
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

      {/* Long Description with Markdown Editor */}
      <div>
        <label className="block text-sm font-medium mb-1">Long Description *</label>
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
                value={formData.longDescription}
                onChange={(e) => setFormData(prevData => ({ ...prevData, longDescription: e.target.value }))}
                required
                placeholder="Detailed description of the project with markdown support"
              />
            </TabsContent>
            <TabsContent value="preview" className="m-0 p-4 min-h-[400px]">
              <PreviewContent content={preview} />
            </TabsContent>
          </Tabs>
        </div>
        
        {/* Add a troubleshooting guide */}
        <details className="mt-2 text-sm text-gray-600">
          <summary className="cursor-pointer font-medium">Having trouble with images?</summary>
          <div className="mt-2 p-3 bg-gray-50 rounded">
            <p>Make sure your image markdown follows this format:</p>
            <pre className="bg-gray-100 p-2 rounded mt-1 mb-2 overflow-x-auto">
              ![Image description](https://example.com/image.jpg)
            </pre>
            <p>Common issues:</p>
            <ul className="list-disc pl-5 mt-1">
              <li>No line breaks between <code>![...]</code> and <code>(...)</code></li>
              <li>Make sure the URL is complete and accessible</li>
              <li>Check for extra characters or line breaks</li>
            </ul>
          </div>
        </details>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Category *</label>
        <Select
          defaultValue={formData.category}
          onValueChange={(value) => setFormData({ ...formData, category: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_CATEGORIES.map(category => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
      <label className="block text-sm font-medium mb-1">Technologies</label>
      <Input
        value={formData.technologies ? (Array.isArray(formData.technologies) ? formData.technologies.join(', ') : formData.technologies) : ''}
        onChange={(e) => setFormData(prevData => ({
          ...prevData,
          technologies: e.target.value // Just store the raw input value for now
        }))}
        onBlur={(e) => {
          // Only process comma separation when the user leaves the field
          const techArray = e.target.value.split(',').map(tech => tech.trim()).filter(Boolean);
          setFormData(prevData => ({
            ...prevData,
            technologies: techArray
          }));
        }}
        placeholder="React, Node.js, MongoDB, etc."
      />
    </div>
    <div>
          <label className="block text-sm font-medium mb-1">Stack</label>
          <Input
            value={formData.stack ? (Array.isArray(formData.stack) ? formData.stack.join(', ') : formData.stack) : ''}
            onChange={(e) => setFormData(prevData => ({
              ...prevData,
              stack: e.target.value // Store raw input
            }))}
            onBlur={(e) => {
              // Process on blur
              const stackArray = e.target.value.split(',').map(item => item.trim()).filter(Boolean);
              setFormData(prevData => ({
                ...prevData,
                stack: stackArray
              }));
            }}
            placeholder="MERN, LAMP, JAMstack, etc."
          />
        </div>
      </div>

      <div>
      <label className="block text-sm font-medium mb-1">Features</label>
      <Textarea
        value={formData.features ? (Array.isArray(formData.features) ? formData.features.join(', ') : formData.features) : ''}
        onChange={(e) => setFormData(prevData => ({
          ...prevData,
          features: e.target.value
        }))}
        onBlur={(e) => {
          const featuresArray = e.target.value.split(',').map(item => item.trim()).filter(Boolean);
          setFormData(prevData => ({
            ...prevData,
            features: featuresArray
          }));
        }}
        placeholder="Key features of the project (comma separated)"
        className="min-h-[100px]"
      />
    </div>
    
    <div>
    <label className="block text-sm font-medium mb-1">Challenges</label>
    <Textarea
      value={formData.challenges ? (Array.isArray(formData.challenges) ? formData.challenges.join(', ') : formData.challenges) : ''}
      onChange={(e) => setFormData(prevData => ({
        ...prevData,
        challenges: e.target.value
      }))}
      onBlur={(e) => {
        const challengesArray = e.target.value.split(',').map(item => item.trim()).filter(Boolean);
        setFormData(prevData => ({
          ...prevData,
          challenges: challengesArray
        }));
      }}
      placeholder="Challenges faced during development (comma separated)"
      className="min-h-[100px]"
    />
  </div>

      <div>
        <label className="block text-sm font-medium mb-1">Achievement</label>
        <Input
          value={formData.achievement || ''}
          onChange={(e) => setFormData({ ...formData, achievement: e.target.value })}
          placeholder="e.g., 'Won first place at Hackathon 2023'"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Users Stat</label>
          <Input
            value={formData.stats?.users || ''}
            onChange={(e) => handleNestedUpdate('stats', 'users', e.target.value)}
            placeholder="e.g., '10,000+ users'"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Accuracy Stat</label>
          <Input
            value={formData.stats?.accuracy || ''}
            onChange={(e) => handleNestedUpdate('stats', 'accuracy', e.target.value)}
            placeholder="e.g., '95% accuracy'"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Schemes Stat</label>
          <Input
            value={formData.stats?.schemes || ''}
            onChange={(e) => handleNestedUpdate('stats', 'schemes', e.target.value)}
            placeholder="e.g., '20+ schemes'"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">GitHub Link</label>
          <Input
            value={formData.links?.github || ''}
            onChange={(e) => handleNestedUpdate('links', 'github', e.target.value)}
            placeholder="https://github.com/username/repository"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Live Site</label>
          <Input
            value={formData.links?.live || ''}
            onChange={(e) => handleNestedUpdate('links', 'live', e.target.value)}
            placeholder="https://example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Demo Link</label>
          <Input
            value={formData.links?.demo || ''}
            onChange={(e) => handleNestedUpdate('links', 'demo', e.target.value)}
            placeholder="https://demo.example.com"
          />
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="featured"
          checked={formData.featured || false}
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
          defaultValue={formData.status || 'draft'}
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