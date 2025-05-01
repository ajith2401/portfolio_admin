'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { 
  Plus, 
  Loader2, 
  Grid, 
  List, 
  Search, 
  Filter, 
  XCircle 
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { ContentList } from './ContentList';
import { ContentGrid } from './ContentGrid';
import { Pagination } from './Pagination';
import { 
  setCurrentPage, 
  updateSearchFilters, 
  saveFormDraft, 
  clearFormDraft,
  setViewMode,
  CONTENT_SECTIONS 
} from '@/store/slices/uiSlice';
import { 
  WRITING_CATEGORIES, 
  TECH_BLOG_CATEGORIES, 
  PROJECT_CATEGORIES 
} from '../lib/constants';
import { useGetWritingsQuery,
  useAddWritingMutation,
  useUpdateWritingMutation,
  useDeleteWritingMutation,
  useGetTechBlogsQuery,
  useAddTechBlogMutation,
  useUpdateTechBlogMutation,
  useDeleteTechBlogMutation,
  useGetProjectsQuery,
  useAddProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation
 } from '@/store/slices/apiSlice';


// Lazy-loaded editor components
const WritingEditor = React.lazy(() => 
  import('./editors/WritingEditor').then(mod => ({ default: mod.WritingEditor }))
);
const TechBlogEditor = React.lazy(() => 
  import('./editors/TechBlogEditor').then(mod => ({ default: mod.TechBlogEditor }))
);
const ProjectEditor = React.lazy(() => 
  import('./editors/ProjectEditor').then(mod => ({ default: mod.ProjectEditor }))
);

// Mapping of content types to queries and mutations
const CONTENT_TYPE_MAPPING = {
  [CONTENT_SECTIONS.WRITINGS]: {
    getQuery: useGetWritingsQuery,
    addMutation: useAddWritingMutation,
    updateMutation: useUpdateWritingMutation,
    deleteMutation: useDeleteWritingMutation,
    editor: WritingEditor,
    categories: WRITING_CATEGORIES
  },
  [CONTENT_SECTIONS.TECH_BLOG]: {
    getQuery: useGetTechBlogsQuery,
    addMutation: useAddTechBlogMutation,
    updateMutation: useUpdateTechBlogMutation,
    deleteMutation: useDeleteTechBlogMutation,
    editor: TechBlogEditor,
    categories: TECH_BLOG_CATEGORIES
  },
  [CONTENT_SECTIONS.PROJECTS]: {
    getQuery: useGetProjectsQuery,
    addMutation: useAddProjectMutation,
    updateMutation: useUpdateProjectMutation,
    deleteMutation: useDeleteProjectMutation,
    editor: ProjectEditor,
    categories: PROJECT_CATEGORIES
  }
};

