import { createSlice } from '@reduxjs/toolkit';

// Define constant sections to prevent typo errors
export const CONTENT_SECTIONS = {
  WRITINGS: 'writings',
  TECH_BLOG: 'tech-blog',
  PROJECTS: 'projects'
};

const initialState = {
  currentSection: 'dashboard',
  currentPage: {
    [CONTENT_SECTIONS.WRITINGS]: 1,
    [CONTENT_SECTIONS.TECH_BLOG]: 1,
    [CONTENT_SECTIONS.PROJECTS]: 1,
  },
  sidebarCollapsed: false,
  formDrafts: {
    [CONTENT_SECTIONS.WRITINGS]: null,
    [CONTENT_SECTIONS.TECH_BLOG]: null,
    [CONTENT_SECTIONS.PROJECTS]: null,
  },
  searchFilters: {
    [CONTENT_SECTIONS.WRITINGS]: { search: '', category: 'all', status: 'all' },
    [CONTENT_SECTIONS.TECH_BLOG]: { search: '', category: 'all', status: 'all' },
    [CONTENT_SECTIONS.PROJECTS]: { search: '', category: 'all', status: 'all' },
  },
  // Add viewMode with proper initialization
  viewMode: {
    [CONTENT_SECTIONS.WRITINGS]: 'grid',
    [CONTENT_SECTIONS.TECH_BLOG]: 'grid',
    [CONTENT_SECTIONS.PROJECTS]: 'grid'
  }
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // Existing reducers
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
    // New robust view mode setter
    setViewMode: (state, action) => {
      const { section, mode } = action.payload;
      
      // Validate section and mode
      if (!Object.values(CONTENT_SECTIONS).includes(section)) {
        console.warn(`Invalid section: ${section}`);
        return;
      }

      if (!['grid', 'list'].includes(mode)) {
        console.warn(`Invalid view mode: ${mode}. Defaulting to grid.`);
        state.viewMode[section] = 'grid';
        return;
      }

      state.viewMode[section] = mode;
    }
  }
});

export const {
  setCurrentSection,
  setCurrentPage,
  toggleSidebar,
  saveFormDraft,
  clearFormDraft,
  updateSearchFilters,
  resetSearchFilters,
  setViewMode,
} = uiSlice.actions;

export default uiSlice.reducer;