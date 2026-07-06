import type { RouteCanvasDiagnostic } from './canvasTypes';

type CanvasRouteDiagnosticsProps = {
  diagnostics: RouteCanvasDiagnostic[];
};

export function CanvasRouteDiagnostics({
  diagnostics,
}: CanvasRouteDiagnosticsProps) {
  if (!diagnostics.length) return null;

  return (
    <div className="pointer-events-none absolute top-3 right-3 z-10 flex max-w-96 flex-col gap-1 rounded-md border border-(--warning-color) bg-(--warning-subtle) p-2 text-[11px] text-(--text-primary) shadow-sm">
      {diagnostics.map((item) => (
        <p key={item.code} className="m-0 leading-4">
          {item.message}
        </p>
      ))}
    </div>
  );
}
