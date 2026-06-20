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
    description: 'Register custody transfers between entities',
    color: 'assayers-gold',
    bgColor: 'bg-gold-light',
    borderColor: 'border-assayers-gold',
    textColor: 'text-assayers-gold',
    tabs: ['transactions', 'custody'],
  },
  auditor: {
    label: 'Auditor',
    icon: '🔍',
    description: 'Inspect the blockchain and trace custody chains',
    color: 'malachite',
    bgColor: 'bg-malachite-light',
    borderColor: 'border-malachite',
    textColor: 'text-malachite',
    tabs: ['explorer', 'custody'],
  },
  monitor: {
    label: 'Monitor',
    icon: '📡',
    description: 'Observe mining infrastructure and system health',
    color: 'slate',
    bgColor: 'bg-slate-light',
    borderColor: 'border-slate',
    textColor: 'text-slate',
    tabs: ['mining', 'explorer'],
  },
};

const TAB_CONFIG = {
  explorer: { label: 'Block Explorer', icon: '◆' },
  custody: { label: 'Custody Tracker', icon: '⟐' },
  mining: { label: 'Mining Monitor', icon: '⚡' },
  transactions: { label: 'New Transfer', icon: '⬡' },
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

  return (
    <div className="min-h-screen bg-chalk">
      {/* Top accent bar */}
      <div className={`h-1 ${role === 'operador' ? 'bg-assayers-gold' : role === 'auditor' ? 'bg-malachite' : 'bg-slate'}`} />

      <header className="border-b border-stone">
        <div className="px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-serif text-2xl tracking-tight">Custody Chain</h1>
              <p className="text-xs text-slate mt-0.5">Distributed Blockchain Registry for Extractive Resources</p>
            </div>
          </div>

          {/* Role identity badge */}
          <div className={`flex items-center gap-3 px-4 py-2 rounded-sm ${currentRole.bgColor} border ${currentRole.borderColor}/30`}>
            <span className="text-lg">{currentRole.icon}</span>
            <div>
              <p className={`text-sm font-semibold ${currentRole.textColor}`}>{currentRole.label}</p>
              <p className="text-[11px] text-slate">{currentRole.description}</p>
            </div>
          </div>
        </div>

        {/* Role selector + tabs in one bar */}
        <div className="px-8 flex items-center justify-between border-t border-stone/60">
          <nav className="flex gap-1 py-2">
            {availableTabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-sm text-sm transition-all ${
                  activeTab === t
                    ? `${currentRole.bgColor} ${currentRole.textColor} font-medium`
                    : 'text-slate hover:text-graphite hover:bg-stone/50'
                }`}
              >
                <span className="text-xs">{TAB_CONFIG[t].icon}</span>
                {TAB_CONFIG[t].label}
              </button>
            ))}
          </nav>

          <div className="flex gap-1 py-2">
            {Object.entries(ROLES).map(([key, r]) => (
              <button
                key={key}
                onClick={() => { setRole(key); setTab(ROLES[key].tabs[0]); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs transition-all ${
                  role === key
                    ? `${r.bgColor} ${r.textColor} font-semibold border ${r.borderColor}/30`
                    : 'text-slate hover:text-graphite border border-transparent'
                }`}
              >
                <span>{r.icon}</span>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <OverviewBar role={role} />

      <main className="px-8 py-8">
        <ActiveView />
      </main>
    </div>
  );
}
