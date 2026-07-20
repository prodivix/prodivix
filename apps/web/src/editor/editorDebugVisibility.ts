/**
 * Debug instrumentation is an explicit development surface. It must never
 * compete with product controls unless the current URL opts in with ?debug=1.
 */
export const isEditorDebugSurfaceEnabled = (
  search: string,
  development: boolean
): boolean => development && new URLSearchParams(search).get('debug') === '1';
