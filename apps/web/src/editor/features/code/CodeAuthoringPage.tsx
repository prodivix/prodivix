import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { CodeAuthoringWorkspace } from './CodeAuthoringWorkspace';

type CodeFolder = 'scripts' | 'styles' | 'shaders';

const isCodeFolder = (value: string | null): value is CodeFolder =>
  value === 'scripts' || value === 'styles' || value === 'shaders';

export default function CodeAuthoringPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCreateFolder = useMemo(() => {
    const value = searchParams.get('create');
    return isCodeFolder(value) ? value : null;
  }, [searchParams]);

  return (
    <CodeAuthoringWorkspace
      requestedCreateFolder={requestedCreateFolder}
      onCreateRequestConsumed={() => {
        const next = new URLSearchParams(searchParams);
        next.delete('create');
        setSearchParams(next, { replace: true });
      }}
    />
  );
}
