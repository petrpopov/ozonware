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
    <div className="page">
      <header className="header">
        <div className="header-top">
          <div>
            <h1>Складской учет</h1>
            <p>Управление товарами, операциями и остатками.</p>
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label="Переключить тему"
            title="Переключить тему"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            <span>{theme === 'dark' ? 'Светлая' : 'Темная'} тема</span>
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Разделы">
        {tabs.map(([slug, label]) => (
          <NavLink
            key={slug}
            to={`/${slug}`}
            className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
