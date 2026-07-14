import { BlueprintEditor } from '../BlueprintEditor';

/** Explicit-document entry into the single canonical Blueprint editor UI. */
export const BlueprintAuthoringSurface = ({
  entryDocumentId,
  compactHeader = false,
}: {
  entryDocumentId: string;
  compactHeader?: boolean;
}) => (
  <BlueprintEditor
    entryDocumentId={entryDocumentId}
    compactHeader={compactHeader}
  />
);
