import { BarChart3, BookOpen, CalendarDays, Home, Salad, Settings } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { t } from "../lib/i18n";
import { useGymStore } from "../store/useGymStore";
import { Brand } from "./Brand";

const navItems = [
  { to: "/", icon: Home, key: "today" as const, end: true },
  { to: "/routines", icon: CalendarDays, key: "routines" as const },
  { to: "/catalog", icon: BookOpen, key: "library" as const },
  { to: "/nutrition", icon: Salad, key: "nutrition" as const },
  { to: "/progress", icon: BarChart3, key: "progress" as const }
];

export function AppShell() {
  const profile = useGymStore((state) => state.profile);
  const locale = profile?.locale ?? "vi";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav className="sidebar__nav" aria-label="Main navigation">
          {navItems.map(({ to, icon: Icon, key, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? "nav-item nav-item--active" : "nav-item"}>
              <Icon size={20} />
              <span>{t(locale, key)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <NavLink to="/settings" className={({ isActive }) => isActive ? "nav-item nav-item--active" : "nav-item"}>
            <Settings size={20} /><span>{t(locale, "settings")}</span>
          </NavLink>
          <p><span className="status-dot" /> {t(locale, "localOnly")}</p>
        </div>
      </aside>

      <div className="app-column">
        <header className="mobile-header">
          <Brand compact />
          <NavLink className="icon-button" to="/settings" aria-label={t(locale, "settings")}><Settings size={20} /></NavLink>
        </header>
        <main className="app-main"><Outlet /></main>
        <nav className="bottom-nav" aria-label="Main navigation">
          {navItems.map(({ to, icon: Icon, key, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? "bottom-nav__item bottom-nav__item--active" : "bottom-nav__item"}>
              <Icon size={20} />
              <span>{t(locale, key)}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
