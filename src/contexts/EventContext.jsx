import { createContext, useContext } from 'react';

const EventContext = createContext(null);

export function EventProvider({ value, children }) {
  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
}

export function useEvent() {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error('useEvent must be used inside EventProvider');
  return ctx;
}
