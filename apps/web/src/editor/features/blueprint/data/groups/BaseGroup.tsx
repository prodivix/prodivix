import {
  PdxButton,
  PdxButtonLink,
  PdxHeading,
  PdxIcon,
  PdxIconLink,
  PdxLink,
  PdxParagraph,
  PdxText,
} from '@prodivix/ui';
import { Sparkles } from 'lucide-react';
import type { ComponentGroup } from '@/editor/features/blueprint/editor/model/types';
import { buildVariants } from '@/editor/features/blueprint/data/helpers';
import {
  BUTTON_CATEGORIES,
  BUTTON_SIZE_OPTIONS,
  HEADING_LEVELS,
  SIZE_OPTIONS,
  TEXT_SIZE_OPTIONS,
} from '@/editor/features/blueprint/data/options';

export const BASE_GROUP: ComponentGroup = {
  id: 'base',
  title: '基础组件',
  items: [
    {
      id: 'text',
      name: 'Text',
      preview: <PdxText size="Medium">Text</PdxText>,
      sizeOptions: TEXT_SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxText
          size={
            (size ?? 'Medium') as 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Big'
          }
        >
          Text
        </PdxText>
      ),
    },
    {
      id: 'heading',
      name: 'Heading',
      preview: <PdxHeading level={2}>Heading</PdxHeading>,
      variants: buildVariants(
        HEADING_LEVELS,
        (level) => <PdxHeading level={level}>H{level}</PdxHeading>,
        (level) => `H${level}`,
        undefined,
        undefined,
        (level) => ({ level })
      ),
    },
    {
      id: 'paragraph',
      name: 'Paragraph',
      preview: <PdxParagraph size="Medium">Paragraph</PdxParagraph>,
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxParagraph size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}>
          Paragraph
        </PdxParagraph>
      ),
    },
    {
      id: 'button',
      name: 'Button',
      preview: <PdxButton text="Button" size="Medium" category="Primary" />,
      sizeOptions: BUTTON_SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxButton
          text="Button"
          size={(size ?? 'Medium') as 'Tiny' | 'Small' | 'Medium' | 'Big'}
          category="Primary"
        />
      ),
      variants: buildVariants(
        BUTTON_CATEGORIES,
        (category) => (
          <PdxButton text={category} size="Medium" category={category} />
        ),
        undefined,
        undefined,
        (category, { size }) => (
          <PdxButton
            text={category}
            size={(size ?? 'Medium') as 'Tiny' | 'Small' | 'Medium' | 'Big'}
            category={category}
          />
        ),
        (category) => ({ category })
      ),
    },
    {
      id: 'button-link',
      name: 'ButtonLink',
      preview: (
        <PdxButtonLink
          text="Link"
          to="/blueprint"
          size="Medium"
          category="Secondary"
        />
      ),
      sizeOptions: BUTTON_SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxButtonLink
          text="Link"
          to="/blueprint"
          size={(size ?? 'Medium') as 'Tiny' | 'Small' | 'Medium' | 'Big'}
          category="Secondary"
        />
      ),
      variants: buildVariants(
        BUTTON_CATEGORIES,
        (category) => (
          <PdxButtonLink
            text={category}
            to="/blueprint"
            size="Medium"
            category={category}
          />
        ),
        undefined,
        undefined,
        (category, { size }) => (
          <PdxButtonLink
            text={category}
            to="/blueprint"
            size={(size ?? 'Medium') as 'Tiny' | 'Small' | 'Medium' | 'Big'}
            category={category}
          />
        ),
        (category) => ({ category })
      ),
    },
    {
      id: 'icon',
      name: 'Icon',
      preview: <PdxIcon icon={Sparkles} size={20} />,
      variants: buildVariants(
        [12, 16, 20, 24] as const,
        (size) => <PdxIcon icon={Sparkles} size={size} />,
        (size) => `${size}px`,
        undefined,
        undefined,
        (size) => ({ size })
      ),
    },
    {
      id: 'icon-link',
      name: 'IconLink',
      preview: <PdxIconLink icon={Sparkles} to="/blueprint" size={18} />,
      variants: buildVariants(
        [14, 18, 22] as const,
        (size) => <PdxIconLink icon={Sparkles} to="/blueprint" size={size} />,
        (size) => `${size}px`,
        undefined,
        undefined,
        (size) => ({ size })
      ),
    },
    {
      id: 'link',
      name: 'Link',
      preview: <PdxLink to="/blueprint" text="Link" />,
    },
  ],
};
