import {
  PdxAudio,
  PdxAvatar,
  PdxEmbed,
  PdxIframe,
  PdxImage,
  PdxImageGallery,
  PdxVideo,
} from '@prodivix/ui';
import type { ComponentGroup } from '@/editor/features/blueprint/editor/model/types';
import { buildVariants } from '@/editor/features/blueprint/data/helpers';
import {
  AVATAR_SIZE_OPTIONS,
  SIZE_OPTIONS,
} from '@/editor/features/blueprint/data/options';
import { GALLERY_IMAGES } from '@/editor/features/blueprint/data/sampleData';
import {
  EMBED_PLACEHOLDER_URL,
  PLACEHOLDER_AVATAR,
  PLACEHOLDER_IFRAME,
  PLACEHOLDER_IMAGE,
  PLACEHOLDER_VIDEO,
} from '@/editor/features/blueprint/data/placeholders';

export const MEDIA_GROUP: ComponentGroup = {
  id: 'media',
  title: '媒体与嵌入',
  items: [
    {
      id: 'image',
      name: 'Image',
      preview: <PdxImage src={PLACEHOLDER_IMAGE} alt="Preview" size="Medium" />,
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxImage
          src={PLACEHOLDER_IMAGE}
          alt="Preview"
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
        />
      ),
    },
    {
      id: 'avatar',
      name: 'Avatar',
      preview: <PdxAvatar src={PLACEHOLDER_AVATAR} size="Medium" />,
      sizeOptions: AVATAR_SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxAvatar
          src={PLACEHOLDER_AVATAR}
          size={
            (size ?? 'Medium') as
              'ExtraSmall' | 'Small' | 'Medium' | 'Large' | 'ExtraLarge'
          }
        />
      ),
    },
    {
      id: 'image-gallery',
      name: 'Gallery',
      preview: (
        <PdxImageGallery
          images={GALLERY_IMAGES}
          columns={2}
          gap="Small"
          size="Medium"
        />
      ),
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxImageGallery
          images={GALLERY_IMAGES}
          columns={2}
          gap="Small"
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
        />
      ),
      variants: buildVariants(
        ['Grid', 'List', 'Masonry'] as const,
        (layout) => (
          <PdxImageGallery
            images={GALLERY_IMAGES}
            columns={2}
            gap="Small"
            size="Medium"
            layout={layout}
          />
        )
      ),
      scale: 0.55,
    },
    {
      id: 'video',
      name: 'Video',
      preview: (
        <PdxVideo src="" poster={PLACEHOLDER_VIDEO} controls={false} muted />
      ),
      variants: buildVariants(
        ['16:9', '4:3', '1:1'] as const,
        (ratio) => (
          <PdxVideo
            src=""
            poster={PLACEHOLDER_VIDEO}
            controls={false}
            muted
            aspectRatio={ratio}
          />
        ),
        (ratio) => ratio
      ),
      scale: 0.6,
    },
    {
      id: 'audio',
      name: 'Audio',
      preview: <PdxAudio src="" controls />,
      scale: 0.6,
    },
    {
      id: 'iframe',
      name: 'Iframe',
      preview: (
        <PdxIframe
          src="about:blank"
          srcDoc={PLACEHOLDER_IFRAME}
          title="Preview"
        />
      ),
      variants: buildVariants(
        ['16:9', '4:3', '1:1'] as const,
        (ratio) => (
          <PdxIframe
            src="about:blank"
            srcDoc={PLACEHOLDER_IFRAME}
            title="Preview"
            aspectRatio={ratio}
          />
        ),
        (ratio) => ratio
      ),
      scale: 0.55,
    },
    {
      id: 'embed',
      name: 'Embed',
      preview: <PdxEmbed type="Custom" url={EMBED_PLACEHOLDER_URL} />,
      variants: buildVariants(
        ['16:9', '4:3', '1:1'] as const,
        (ratio) => (
          <PdxEmbed
            type="Custom"
            url={EMBED_PLACEHOLDER_URL}
            aspectRatio={ratio}
          />
        ),
        (ratio) => ratio
      ),
      scale: 0.55,
    },
  ],
};
