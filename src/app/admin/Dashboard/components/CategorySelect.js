// src/app/admin/Dashboard/components/CategorySelect.js
'use client';

import React from 'react';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui';

export const CategorySelect = ({ value, onChange, categories }) => {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select Category">
          {value ? value.charAt(0).toUpperCase() + value.slice(1).replace('-', ' ') : 'Select Category'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {categories.map(category => (
          <SelectItem key={category} value={category}>
            {category.charAt(0).toUpperCase() + category.slice(1).replace('-', ' ')}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};