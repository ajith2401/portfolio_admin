// src/app/admin/Dashboard/components/ContentGrid.js
'use client';

import React from 'react';
import { 
  Edit, 
  Trash2, 
  Globe, 
  FileText, 
  Clock, 
  Calendar, 
  Tag 
} from 'lucide-react';
import { 
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader 
} from '@/components/ui';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';

export const ContentGrid = ({ type, items = [], onEdit, onDelete, onStatusChange }) => {
  // Format date for display
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      return 'Invalid date';
    }
  };

  // Get appropriate excerpt from content
  const getExcerpt = (item) => {
    let content = '';
    
    // Different content fields based on content type
    if (type === 'writings') {
      content = item.body || '';
    } else if (type === 'tech-blog') {
      content = item.content || '';
    } else if (type === 'projects') {
      content = item.shortDescription || item.longDescription || '';
    }
    
    // Remove any markdown or HTML
    content = content.replace(/#+\s/g, ''); // Remove markdown headers
    content = content.replace(/\*\*(.*?)\*\*/g, '$1'); // Remove bold
    content = content.replace(/\*(.*?)\*/g, '$1'); // Remove italic
    content = content.replace(/\[(.*?)\]\(.*?\)/g, '$1'); // Remove links
    content = content.replace(/`(.*?)`/g, '$1'); // Remove inline code
    content = content.replace(/```[\s\S]*?```/g, ''); // Remove code blocks
    
    // Limit to 100 characters
    return content.length > 100 
      ? content.substring(0, 100) + '...' 
      : content;
  };

  // Get item category
  const getItemCategory = (item) => {
    return item.category || 'Uncategorized';
  };

  // Get status badge variant
  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'published':
        return 'success';
      case 'draft':
        return 'secondary';
      default:
        return 'default';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => (
        <Card key={item._id} className="overflow-hidden border border-gray-200 hover:shadow-md transition-all">
          {/* Image or colored header */}
          <div className="h-40 relative overflow-hidden">
            {item.images?.medium ? (
              <Image 
                width={400}  // Specify a fixed width
                height={160} // Specify a fixed height
                src={item.images.medium} 
                alt={item.title}
                className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
              />
            ) : (
              <div 
                className="w-full h-full flex items-center justify-center bg-gradient-to-r from-blue-500 to-indigo-600 text-white"
              >
                <FileText size={48} className="opacity-25" />
              </div>
            )}
            
            {/* Status badge */}
            <Badge 
              variant={getStatusBadgeVariant(item.status)} 
              className="absolute top-2 right-2"
            >
              {item.status}
            </Badge>
          </div>

          <CardHeader className="pb-0">
            <h3 className="font-medium text-lg truncate" title={item.title}>
              {item.title}
            </h3>
            <p className="text-sm text-gray-500 flex items-center mt-1">
              <Tag className="h-3 w-3 mr-1" />
              {getItemCategory(item)}
            </p>
          </CardHeader>
          
          <CardContent>
            <p className="text-gray-600 text-sm line-clamp-3">
              {getExcerpt(item)}
            </p>
            
            <div className="flex items-center mt-3 text-xs text-gray-500">
              <div className="flex items-center mr-3">
                <Calendar className="h-3 w-3 mr-1" />
                {new Date(item.createdAt).toLocaleDateString()}
              </div>
              <div className="flex items-center">
                <Clock className="h-3 w-3 mr-1" />
                {formatDate(item.createdAt)}
              </div>
            </div>
          </CardContent>
          
          <CardFooter className="bg-gray-50 border-t border-gray-100 flex justify-between pt-2 pb-2">
            <Button variant="ghost" size="sm" onClick={() => onEdit(item)}>
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            
            {item.status === 'draft' ? (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onStatusChange(item._id, 'published')}
              >
                <Globe className="h-4 w-4 mr-1" />
                Publish
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStatusChange(item._id, 'draft')}
              >
                <Clock className="h-4 w-4 mr-1" />
                Unpublish
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={() => onDelete(item._id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
};