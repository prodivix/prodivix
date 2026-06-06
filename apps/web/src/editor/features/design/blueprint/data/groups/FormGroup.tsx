import {
  PdxColorPicker,
  PdxDatePicker,
  PdxDateRangePicker,
  PdxFileUpload,
  PdxImageUpload,
  PdxInput,
  PdxPasswordStrength,
  PdxRange,
  PdxRating,
  PdxRegexInput,
  PdxRegionPicker,
  PdxRichTextEditor,
  PdxSearch,
  PdxSlider,
  PdxTextarea,
  PdxTimePicker,
  PdxVerificationCode,
} from '@prodivix/ui';
import type { ComponentGroup } from '@/editor/features/design/blueprint/editor/model/types';
import { SIZE_OPTIONS } from '@/editor/features/design/blueprint/data/options';
import { REGION_OPTIONS } from '@/editor/features/design/blueprint/data/sampleData';

export const FORM_GROUP: ComponentGroup = {
  id: 'form',
  title: '智能表单',
  items: [
    {
      id: 'input',
      name: 'Input',
      preview: <PdxInput size="Medium" placeholder="Input" value="Hello" />,
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxInput
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          placeholder="Input"
          value="Hello"
        />
      ),
    },
    {
      id: 'textarea',
      name: 'Textarea',
      preview: (
        <PdxTextarea
          size="Medium"
          placeholder="Textarea"
          rows={2}
          value="Notes"
        />
      ),
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxTextarea
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          placeholder="Textarea"
          rows={2}
          value="Notes"
        />
      ),
    },
    {
      id: 'search',
      name: 'Search',
      preview: <PdxSearch size="Medium" value="Query" />,
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxSearch
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          value="Query"
        />
      ),
      scale: 0.5,
    },
    {
      id: 'date-picker',
      name: 'DatePicker',
      preview: <PdxDatePicker size="Medium" value="2025-01-01" />,
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxDatePicker
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          value="2025-01-01"
        />
      ),
    },
    {
      id: 'date-range-picker',
      name: 'DateRange',
      preview: (
        <PdxDateRangePicker
          size="Medium"
          startValue="2025-01-01"
          endValue="2025-01-07"
        />
      ),
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxDateRangePicker
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          startValue="2025-01-01"
          endValue="2025-01-07"
        />
      ),
    },
    {
      id: 'time-picker',
      name: 'TimePicker',
      preview: <PdxTimePicker size="Medium" value="09:30" />,
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxTimePicker
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          value="09:30"
        />
      ),
      scale: 0.85,
    },
    {
      id: 'region-picker',
      name: 'RegionPicker',
      preview: (
        <PdxRegionPicker
          size="Medium"
          options={REGION_OPTIONS}
          defaultValue={{
            province: 'east',
            city: 'metro',
            district: 'downtown',
          }}
        />
      ),
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxRegionPicker
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          options={REGION_OPTIONS}
          defaultValue={{
            province: 'east',
            city: 'metro',
            district: 'downtown',
          }}
        />
      ),
      scale: 0.8,
    },
    {
      id: 'verification-code',
      name: 'Verification',
      preview: <PdxVerificationCode size="Medium" defaultValue="123456" />,
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxVerificationCode
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          defaultValue="123456"
        />
      ),
      scale: 0.6,
    },
    {
      id: 'password-strength',
      name: 'PasswordStrength',
      preview: <PdxPasswordStrength size="Medium" defaultValue="Abc123!@" />,
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxPasswordStrength
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          defaultValue="Abc123!@"
        />
      ),
      scale: 0.6,
    },
    {
      id: 'regex-input',
      name: 'RegexInput',
      preview: (
        <PdxRegexInput
          size="Medium"
          pattern="^\\S+@\\S+\\.\\S+$"
          defaultValue="user@example.com"
        />
      ),
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxRegexInput
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          pattern="^\\S+@\\S+\\.\\S+$"
          defaultValue="user@example.com"
        />
      ),
    },
    {
      id: 'file-upload',
      name: 'FileUpload',
      preview: <PdxFileUpload showList={false} />,
      scale: 0.6,
    },
    {
      id: 'image-upload',
      name: 'ImageUpload',
      preview: <PdxImageUpload />,
      scale: 0.6,
    },
    {
      id: 'rich-text-editor',
      name: 'RichText',
      preview: (
        <PdxRichTextEditor showToolbar={false} defaultValue="<p>Preview</p>" />
      ),
      scale: 0.55,
    },
    {
      id: 'rating',
      name: 'Rating',
      preview: <PdxRating size="Medium" defaultValue={3} />,
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxRating
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          defaultValue={3}
        />
      ),
    },
    {
      id: 'color-picker',
      name: 'ColorPicker',
      preview: (
        <PdxColorPicker
          size="Medium"
          defaultValue="#7c3aed"
          showTextInput={false}
        />
      ),
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxColorPicker
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          defaultValue="#7c3aed"
          showTextInput={false}
        />
      ),
    },
    {
      id: 'slider',
      name: 'Slider',
      preview: <PdxSlider size="Medium" defaultValue={48} />,
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxSlider
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          defaultValue={48}
        />
      ),
    },
    {
      id: 'range',
      name: 'Range',
      preview: <PdxRange defaultValue={{ min: 20, max: 70 }} />,
      scale: 0.65,
    },
  ],
};
