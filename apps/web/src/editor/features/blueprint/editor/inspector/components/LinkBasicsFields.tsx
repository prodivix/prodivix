import {
  LinkTargetBlankIcon,
  LinkTargetFieldIcon,
  LinkTargetSelfIcon,
} from '@/assets/icons';
import { IconButtonGroup } from './IconButtonGroup';
import { InspectorIconFieldRow, InspectorRow } from './InspectorRow';

type LinkBasicsFieldsProps = {
  destination: string;
  target: '_self' | '_blank';
  rel: string;
  title: string;
  onChangeDestination: (value: string) => void;
  onChangeTarget: (value: '_self' | '_blank') => void;
  onChangeRel: (value: string) => void;
  onChangeTitle: (value: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
};

export function LinkBasicsFields({
  destination,
  target,
  rel,
  title,
  onChangeDestination,
  onChangeTarget,
  onChangeRel,
  onChangeTitle,
  t,
}: LinkBasicsFieldsProps) {
  return (
    <>
      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorRow
          label={t('inspector.fields.link.destination', {
            defaultValue: 'Destination',
          })}
          control={
            <input
              className="h-7 w-full min-w-0 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary) outline-none placeholder:text-(--text-muted)"
              value={destination}
              onChange={(event) => onChangeDestination(event.target.value)}
              placeholder={t('inspector.fields.link.destinationPlaceholder', {
                defaultValue: '/path or https://example.com',
              })}
            />
          }
        />
      </div>
      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorIconFieldRow
          label={t('inspector.fields.link.target', {
            defaultValue: 'Target',
          })}
          icon={<LinkTargetFieldIcon />}
          control={
            <IconButtonGroup<'_self' | '_blank'>
              value={target}
              density="dense"
              layout="horizontal"
              columns={2}
              options={[
                {
                  value: '_self',
                  label: '_self',
                  icon: <LinkTargetSelfIcon />,
                },
                {
                  value: '_blank',
                  label: '_blank',
                  icon: <LinkTargetBlankIcon />,
                },
              ]}
              onChange={onChangeTarget}
            />
          }
        />
      </div>
      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorRow
          label={t('inspector.fields.link.rel', {
            defaultValue: 'Rel',
          })}
          control={
            <input
              className="h-7 w-full min-w-0 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary) outline-none placeholder:text-(--text-muted)"
              value={rel}
              onChange={(event) => onChangeRel(event.target.value)}
              placeholder={t('inspector.fields.link.relPlaceholder', {
                defaultValue: 'noopener noreferrer',
              })}
            />
          }
        />
      </div>
      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorRow
          label={t('inspector.fields.link.title', {
            defaultValue: 'Title',
          })}
          control={
            <input
              className="h-7 w-full min-w-0 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary) outline-none placeholder:text-(--text-muted)"
              value={title}
              onChange={(event) => onChangeTitle(event.target.value)}
              placeholder={t('inspector.fields.link.titlePlaceholder', {
                defaultValue: 'Open docs',
              })}
            />
          }
        />
      </div>
    </>
  );
}
