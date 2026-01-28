import { useState, useEffect, useCallback } from 'react';

export type ViewType = 'calendar' | 'grid';

interface UseViewPreferenceReturn {
  view: ViewType;
  setView: (view: ViewType) => void;
  toggleView: () => void;
}

const STORAGE_KEY = 'social-media-scheduler-view-preference';

export const useViewPreference = (): UseViewPreferenceReturn => {
  const [view, setViewState] = useState<ViewType>(() => {
    // Try to get from localStorage on initial load
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'calendar' || saved === 'grid') {
        return saved;
      }
    }
    return 'calendar'; // Default to calendar view
  });

  // Persist to localStorage whenever view changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, view);
    }
  }, [view]);

  const setView = useCallback((newView: ViewType) => {
    setViewState(newView);
  }, []);

  const toggleView = useCallback(() => {
    setViewState((current) => (current === 'calendar' ? 'grid' : 'calendar'));
  }, []);

  return { view, setView, toggleView };
};

export default useViewPreference;
