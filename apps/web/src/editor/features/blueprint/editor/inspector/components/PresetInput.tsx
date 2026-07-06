import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type PresetInputOption = {
  label: string;
  value: string;
};

type PresetInputProps = {
  value: string;
  options: PresetInputOption[];
  placeholder?: string;
  onChange: (value: string) => void;
};

export function PresetInput({
  value,
  options,
  placeholder,
  onChange,
}: PresetInputProps) {
  const { t } = useTranslation('blueprint');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="InspectorInputRow group relative flex w-full items-center gap-1"
    >
      <input
        className="h-7 w-full min-w-0 rounded-md border border-(--border-default) bg-transparent px-2 pr-7 text-xs text-(--text-primary) outline-none placeholder:text-(--text-muted)"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="absolute right-1 inline-flex h-5 w-5 items-center justify-center rounded-sm border-0 bg-transparent text-(--text-muted) hover:text-(--text-primary)"
        onClick={() => setOpen((current) => !current)}
        aria-label={t('inspector.fields.presetInput.toggle', {
          defaultValue: 'Toggle presets',
        })}
      >
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="absolute top-[calc(100%+4px)] right-0 left-0 z-20 max-h-44 overflow-auto rounded-md border border-(--border-default) bg-(--bg-canvas) p-1 shadow-(--shadow-md)">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="flex w-full items-center rounded-sm border-0 bg-transparent px-2 py-1 text-left text-xs text-(--text-secondary) hover:bg-(--bg-raised) hover:text-(--text-primary)"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
