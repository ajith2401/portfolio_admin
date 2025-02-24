
  // src/components/ui/select.jsx
  export function Select({ value, onValueChange, children }) {
    return (
      <div className="relative">
        {children}
      </div>
    );
  }
  
  export function SelectTrigger({ className = '', children }) {
    return (
      <button
        className={`flex h-10 w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        {children}
      </button>
    );
  }
  
  export function SelectValue({ placeholder, children }) {
    return <span>{children || placeholder}</span>;
  }
  
  export function SelectContent({ children }) {
    return (
      <div className="absolute top-full left-0 z-50 w-full mt-1 bg-white border rounded-md shadow-lg">
        {children}
      </div>
    );
  }
  
  export function SelectItem({ value, children, ...props }) {
    return (
      <button
        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100"
        onClick={() => props.onSelect?.(value)}
        {...props}
      >
        {children}
      </button>
    );
  }