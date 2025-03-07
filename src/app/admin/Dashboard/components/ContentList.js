// src/app/admin/Dashboard/components/ContentList.js
'use client';

import React, { useState } from 'react';
import { Search, Edit, Trash2, Image } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { WRITING_CATEGORIES, TECH_BLOG_CATEGORIES, PROJECT_CATEGORIES } from '../lib/constants';

export const ContentList = ({ type, items = [], onEdit, onDelete, onStatusChange, onGenerateImage }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const getCategories = () => {
    switch (type) {
      case 'writings':
        return WRITING_CATEGORIES;
      case 'tech-blog':
        return TECH_BLOG_CATEGORIES;
      case 'projects':
        return PROJECT_CATEGORIES;
      default:
        return [];
    }
  };

  const itemsArray = Array.isArray(items) ? items : [];

  const filteredItems = itemsArray.filter(item => {
    if (!item) return false;
    const matchesSearch = item.title?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{type === 'tech-blog' ? 'Tech Blog' : type.charAt(0).toUpperCase() + type.slice(1)}</h1>
        <Button onClick={() => onEdit(null)}>Add New</Button>
      </div>

      {/* Filters Section */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Search Box */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full bg-white"
          />
        </div>

        {/* Status Filter */}
        <div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full bg-white">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Category Filter */}
        <div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full bg-white">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {getCategories().map(category => (
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

      {/* Content List */}
      <div className="bg-white rounded-lg shadow divide-y">
        {filteredItems.map((item) => (
          <div key={item._id} className="p-4 flex items-center justify-between hover:bg-gray-50">
            <div className="flex-1">
              <h3 className="font-medium text-gray-900">{item.title}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                  ${item.status === 'published' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {item.status}
                </span>
                <span className="text-sm text-gray-500">
                  {item.category} • {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {type === 'writings' && (
                <button
                  onClick={() => onGenerateImage(item._id)}
                  className="p-1 hover:bg-gray-100 rounded-full"
                  title="Generate Image"
                >
                  <Image className="w-5 h-5 text-gray-500" />
                </button>
              )}

              <button
                onClick={() => onEdit(item)}
                className="p-1 hover:bg-gray-100 rounded-full"
                title="Edit"
              >
                <Edit className="w-5 h-5 text-blue-500" />
              </button>

              <button
                onClick={() => onDelete(item._id)}
                className="p-1 hover:bg-gray-100 rounded-full"
                title="Delete"
              >
                <Trash2 className="w-5 h-5 text-red-500" />
              </button>
            </div>
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No items found
          </div>
        )}
      </div>
    </div>
  );
};