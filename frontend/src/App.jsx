import { useState } from 'react';
import OverviewBar from './components/OverviewBar';
import BlockExplorer from './views/BlockExplorer';
import CustodyTracker from './views/CustodyTracker';
import MiningMonitor from './views/MiningMonitor';
import TransactionForm from './views/TransactionForm';

const ROLES = {
  operador: {
    label: 'Operador',
    icon: '⛏',
    description: 'Registrar transferencias de custodia',
    accent: 'assayers-gold',
    tabs: ['transactions', 'custody'],
  },
  auditor: {
    label: 'Auditor',
    icon: '🔍',
    description: 'Inspeccionar la cadena y trazabilidad',
    accent: 'malachite',
    tabs: ['explorer', 'custody'],
  },
  monitor: {
    label: 'Monitor',
    icon: '📡',
    description: 'Observar infraestructura de minería',
    accent: 'slate',
    tabs: ['mining', 'explorer'],
  },
};

const ACCENT_STYLES = {
  'assayers-gold': {
    navActive: 'bg-assayers-gold/20 text-assayers-gold font-medium',
    roleBorder: 'border-assayers-gold',
  },
  malachite: {
    navActive: 'bg-malachite/20 text-malachite font-medium',
    roleBorder: 'border-malachite',
  },
  slate: {
    navActive: 'bg-slate/20 text-white font-medium',
    roleBorder: 'border-slate',
  },
};

const TAB_CONFIG = {
  explorer: { label: 'Explorador', icon: '◆' },
  custody: { label: 'Trazabilidad', icon: '⟐' },
  mining: { label: 'Minería', icon: '⚡' },
  transactions: { label: 'Nueva Transferencia', icon: '⬡' },
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
  const accentStyles = ACCENT_STYLES[currentRole.accent];

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-graphite flex-shrink-0 flex flex-col text-white/80">
        <div className="px-5 pt-6 pb-4">
          <h1 className="font-serif text-xl text-white tracking-tight">Custody Chain</h1>
          <p className="text-[11px] text-white/40 mt-0.5">Blockchain de custodia distribuida</p>
        </div>

        <div className="px-3 mb-4">
          <span className="px-2 text-[10px] font-semibold uppercase tracking-widest text-white/30">Rol activo</span>
          <div className="mt-2 space-y-1">
            {Object.entries(ROLES).map(([key, r]) => {
              const isActive = role === key;
              const styles = ACCENT_STYLES[r.accent];
              return (
                <button
                  key={key}
                  onClick={() => { setRole(key); setTab(ROLES[key].tabs[0]); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left text-sm transition-all ${
                    isActive
                      ? `bg-white/10 text-white border-l-2 ${styles.roleBorder}`
                      : 'text-white/50 hover:text-white/70 hover:bg-white/5 border-l-2 border-transparent'
                  }`}
                >
                  <span className="text-base">{r.icon}</span>
                  <div>
                    <p className="font-medium leading-tight">{r.label}</p>
                    <p className="text-[10px] text-white/40 leading-tight">{r.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-3 flex-1">
          <span className="px-2 text-[10px] font-semibold uppercase tracking-widest text-white/30">Navegación</span>
          <nav className="mt-2 space-y-0.5">
            {availableTabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all ${
                  activeTab === t
                    ? accentStyles.navActive
                    : 'text-white/50 hover:text-white/70 hover:bg-white/5'
                }`}
              >
                <span className="text-xs">{TAB_CONFIG[t].icon}</span>
                {TAB_CONFIG[t].label}
              </button>
            ))}
          </nav>
        </div>

        <div className="px-5 py-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-malachite animate-pulse" />
            <span className="text-[10px] text-white/40 uppercase tracking-widest">Sistema activo</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-chalk">
        <OverviewBar role={role} />
        <div className="p-8 max-w-[1200px]">
          <div key={activeTab} className="animate-fade-up">
            <ActiveView />
          </div>
        </div>
      </main>
    </div>
  );
}
