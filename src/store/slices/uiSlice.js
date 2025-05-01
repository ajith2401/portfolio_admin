import { createSlice } from '@reduxjs/toolkit';

// Predefined content sections to prevent typos
export const CONTENT_SECTIONS = {
  WRITINGS: 'writings',
  TECH_BLOG: 'tech-blog',
  PROJECTS: 'projects'
};

// Create a function to generate initial state
const createInitialState = () => {
  return {
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
    // Ensure viewMode is always initialized
    viewMode: {
      [CONTENT_SECTIONS.WRITINGS]: 'grid',
      [CONTENT_SECTIONS.TECH_BLOG]: 'grid',
      [CONTENT_SECTIONS.PROJECTS]: 'grid'
    }
  };
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState: createInitialState(),
  reducers: {
    setCurrentSection: (state, action) => {
      state.currentSection = action.payload;
    },
    setCurrentPage: (state, action) => {
      const { section, page } = action.payload;
      
      // Defensive check for section
      if (!state.currentPage.hasOwnProperty(section)) {
        console.warn(`Invalid section: ${section}`);
        return;
      }
      
      state.currentPage[section] = page;
    },
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    saveFormDraft: (state, action) => {
      const { section, data } = action.payload;
      
      // Defensive check for section
      if (!state.formDrafts.hasOwnProperty(section)) {
        console.warn(`Invalid section for form draft: ${section}`);
        return;
      }
      
      state.formDrafts[section] = data;
    },
    clearFormDraft: (state, action) => {
      const section = action.payload;
      
      // Defensive check for section
      if (!state.formDrafts.hasOwnProperty(section)) {
        console.warn(`Invalid section for clearing draft: ${section}`);
        return;
      }
      
      state.formDrafts[section] = null;
    },
    updateSearchFilters: (state, action) => {
      const { section, filters } = action.payload;
      
      // Defensive check for section
      if (!state.searchFilters.hasOwnProperty(section)) {
        console.warn(`Invalid section for search filters: ${section}`);
        return;
      }
      
      state.searchFilters[section] = {
        ...state.searchFilters[section],
        ...filters,
      };
    },
    resetSearchFilters: (state, action) => {
      const section = action.payload;
      
      // Defensive check for section
      if (!state.searchFilters.hasOwnProperty(section)) {
        console.warn(`Invalid section for resetting filters: ${section}`);
        return;
      }
      
      state.searchFilters[section] = {
        search: '',
        category: 'all',
        status: 'all',
      };
    },
    setViewMode: (state, action) => {
      const { section, mode } = action.payload;
      
      // Validate section
      if (!Object.values(CONTENT_SECTIONS).includes(section)) {
        console.warn(`Invalid section for view mode: ${section}`);
        return;
      }
      
      // Validate mode
      const validMode = ['grid', 'list'].includes(mode) ? mode : 'grid';
      
      // Ensure viewMode object exists for the section
      if (!state.viewMode) {
        state.viewMode = createInitialState().viewMode;
      }
      
      // Set the view mode
      state.viewMode[section] = validMode;
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