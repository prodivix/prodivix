import { useTranslation } from 'react-i18next';
import { Info, Paintbrush, Database, Code2 } from 'lucide-react';
import type { InspectorTab } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';

type InspectorTabBarProps = {
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
};

const TAB_CONFIG: Array<{
  key: InspectorTab;
  icon: React.ComponentType<{ size: number }>;
  labelKey: string;
  defaultLabel: string;
}> = [
  {
    key: 'basic',
    icon: Info,
    labelKey: 'inspector.tabs.basic',
    defaultLabel: '基础信息',
  },
  {
    key: 'style',
    icon: Paintbrush,
    labelKey: 'inspector.tabs.style',
    defaultLabel: '样式',
  },
  {
    key: 'data',
    icon: Database,
    labelKey: 'inspector.tabs.data',
    defaultLabel: '数据',
  },
  {
    key: 'code',
    icon: Code2,
    labelKey: 'inspector.tabs.code',
    defaultLabel: '代码',
  },
];

export function InspectorTabBar({
  activeTab,
  onTabChange,
}: InspectorTabBarProps) {
  const { t } = useTranslation('blueprint');

  return (
    <nav className="InspectorTabBar flex border-b border-(--border-subtle)">
      {TAB_CONFIG.map(({ key, icon: Icon, labelKey, defaultLabel }) => {
        const label = t(labelKey, { defaultValue: defaultLabel });
        return (
          <button
            key={key}
            type="button"
            className={`inline-flex flex-1 items-center justify-center border-0 bg-transparent py-2 transition-colors ${
              activeTab === key
                ? 'text-(--text-primary)'
                : 'text-(--text-muted) hover:text-(--text-secondary)'
            }`}
            onClick={() => onTabChange(key)}
            data-testid={`inspector-tab-${key}`}
            title={label}
            aria-label={label}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </nav>
  );
}
