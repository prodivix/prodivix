export type ZipExportFile = {
  path: string;
  content: string;
  binaryContent?: Uint8Array;
};

export const resolveZipFilePayload = (
  file: ZipExportFile
): string | Uint8Array => file.binaryContent ?? file.content;
