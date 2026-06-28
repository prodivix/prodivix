import { decodeDataUrlToBytes } from './exportBinary';

export { decodeDataUrlToBytes } from './exportBinary';

export type ZipExportFile = {
  path: string;
  content: string;
  binaryContent?: Uint8Array;
  binaryDataUrl?: string;
};

export const resolveZipFilePayload = (
  file: ZipExportFile
): string | Uint8Array => {
  const bytes = file.binaryDataUrl
    ? decodeDataUrlToBytes(file.binaryDataUrl)
    : null;
  return file.binaryContent ?? bytes ?? file.content;
};
