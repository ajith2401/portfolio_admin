// src/app/admin/Dashboard/components/ContentSection.js
'use client';

import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Alert,
  AlertTitle,
  AlertDescription,
  Button
} from '@/components/ui';
import { WritingEditor } from './editors/WritingEditor';
import { TechBlogEditor } from './editors/TechBlogEditor';
import { ProjectEditor } from './editors/ProjectEditor';
import { ContentList } from './ContentList';
import { api } from '../lib/api';

export const ContentSection = ({ type, title }) => {
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    loadItems();
  }, [type]);

  const loadItems = async () => {
    try {
      let data = [];
      switch (type) {
        case 'writings':
          data = await api.fetchWritings();
          break;
        case 'techblog':
          data = await api.fetchTechBlogs();
          break;
        case 'projects':
          data = await api.fetchProjects();
          break;
      }
      // Ensure we're setting an array, even if empty
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading content:', error);
      showAlert('Error loading content', 'error');
      setItems([]); // Set empty array on error
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

  const handleGenerateImage = async (id) => {
    try {
      await api.generateImage(id);
      loadItems();
      showAlert('Image generated successfully', 'success');
    } catch (error) {
      showAlert('Error generating image', 'error');
    }
  };

  const showAlert = (message, type = 'info') => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 3000);
  };

  const getEditor = () => {
    switch (type) {
      case 'writings':
        return WritingEditor;
      case 'techblog':
        return TechBlogEditor;
      case 'projects':
        return ProjectEditor;
      default:
        return null;
    }
  };

  const Editor = getEditor();

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
            <Editor
              content={selectedItem}
              onSave={handleSave}
              onClose={() => setIsEditorOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <ContentList
        type={type}
        items={items}
        onEdit={(item) => {
          setSelectedItem(item);
          setIsEditorOpen(true);
        }}
        onDelete={handleDelete}
        onStatusChange={handleStatusChange}
        onGenerateImage={handleGenerateImage}
      />
    </div>
  );
};
