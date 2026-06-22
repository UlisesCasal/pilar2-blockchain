import { useState } from 'react';
import { Pickaxe, Search, Radio, Gem, Route, Zap, Hexagon, Link } from 'lucide-react';
import OverviewBar from './components/OverviewBar';
import BlockExplorer from './views/BlockExplorer';
import CustodyTracker from './views/CustodyTracker';
import MiningMonitor from './views/MiningMonitor';
import TransactionForm from './views/TransactionForm';

const ROLES = {
  operador: {
    label: 'Operador',
    icon: Pickaxe,
    description: 'Registrar transferencias de custodia',
    accent: 'mineral',
    tabs: ['transactions', 'custody'],
  },
  auditor: {
    label: 'Auditor',
    icon: Search,
    description: 'Inspeccionar la cadena y trazabilidad',
    accent: 'verified',
    tabs: ['explorer', 'custody'],
  },
  monitor: {
    label: 'Monitor',
    icon: Radio,
    description: 'Observar infraestructura de minería',
    accent: 'crude',
    tabs: ['mining', 'explorer'],
  },
};

const ACCENT_STYLES = {
  mineral: {
    text: 'text-mineral',
    bg: 'bg-mineral',
    dim: 'bg-mineral-dim',
    border: 'border-mineral',
    shadow: 'shadow-glow-mineral',
    dot: 'bg-mineral',
  },
  verified: {
    text: 'text-verified',
    bg: 'bg-verified',
    dim: 'bg-verified-dim',
    border: 'border-verified',
    shadow: 'shadow-glow-verified',
    dot: 'bg-verified',
  },
  crude: {
    text: 'text-crude',
    bg: 'bg-crude',
    dim: 'bg-crude-dim',
    border: 'border-crude',
    shadow: 'shadow-glow-crude',
    dot: 'bg-crude',
  },
};

const TAB_CONFIG = {
  explorer: { label: 'Explorador', icon: Gem },
  custody: { label: 'Trazabilidad', icon: Route },
  mining: { label: 'Minería', icon: Zap },
  transactions: { label: 'Nueva Transferencia', icon: Hexagon },
};

const TAB_VIEWS = {
  explorer: BlockExplorer,
  custody: CustodyTracker,
  mining: MiningMonitor,
  transactions: TransactionForm,
};

export default function App() {
  const [role, setRole] = useState('operador');
  const [tab, setTab] = useState('transactions');

  const currentRole = ROLES[role];
  const availableTabs = currentRole.tabs;
  const activeTab = availableTabs.includes(tab) ? tab : availableTabs[0];
  const ActiveView = TAB_VIEWS[activeTab];
  const accent = ACCENT_STYLES[currentRole.accent];

  return (
    <div className="flex min-h-screen bg-base font-sans text-text-primary">
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>

      {/* ── Sidebar ── */}
      <aside
        role="navigation"
        className="w-64 glass flex-shrink-0 flex flex-col border-r border-white/[0.06]"
      >
        {/* Brand */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2">
            <Link className="w-4.5 h-4.5 text-mineral" strokeWidth={2} aria-hidden="true" />
            <h1 className="font-display font-bold text-lg text-text-primary tracking-tight">
              Custody Chain
            </h1>
          </div>
          <p className="text-[11px] text-text-muted mt-1 pl-[26px]">
            Blockchain de custodia distribuida
          </p>
        </div>

        {/* Role selector */}
        <div className="px-3 mb-5">
          <span className="px-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
            Rol activo
          </span>
          <div className="mt-2 space-y-1">
            {Object.entries(ROLES).map(([key, r]) => {
              const isActive = role === key;
              const styles = ACCENT_STYLES[r.accent];
              const RoleIcon = r.icon;
              return (
                <button
                  key={key}
                  onClick={() => { setRole(key); setTab(ROLES[key].tabs[0]); }}
                  className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-premium active:scale-[0.97] cursor-pointer ${
                    isActive
                      ? `${styles.dim} ${styles.text} font-medium ${styles.shadow} ring-1 ring-white/[0.06] shadow-inner-highlight`
                      : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.04] ring-1 ring-transparent'
                  }`}
                >
                  <RoleIcon
                    className={`w-4 h-4 flex-shrink-0 transition-colors duration-200 ${
                      isActive ? styles.text : 'text-text-muted group-hover:text-text-secondary'
                    }`}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="leading-tight">{r.label}</p>
                    <p className={`text-[10px] leading-tight mt-0.5 ${
                      isActive ? 'opacity-70' : 'text-text-muted'
                    }`}>
                      {r.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Navigation */}
        <div className="px-3 flex-1">
          <span className="px-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
            Navegación
          </span>
          <nav aria-label="Main navigation" className="mt-2 space-y-0.5">
            {availableTabs.map((t) => {
              const TabIcon = TAB_CONFIG[t].icon;
              const isActiveTab = activeTab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-premium active:scale-[0.97] cursor-pointer ${
                    isActiveTab
                      ? `bg-white/[0.06] ${accent.text} font-medium border-l-2 ${accent.border} shadow-inner-highlight`
                      : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.04] border-l-2 border-transparent'
                  }`}
                >
                  <TabIcon
                    className={`w-3.5 h-3.5 flex-shrink-0 ${isActiveTab ? accent.text : ''}`}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  {TAB_CONFIG[t].label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Status footer */}
        <div className="px-5 py-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-verified animate-pulse-slow" />
            <span className="text-[10px] text-text-muted uppercase tracking-widest">
              Sistema activo
            </span>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main id="main-content" role="main" className="flex-1 overflow-y-auto bg-base">
        <OverviewBar role={role} />
        <div className="px-6 pt-4 pb-8 max-w-[1400px]">
          <div key={activeTab} className="animate-fade-up">
            <ActiveView />
          </div>
        </div>
      </main>
    </div>
  );
}
