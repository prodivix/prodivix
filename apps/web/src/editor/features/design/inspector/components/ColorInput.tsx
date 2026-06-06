import { useMemo } from 'react';
import { PdxInput } from '@prodivix/ui';
import { useTranslation } from 'react-i18next';

type ColorInputProps = {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
};

const normalizeHex = (raw: string) => {
  const value = raw.trim();
  if (!value) return null;
  if (/^#([0-9a-f]{3})$/i.test(value)) return value;
  if (/^#([0-9a-f]{6})$/i.test(value)) return value;
  return null;
};

export function ColorInput({
  value,
  onChange,
  placeholder,
  disabled = false,
}: ColorInputProps) {
  const { t } = useTranslation('blueprint');
  const swatchValue = useMemo(() => normalizeHex(value ?? ''), [value]);

  return (
    <div className="flex w-48 items-center justify-end gap-2">
      <div className="min-w-0 flex-1">
        <PdxInput
          size="Small"
          value={value ?? ''}
          onChange={(next) => onChange(next.trim() ? next : undefined)}
          placeholder={
            placeholder ??
            t('inspector.fields.colorInput.placeholder', {
              defaultValue: '#RRGGBB / var(--bg-panel)',
            })
          }
          disabled={disabled}
        />
      </div>
      <input
        type="color"
        value={swatchValue ?? '#000000'}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-6 cursor-pointer rounded-md border border-(--border-default) bg-transparent p-0"
        aria-label={t('inspector.fields.colorInput.pickerAria', {
          defaultValue: 'Color picker',
        })}
      />
    </div>
  );
}
