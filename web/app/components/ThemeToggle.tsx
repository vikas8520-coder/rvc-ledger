'use client';

import { useTheme } from './ThemeProvider';
import { SunIcon, MoonIcon } from './Icons';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors"
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-label="Toggle theme"
    >
      {theme === 'light' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
    </button>
  );
}
