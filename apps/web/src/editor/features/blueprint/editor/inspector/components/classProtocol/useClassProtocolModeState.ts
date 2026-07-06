import { useEffect, useRef, useState } from 'react';

export type ClassProtocolEditMode = 'token' | 'inline';

export const useClassProtocolModeState = (value: string) => {
  const [mode, setMode] = useState<ClassProtocolEditMode>('token');
  const [inlineDraft, setInlineDraft] = useState(value);
  const previousModeRef = useRef<ClassProtocolEditMode>(mode);

  useEffect(() => {
    const enteredInline =
      previousModeRef.current !== 'inline' && mode === 'inline';
    if (mode !== 'inline' || enteredInline) {
      setInlineDraft(value);
    }
    previousModeRef.current = mode;
  }, [mode, value]);

  const nextMode: ClassProtocolEditMode = mode === 'token' ? 'inline' : 'token';

  return {
    mode,
    inlineDraft,
    nextMode,
    setMode,
    setInlineDraft,
  };
};
