// src/app/admin/Dashboard/components/ContentSection.js
'use client';

import React, { useState, useEffect } from 'react';
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

export const ContentSection = ({ type, title }) => {
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

  useEffect(() => {
    loadItems();
  }, [type]);

  const loadItems = async () => {
    try {
      setLoading(true);
      let response;
      switch (type) {
        case 'writings':
          response = await api.fetchWritings();
          console.log({response});
          
          if (response) {
            setItems(response.writings || []);
            setPagination(response.pagination || { current: 1, total: 0, pages: 1 });
          }
          break;
        case 'techblog':
          response = await api.fetchTechBlogs();
          if (response?.data) {
            setItems(response.data.techBlogs || []);
            setPagination(response.data.pagination || { current: 1, total: 0, pages: 1 });
          }
          break;
        case 'projects':
          response = await api.fetchProjects();
          if (response?.data) {
            setItems(response.data.projects || []);
            setPagination(response.data.pagination || { current: 1, total: 0, pages: 1 });
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
  };

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
        loadItems();
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

  const getEditor = () => {
    switch (type) {
      case 'writings':
        return import('./editors/WritingEditor').then(mod => mod.WritingEditor);
      case 'techblog':
        return import('./editors/TechBlogEditor').then(mod => mod.TechBlogEditor);
      case 'projects':
        return import('./editors/ProjectEditor').then(mod => mod.ProjectEditor);
      default:
        return null;
    }
  };

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
            <Button onClick={() => setSelectedItem(null)}>
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
            {/* Dynamic import of editor component */}
            {isEditorOpen && getEditor().then(Editor => (
              <Editor
                content={selectedItem}
                onSave={handleSave}
                onClose={() => setIsEditorOpen(false)}
              />
            ))}
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
            <div className="flex justify-center gap-2 mt-4">
              {Array.from({ length: pagination.pages }, (_, i) => (
                <Button
                  key={i + 1}
                  variant={pagination.current === i + 1 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => loadItems(i + 1)}
                >
                  {i + 1}
                </Button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};