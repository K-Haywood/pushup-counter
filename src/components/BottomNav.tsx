import type { AppTab } from '../types/app';

interface BottomNavProps {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
}

const ITEMS: Array<{ key: AppTab; label: string }> = [
  { key: 'camera', label: 'Session' },
  { key: 'history', label: 'Progress' },
  { key: 'settings', label: 'Settings' }
];

export function BottomNav({ activeTab, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={activeTab === item.key ? 'nav-button is-active' : 'nav-button'}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
