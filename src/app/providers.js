// src/app/providers.js
'use client';

import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { store, persistor } from '@/store';
import { Loader2 } from 'lucide-react';

export function Providers({ children }) {
  return (
    <Provider store={store}>
      <PersistGate 
        loading={
          <div className="fixed inset-0 flex items-center justify-center bg-white/80">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        } 
        persistor={persistor}
      >
        {children}
      </PersistGate>
    </Provider>
  );
}