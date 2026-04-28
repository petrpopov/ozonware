import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  MoonIcon,
  SunIcon,
  BoxIcon,
  InboxIcon,
  TruckIcon,
  OutboxIcon,
  MinusIcon,
  ClipboardIcon,
  ChartIcon,
  GearIcon,
  BellIcon,
  HelpIcon,
  LibraryIcon,
} from './Icons.jsx';

const NAV = [
  { slug: 'products', label: 'Товары', Icon: BoxIcon },
  { slug: 'catalog', label: 'Справочник', Icon: LibraryIcon },
  { slug: 'receipt', label: 'Приход', Icon: InboxIcon },
  { slug: 'planned-supplies', label: 'Поставки', Icon: TruckIcon },
  { slug: 'shipment', label: 'Отгрузка', Icon: OutboxIcon },
  { slug: 'writeoff', label: 'Списания', Icon: MinusIcon },
  { slug: 'inventory', label: 'Инвентаризация', Icon: ClipboardIcon },
  { slug: 'reports', label: 'Отчёты', Icon: ChartIcon },
  { slug: 'settings', label: 'Настройки', Icon: GearIcon },
];

function getInitialTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function AppLayout() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-brand">
          <div className="brand-dot">oz</div>
          <div>ozonware</div>
        </div>
        <div className="topbar-crumbs">
          <span>Складской учёт</span>
        </div>
        <div className="topbar-actions">
          <button type="button" className="icon-btn" title="Помощь" aria-label="Помощь">
            <HelpIcon size={16} />
          </button>
          <button type="button" className="icon-btn bell-btn" title="Уведомления" aria-label="Уведомления">
            <BellIcon size={16} />
            <span className="bell-dot" />
          </button>
          <button
            type="button"
            className="icon-btn app-theme-btn"
            onClick={toggleTheme}
            title="Переключить тему"
            aria-label="Переключить тему"
          >
            {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          </button>
          <div className="avatar" title="Аккаунт">АК</div>
        </div>
      </header>

      <aside className="app-sidebar">
        <div className="sidebar-label">Склад</div>
        <nav className="app-nav" aria-label="Разделы">
          {NAV.map(({ slug, label, Icon }) => (
            <NavLink
              key={slug}
              to={`/${slug}`}
              className={({ isActive }) => (isActive ? 'app-nav-item active' : 'app-nav-item')}
            >
              <span className="app-nav-icon"><Icon size={16} /></span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="app-main">
        <div className="page">
          <div className="content">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
