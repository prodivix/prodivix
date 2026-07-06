type ExternalRuntimeMeta = {
  libraryId: string;
  runtimeType: string;
  defaultProps?: Record<string, unknown>;
  propOptions?: Record<string, string[]>;
};

const runtimeMetaByType = new Map<string, ExternalRuntimeMeta>();

export const setExternalRuntimeMeta = (
  runtimeType: string,
  meta: ExternalRuntimeMeta
) => {
  runtimeMetaByType.set(runtimeType, meta);
};

export const getExternalRuntimeMetaByType = (runtimeType: string) =>
  runtimeMetaByType.get(runtimeType);

export const resetExternalRuntimeMetaStore = () => {
  runtimeMetaByType.clear();
};
