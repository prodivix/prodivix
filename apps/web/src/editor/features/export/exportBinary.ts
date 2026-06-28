export const decodeDataUrlToBytes = (dataUrl: string): Uint8Array | null => {
  if (!dataUrl.startsWith('data:')) return null;
  const separatorIndex = dataUrl.indexOf(',');
  if (separatorIndex < 0) return null;
  const metadata = dataUrl.slice(5, separatorIndex);
  const payload = dataUrl.slice(separatorIndex + 1);
  if (/;base64/i.test(metadata)) {
    if (typeof globalThis.atob !== 'function') return null;
    let binary = '';
    try {
      binary = globalThis.atob(payload);
    } catch {
      return null;
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  let decoded = '';
  try {
    decoded = decodeURIComponent(payload);
  } catch {
    return null;
  }
  return new TextEncoder().encode(decoded);
};
