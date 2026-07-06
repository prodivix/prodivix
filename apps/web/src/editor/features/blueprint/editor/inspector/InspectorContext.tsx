import { createContext, useContext } from 'react';
import type { InspectorContextValue } from './InspectorContext.types';

export const InspectorContext = createContext<InspectorContextValue | null>(
  null
);

export const useInspectorContext = (): InspectorContextValue => {
  const value = useContext(InspectorContext);
  if (!value) {
    throw new Error('InspectorContext is missing');
  }
  return value;
};
