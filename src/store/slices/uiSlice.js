

// src/store/slices/uiSlice.js
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  currentSection: 'dashboard', // Default section
  currentPage: {
    writings: 1,
    'tech-blog': 1,
    projects: 1,
  },
  sidebarCollapsed: false,
  formDrafts: {
    writings: null,
    'tech-blog': null,
    projects: null,
  },
  searchFilters: {
    writings: { search: '', category: 'all', status: 'all' },
    'tech-blog': { search: '', category: 'all', status: 'all' },
    projects: { search: '', category: 'all', status: 'all' },
  },
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setCurrentSection: (state, action) => {
      state.currentSection = action.payload;
    },
    setCurrentPage: (state, action) => {
      const { section, page } = action.payload;
      state.currentPage[section] = page;
    },
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    saveFormDraft: (state, action) => {
      const { section, data } = action.payload;
      state.formDrafts[section] = data;
    },
    clearFormDraft: (state, action) => {
      state.formDrafts[action.payload] = null;
    },
    updateSearchFilters: (state, action) => {
      const { section, filters } = action.payload;
      state.searchFilters[section] = {
        ...state.searchFilters[section],
        ...filters,
      };
    },
    resetSearchFilters: (state, action) => {
      state.searchFilters[action.payload] = {
        search: '',
        category: 'all',
        status: 'all',
      };
    },
  },
});

export const {
  setCurrentSection,
  setCurrentPage,
  toggleSidebar,
  saveFormDraft,
  clearFormDraft,
  updateSearchFilters,
  resetSearchFilters,
} = uiSlice.actions;

export default uiSlice.reducer;