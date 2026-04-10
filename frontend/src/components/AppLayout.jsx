import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { MoonIcon, SunIcon } from './Icons.jsx';

const tabs = [
  ['products', 'Товары'],
  ['receipt', 'Приход'],
  ['shipment', 'Отгрузка'],
  ['writeoff', 'Списания'],
  ['inventory', 'Инвентаризация'],
  ['reports', 'Отчеты'],
  ['settings', 'Настройки']
];

function getInitialTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function AppLayout() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <>
      <header className="app-header">
        <div className="app-header-brand">Складской учёт</div>
        <nav className="app-nav" aria-label="Разделы">
          {tabs.map(([slug, label]) => (
            <NavLink
              key={slug}
              to={`/${slug}`}
              className={({ isActive }) => (isActive ? 'app-nav-item active' : 'app-nav-item')}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          className="app-theme-btn"
          onClick={toggleTheme}
          aria-label="Переключить тему"
          title="Переключить тему"
        >
          {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
        </button>
      </header>

      <div className="page">
        <main className="content">
          <Outlet />
        </main>
      </div>
    </>
  );
}
