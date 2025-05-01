'use client';

import React, { useState, useMemo } from 'react';
import { 
  Edit, 
  Trash2, 
  Globe, 
  Clock, 
  ArrowUp, 
  ArrowDown,
  Tag,
  Calendar 
} from 'lucide-react';
import { 
  Badge,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow 
} from '@/components/ui';
import { formatDistanceToNow } from 'date-fns';

export const ContentList = ({ 
  type, 
  items = [], 
  onEdit, 
  onDelete, 
  onStatusChange 
}) => {
  // State for sorting
  const [sortConfig, setSortConfig] = useState({
    key: 'createdAt',
    direction: 'desc'
  });

  // Format date for display
  const formatDate = (dateString) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (error) {
      return 'Invalid date';
    }
  };

  // Handle sorting column click
  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: 
        prevConfig.key === key 
          ? (prevConfig.direction === 'asc' ? 'desc' : 'asc')
          : 'asc'
    }));
  };

  // Sorted and filtered items
  const sortedItems = useMemo(() => {
    if (!items || items.length === 0) return [];
    
    return [...items].sort((a, b) => {
      // Handle different sorting scenarios
      let valueA, valueB;
      
      switch (sortConfig.key) {
        case 'createdAt':
        case 'updatedAt':
          valueA = new Date(a[sortConfig.key] || a.createdAt).getTime();
          valueB = new Date(b[sortConfig.key] || b.createdAt).getTime();
          break;
        case 'title':
          valueA = a.title.toLowerCase();
          valueB = b.title.toLowerCase();
          break;
        case 'category':
          valueA = (a.category || '').toLowerCase();
          valueB = (b.category || '').toLowerCase();
          break;
        case 'status':
          // Prioritize published items
          valueA = a.status === 'published' ? 1 : 0;
          valueB = b.status === 'published' ? 1 : 0;
          break;
        default:
          valueA = a[sortConfig.key] || '';
          valueB = b[sortConfig.key] || '';
      }
      
      // Apply sorting direction
      return sortConfig.direction === 'asc'
        ? (valueA > valueB ? 1 : -1)
        : (valueA < valueB ? 1 : -1);
    });
  }, [items, sortConfig]);

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

  // Render sortable header
  const renderSortableHeader = (label, key) => {
    const isSorted = sortConfig.key === key;
    return (
      <div 
        className="flex items-center cursor-pointer hover:text-gray-900"
        onClick={() => handleSort(key)}
      >
        {label}
        {isSorted && (
          <span className="ml-1">
            {sortConfig.direction === 'asc' ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
          </span>
        )}
      </div>
    );
  };

  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">
                {renderSortableHeader('Title', 'title')}
              </TableHead>
              <TableHead className="hidden md:table-cell">
                {renderSortableHeader('Category', 'category')}
              </TableHead>
              <TableHead className="hidden md:table-cell">
                {renderSortableHeader('Status', 'status')}
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                {renderSortableHeader('Created', 'createdAt')}
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                {renderSortableHeader('Updated', 'updatedAt')}
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedItems.map((item) => (
              <TableRow key={item._id} className="hover:bg-gray-50">
                {/* Title Cell */}
                <TableCell>
                  <div className="flex items-center">
                    {/* Thumbnail */}
                    <div className="w-10 h-10 mr-3 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                      {item.images?.small ? (
                        <img 
                          src={item.images.small} 
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-200">
                          <Tag className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                    </div>
                    {/* Title and Mobile Details */}
                    <div>
                      <div className="font-medium truncate max-w-[200px]">
                        {item.title}
                      </div>
                      <div className="text-xs text-gray-500 flex md:hidden mt-1 space-x-2">
                        <Badge variant={getStatusBadgeVariant(item.status)}>
                          {item.status}
                        </Badge>
                        <span>{item.category}</span>
                      </div>
                    </div>
                  </div>
                </TableCell>

                {/* Category Cell */}
                <TableCell className="hidden md:table-cell">
                  {item.category}
                </TableCell>

                {/* Status Cell */}
                <TableCell className="hidden md:table-cell">
                  <Badge variant={getStatusBadgeVariant(item.status)}>
                    {item.status}
                  </Badge>
                </TableCell>

                {/* Created Date Cell */}
                <TableCell className="hidden lg:table-cell">
                  <div className="flex items-center text-sm text-gray-500">
                    <Calendar className="w-3 h-3 mr-1" />
                    {new Date(item.createdAt).toLocaleDateString()}
                  </div>
                </TableCell>

                {/* Updated Date Cell */}
                <TableCell className="hidden lg:table-cell">
                  <div className="text-sm text-gray-500">
                    {formatDate(item.updatedAt || item.createdAt)}
                  </div>
                </TableCell>

                {/* Actions Cell */}
                <TableCell className="text-right">
                  <div className="flex justify-end space-x-1">
                    {/* Edit Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => onEdit(item)}
                      title="Edit"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>

                    {/* Publish/Unpublish Toggle */}
                    {item.status === 'draft' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-green-500 hover:text-green-700 hover:bg-green-50"
                        onClick={() => onStatusChange(item._id, 'published')}
                        title="Publish"
                      >
                        <Globe className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-amber-500 hover:text-amber-700 hover:bg-amber-50"
                        onClick={() => onStatusChange(item._id, 'draft')}
                        title="Unpublish"
                      >
                        <Clock className="h-4 w-4" />
                      </Button>
                    )}

                    {/* Delete Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => onDelete(item._id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {/* Empty State */}
            {sortedItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  No items found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};