export const ContentSection = ({ type, title }) => {
  const dispatch = useDispatch();
  
  // Safely get content type mapping
  const contentTypeConfig = CONTENT_TYPE_MAPPING[type];
  if (!contentTypeConfig) {
    throw new Error(`Unsupported content type: ${type}`);
  }

  // Destructure content type configuration
  const { 
    getQuery, 
    addMutation, 
    updateMutation, 
    deleteMutation, 
    editor: EditorComponent,
    categories 
  } = contentTypeConfig;

  // Redux state selectors with robust fallbacks
  const currentPage = useSelector(state => 
    state.ui.currentPage[type] || 1
  );
  const searchFilters = useSelector(state => 
    state.ui.searchFilters[type] || { 
      search: '', 
      category: 'all', 
      status: 'all' 
    }
  );
  const formDrafts = useSelector(state => 
    state.ui.formDrafts[type] || null
  );
  const viewMode = useSelector(state => {
    const mode = state.ui.viewMode?.[type];
    return ['grid', 'list'].includes(mode) ? mode : 'grid';
  });

  // Local state
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [alert, setAlert] = useState(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Fetch data using RTK Query
  const { 
    data, 
    isLoading, 
    error 
  } = getQuery({ 
    page: currentPage, 
    search: searchFilters.search, 
    category: searchFilters.category, 
    status: searchFilters.status 
  });

  // Mutations
  const [addItem] = addMutation();
  const [updateItem] = updateMutation();
  const [deleteItem] = deleteMutation();

  // Handle form submission
  const handleSave = async (formData) => {
    try {
      if (selectedItem) {
        // Update existing item
        await updateItem({ id: selectedItem._id, ...formData });
        showAlert(`${title} updated successfully`, 'success');
      } else {
        // Create new item
        await addItem(formData);
        showAlert(`${title} created successfully`, 'success');
      }

      // Close editor and clear draft
      setIsEditorOpen(false);
      dispatch(clearFormDraft(type));
      setSelectedItem(null);
    } catch (error) {
      console.error(`Error saving ${type}:`, error);
      showAlert(`Failed to save ${title}`, 'destructive');
    }
  };

  // Handle item deletion
  const handleDelete = async (id) => {
    if (window.confirm(`Are you sure you want to delete this ${title.toLowerCase()}?`)) {
      try {
        await deleteItem(id);
        
        // If this is the last item on the page and not the first page
        const items = getItems(data, type);
        if (items.length === 1 && currentPage > 1) {
          dispatch(setCurrentPage({ section: type, page: currentPage - 1 }));
        }
        
        showAlert(`${title} deleted successfully`, 'success');
      } catch (error) {
        console.error(`Error deleting ${type}:`, error);
        showAlert(`Failed to delete ${title}`, 'destructive');
      }
    }
  };

  // Show alert message
  const showAlert = (message, variant = 'default') => {
    setAlert({ message, variant });
    setTimeout(() => setAlert(null), 3000);
  };

  // Handle page change
  const handlePageChange = (newPage) => {
    dispatch(setCurrentPage({ section: type, page: newPage }));
  };

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    dispatch(updateSearchFilters({ 
      section: type, 
      filters: { ...searchFilters, [key]: value }
    }));
  };

  // Toggle view mode
  const toggleViewMode = (mode) => {
    dispatch(setViewMode({ section: type, mode }));
  };

  // Extract items from data
  const getItems = (data, contentType) => {
    switch (contentType) {
      case CONTENT_SECTIONS.WRITINGS:
        return data?.writings || [];
      case CONTENT_SECTIONS.TECH_BLOG:
        return data?.techBlogs || [];
      case CONTENT_SECTIONS.PROJECTS:
        return data?.projects || [];
      default:
        return [];
    }
  };

  // Pagination details
  const pagination = useMemo(() => 
    data?.pagination || { total: 0, pages: 1, current: 1 }, 
    [data]
  );
  const items = useMemo(() => getItems(data, type), [data, type]);

  // Render content based on loading/error states
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-red-50 p-4 rounded-lg text-red-700">
          <p className="font-medium">Error loading content</p>
          <p className="text-sm mt-1">{error.message || 'Failed to fetch data'}</p>
          <Button 
            variant="outline" 
            className="mt-2" 
            onClick={() => window.location.reload()}
            size="sm"
          >
            Try Again
          </Button>
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="bg-white rounded-lg shadow text-center p-8">
          <p className="text-gray-500 mb-4">No items found</p>
          <Button onClick={() => setIsEditorOpen(true)}>
            <Plus size={16} className="mr-1" />
            Create Your First {title}
          </Button>
        </div>
      );
    }

    return viewMode === 'grid' ? (
      <ContentGrid
        type={type}
        items={items}
        onEdit={(item) => {
          setSelectedItem(item);
          setIsEditorOpen(true);
        }}
        onDelete={handleDelete}
      />
    ) : (
      <ContentList
        type={type}
        items={items}
        onEdit={(item) => {
          setSelectedItem(item);
          setIsEditorOpen(true);
        }}
        onDelete={handleDelete}
      />
    );
  };

  return (
    <div className="space-y-4">
     {/* Header with view mode toggle and filters */}
     <div className="flex justify-between items-center">
     <h2 className="text-2xl font-semibold">{title}</h2>
     <div className="flex items-center space-x-2">
       {/* View Mode Toggle */}
       <div className="bg-white border rounded-md p-1 flex">
         <Button
           variant={viewMode === 'grid' ? 'default' : 'ghost'}
           size="sm"
           className="px-2"
           onClick={() => toggleViewMode('grid')}
           title="Grid View"
         >
           <Grid size={18} />
         </Button>
         <Button
           variant={viewMode === 'list' ? 'default' : 'ghost'}
           size="sm"
           className="px-2"
           onClick={() => toggleViewMode('list')}
           title="List View"
         >
           <List size={18} />
         </Button>
       </div>

       {/* Filter Toggle */}
       <Button
         variant="outline"
         size="sm"
         onClick={() => setIsFilterOpen(!isFilterOpen)}
         title={isFilterOpen ? "Hide Filters" : "Show Filters"}
       >
         {isFilterOpen ? <XCircle size={16} /> : <Filter size={16} />}
       </Button>

       {/* Add New Button */}
       <Button 
         onClick={() => {
           setSelectedItem(null);
           setIsEditorOpen(true);
         }}
       >
         <Plus size={16} className="mr-1" />
         Add New
       </Button>
     </div>
   </div>

   {/* Filters */}
   {isFilterOpen && (
     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
       {/* Search Input */}
       <div className="relative">
         <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
         <Input
           placeholder="Search..."
           value={searchFilters.search}
           onChange={(e) => handleFilterChange('search', e.target.value)}
           className="pl-10 w-full bg-white"
         />
       </div>

       {/* Category Filter */}
       <Select
         value={searchFilters.category}
         onValueChange={(value) => handleFilterChange('category', value)}
       >
         <SelectTrigger>
           <SelectValue placeholder="All Categories" />
         </SelectTrigger>
         <SelectContent>
           <SelectItem value="all">All Categories</SelectItem>
           {categories.map(category => (
             <SelectItem key={category} value={category}>
               {category.split('-').map(word => 
                 word.charAt(0).toUpperCase() + word.slice(1)
               ).join(' ')}
             </SelectItem>
           ))}
         </SelectContent>
       </Select>

       {/* Status Filter */}
       <Select
         value={searchFilters.status}
         onValueChange={(value) => handleFilterChange('status', value)}
       >
         <SelectTrigger>
           <SelectValue placeholder="All Statuses" />
         </SelectTrigger>
         <SelectContent>
           <SelectItem value="all">All Statuses</SelectItem>
           <SelectItem value="draft">Draft</SelectItem>
           <SelectItem value="published">Published</SelectItem>
         </SelectContent>
       </Select>
     </div>
   )}

   {/* Content Area */}
   <div className="space-y-4">
     {renderContent()}
   </div>

   {/* Pagination */}
   {pagination.pages > 1 && (
     <div className="mt-6 flex justify-center">
       <Pagination
         currentPage={currentPage}
         totalPages={pagination.pages}
         onPageChange={handlePageChange}
       />
     </div>
   )}

   {/* Editor Dialog */}
   <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
     <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
       <DialogHeader>
         <DialogTitle>
           {selectedItem ? `Edit ${title}` : `Create New ${title}`}
         </DialogTitle>
       </DialogHeader>
       
       {isEditorOpen && (
         <React.Suspense fallback={<div className="p-4 text-center">Loading editor...</div>}>
           <EditorComponent
             content={selectedItem || formDrafts}
             onSave={handleSave}
             onClose={() => {
               setIsEditorOpen(false);
               setSelectedItem(null);
             }}
           />
         </React.Suspense>
       )}
     </DialogContent>
   </Dialog>
 </div>
);
};