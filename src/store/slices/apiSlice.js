// src/store/api/apiSlice.js
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Writing', 'TechBlog', 'Project', 'Stats'],
  endpoints: (builder) => ({
    // Writings endpoints
    getWritings: builder.query({
      query: ({ page = 1, search = '', category = '', status = '' }) => {
        let queryString = `writings?page=${page}`;
        if (search) queryString += `&search=${encodeURIComponent(search)}`;
        if (category && category !== 'all') queryString += `&category=${encodeURIComponent(category)}`;
        if (status && status !== 'all') queryString += `&status=${encodeURIComponent(status)}`;
        return queryString;
      },
      providesTags: (result) => 
        result
          ? [
              ...result.writings.map(({ _id }) => ({ type: 'Writing', id: _id })),
              { type: 'Writing', id: 'LIST' },
            ]
          : [{ type: 'Writing', id: 'LIST' }],
    }),
    getWriting: builder.query({
      query: (id) => `writings/${id}`,
      providesTags: (result, error, id) => [{ type: 'Writing', id }],
    }),
    addWriting: builder.mutation({
      query: (writing) => ({
        url: 'writings',
        method: 'POST',
        body: writing,
      }),
      invalidatesTags: [{ type: 'Writing', id: 'LIST' }, { type: 'Stats' }],
    }),
    updateWriting: builder.mutation({
      query: ({ id, ...writing }) => ({
        url: `writings/${id}`,
        method: 'PUT',
        body: writing,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Writing', id },
        { type: 'Writing', id: 'LIST' },
        { type: 'Stats' },
      ],
    }),
    deleteWriting: builder.mutation({
      query: (id) => ({
        url: `writings/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Writing', id: 'LIST' }, { type: 'Stats' }],
    }),

    // Tech blog endpoints
    getTechBlogs: builder.query({
      query: ({ page = 1, search = '', category = '', status = '' }) => {
        let queryString = `tech-blog?page=${page}`;
        if (search) queryString += `&search=${encodeURIComponent(search)}`;
        if (category && category !== 'all') queryString += `&category=${encodeURIComponent(category)}`;
        if (status && status !== 'all') queryString += `&status=${encodeURIComponent(status)}`;
        return queryString;
      },
      providesTags: (result) =>
        result
          ? [
              ...result.techBlogs.map(({ _id }) => ({ type: 'TechBlog', id: _id })),
              { type: 'TechBlog', id: 'LIST' },
            ]
          : [{ type: 'TechBlog', id: 'LIST' }],
    }),
    getTechBlog: builder.query({
      query: (id) => `tech-blog/${id}`,
      providesTags: (result, error, id) => [{ type: 'TechBlog', id }],
    }),
    addTechBlog: builder.mutation({
      query: (techBlog) => ({
        url: 'tech-blog',
        method: 'POST',
        body: techBlog,
      }),
      invalidatesTags: [{ type: 'TechBlog', id: 'LIST' }, { type: 'Stats' }],
    }),
    updateTechBlog: builder.mutation({
      query: ({ id, ...techBlog }) => ({
        url: `tech-blog/${id}`,
        method: 'PUT',
        body: techBlog,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'TechBlog', id },
        { type: 'TechBlog', id: 'LIST' },
        { type: 'Stats' },
      ],
    }),
    deleteTechBlog: builder.mutation({
      query: (id) => ({
        url: `tech-blog/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'TechBlog', id: 'LIST' }, { type: 'Stats' }],
    }),

    // Projects endpoints
    getProjects: builder.query({
      query: ({ page = 1, search = '', category = '', status = '' }) => {
        let queryString = `projects?page=${page}`;
        if (search) queryString += `&search=${encodeURIComponent(search)}`;
        if (category && category !== 'all') queryString += `&category=${encodeURIComponent(category)}`;
        if (status && status !== 'all') queryString += `&status=${encodeURIComponent(status)}`;
        return queryString;
      },
      providesTags: (result) =>
        result
          ? [
              ...result.projects.map(({ _id }) => ({ type: 'Project', id: _id })),
              { type: 'Project', id: 'LIST' },
            ]
          : [{ type: 'Project', id: 'LIST' }],
    }),
    getProject: builder.query({
      query: (id) => `projects/${id}`,
      providesTags: (result, error, id) => [{ type: 'Project', id }],
    }),
    addProject: builder.mutation({
      query: (project) => ({
        url: 'projects',
        method: 'POST',
        body: project,
      }),
      invalidatesTags: [{ type: 'Project', id: 'LIST' }, { type: 'Stats' }],
    }),
    updateProject: builder.mutation({
      query: ({ id, ...project }) => ({
        url: `projects/${id}`,
        method: 'PUT',
        body: project,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Project', id },
        { type: 'Project', id: 'LIST' },
        { type: 'Stats' },
      ],
    }),
    deleteProject: builder.mutation({
      query: (id) => ({
        url: `projects/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Project', id: 'LIST' }, { type: 'Stats' }],
    }),

    // Dashboard stats
    getStats: builder.query({
      query: () => 'stats',
      providesTags: ['Stats'],
    }),
  }),
});

export const {
  useGetWritingsQuery,
  useGetWritingQuery,
  useAddWritingMutation,
  useUpdateWritingMutation,
  useDeleteWritingMutation,
  useGetTechBlogsQuery,
  useGetTechBlogQuery,
  useAddTechBlogMutation,
  useUpdateTechBlogMutation,
  useDeleteTechBlogMutation,
  useGetProjectsQuery,
  useGetProjectQuery,
  useAddProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  useGetStatsQuery,
} = apiSlice;