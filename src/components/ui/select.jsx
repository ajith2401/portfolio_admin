// src/components/ui/select.jsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export const Select = ({ value, onValueChange, children, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {React.Children.map(children, child => {
        if (child.type === SelectTrigger) {
          return React.cloneElement(child, {
            onClick: () => setIsOpen(!isOpen),
            isOpen
          });
        }
        if (child.type === SelectContent && isOpen) {
          return React.cloneElement(child, {
            onSelect: (val) => {
              onValueChange?.(val);
              setIsOpen(false);
            }
          });
        }
        return null;
      })}
    </div>
  );
};

export const SelectTrigger = ({ children, className = '', onClick, isOpen }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between w-full h-10 px-3 py-2 text-sm bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${className}`}
    >
      {children}
      <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
    </button>
  );
};

export const SelectContent = ({ children, onSelect }) => {
  return (
    <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
      {React.Children.map(children, child => {
        if (child.type === SelectItem) {
          return React.cloneElement(child, { onSelect });
        }
        return child;
      })}
    </div>
  );
};

export const SelectValue = ({ children, placeholder }) => {
  return <span className="truncate">{children || placeholder}</span>;
};

export const SelectItem = ({ children, value, onSelect }) => {
  return (
    <button
      type="button"
      className="flex items-center w-full px-3 py-2 text-sm hover:bg-gray-100"
      onClick={() => onSelect?.(value)}
    >
      {children}
    </button>
  );
};