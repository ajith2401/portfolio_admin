'use client';
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Alert,
  AlertTitle,
  AlertDescription,
  Button,
} from '@/components/ui';
import { ContentList } from './ContentList';
import { api } from '../lib/api';
import { Pagination } from './Pagination';

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

export const ContentSection = ({ type, title }) => {
  console.log({type,title})
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    current: 1,
    total: 1,
    pages: 1
  });

  const loadItems = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      let response;
      switch (type) {
        case 'writings':
          response = await api.fetchWritings(page);
          if (response) {
            setItems(response.writings || []);
            setPagination({
              current: page,
              total: response.pagination?.total || 0,
              pages: response.pagination?.pages || 1
            });
          }
          break;
        case 'tech-blog':
          response = await api.fetchTechBlogs(page);
          if (response) {
            console.log({response});
            
            setItems(response?.techBlogs || []);
            setPagination({
              current: page,
              total: response?.pagination?.total || 0,
              pages: response?.pagination?.pages || 1
            });
          }
          break;
        case 'projects':
          response = await api.fetchProjects(page);
          if (response) {
            setItems(response?.projects || []);
            setPagination({
              current: page,
              total: response?.pagination?.total || 0,
              pages: response?.pagination?.pages || 1
            });
          }
          break;
      }
    } catch (error) {
      console.error('Error loading content:', error);
      showAlert('Error loading content', 'error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    loadItems();
  }, [type, loadItems]);
  
  const handleSave = async (formData) => {
    try {
      if (selectedItem) {
        await api.updateContent(type, selectedItem._id, formData);
      } else {
        await api.createContent(type, formData);
      }
      loadItems();
      setIsEditorOpen(false);
      showAlert('Content saved successfully', 'success');
    } catch (error) {
      showAlert('Error saving content', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this item?')) {
      try {
        await api.deleteContent(type, id);
        
        // If this is the last item on the page and not the first page
        if (items.length === 1 && pagination.current > 1) {
          loadItems(pagination.current - 1);
        } else {
          loadItems(pagination.current);
        }
        
        showAlert('Content deleted successfully', 'success');
      } catch (error) {
        showAlert('Error deleting content', 'error');
      }
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.updateContent(type, id, { status });
      loadItems();
      showAlert('Status updated successfully', 'success');
    } catch (error) {
      showAlert('Error updating status', 'error');
    }
  };

  const showAlert = (message, type = 'info') => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 3000);
  };

  // Determine which Editor component to use
  const EditorComponent = React.useMemo(() => {
    switch (type) {
      case 'writings':
        return WritingEditor;
      case 'tech-blog':
        return TechBlogEditor;
      case 'projects':
        return ProjectEditor;
      default:
        return null;
    }
  }, [type]);

  return (
    <div className="space-y-4">
      {alert && (
        <Alert variant={alert.type === 'error' ? 'destructive' : 'default'}>
          <AlertTitle>
            {alert.type === 'error' ? 'Error' : 'Success'}
          </AlertTitle>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setSelectedItem(null);
              setIsEditorOpen(true);
            }}>
              <Plus size={16} className="mr-2" />
              Add New
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {selectedItem ? 'Edit Content' : 'Add New Content'}
              </DialogTitle>
            </DialogHeader>
            {isEditorOpen && EditorComponent && (
              <Suspense fallback={<div>Loading...</div>}>
                <EditorComponent
                  content={selectedItem}
                  onSave={handleSave}
                  onClose={() => setIsEditorOpen(false)}
                />
              </Suspense>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <ContentList
            type={type}
            items={items}
            onEdit={(item) => {
              setSelectedItem(item);
              setIsEditorOpen(true);
            }}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
          />

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="mt-6">
              <Pagination
                currentPage={pagination.current}
                totalPages={pagination.pages}
                onPageChange={(page) => {
                  // Handle page change
                  if (page !== pagination.current) {
                    loadItems(page);
                  }
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};