type CanvasPlaceholderProps = {
  title: string;
  description: string;
};

export function CanvasPlaceholder({
  title,
  description,
}: CanvasPlaceholderProps) {
  return (
    <div className="BlueprintEditorCanvasPlaceholder relative z-1 flex h-full flex-col items-center justify-center gap-1.5 p-10 text-center text-(--text-muted)">
      <h3 className="m-0 text-base text-(--text-primary)">{title}</h3>
      <p className="m-0 max-w-80 text-xs">{description}</p>
    </div>
  );
}
