'use client';

import { Loader2 } from 'lucide-react';

export const LoadingSpinner = ({ size = 'default', className = '' }) => {
  const sizeClasses = {
    small: 'w-4 h-4',
    default: 'w-6 h-6',
    large: 'w-8 h-8'
  };

  return (
    <Loader2 
      className={`animate-spin ${sizeClasses[size]} ${className}`}
    />
  );
};

export const LoadingOverlay = ({ message = 'Loading...' }) => {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="flex flex-col items-center space-y-4">
        <LoadingSpinner size="large" className="text-primary" />
        <p className="text-foreground text-sm font-medium">{message}</p>
      </div>
    </div>
  );
};

export const ContentLoader = ({ rows = 3, className = '' }) => {
  return (
    <div className={`space-y-4 ${className}`}>
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="animate-pulse space-y-2">
          <div className="h-4 bg-muted rounded w-3/4"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </div>
      ))}
    </div>
  );
};
