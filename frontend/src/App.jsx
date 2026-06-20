import { useState } from 'react';
import OverviewBar from './components/OverviewBar';
import BlockExplorer from './views/BlockExplorer';
import CustodyTracker from './views/CustodyTracker';
import MiningMonitor from './views/MiningMonitor';
import TransactionForm from './views/TransactionForm';

const ROLES = {
  auditor: { label: 'Auditor', tabs: ['explorer', 'custody'] },
  operador: { label: 'Operador', tabs: ['transactions'] },
  monitor: { label: 'Monitor', tabs: ['mining'] },
};

const TAB_LABELS = {
  explorer: 'Block Explorer',
  custody: 'Custody Tracker',
  mining: 'Mining Monitor',
  transactions: 'New Transfer',
};

const TAB_VIEWS = {
  explorer: BlockExplorer,
  custody: CustodyTracker,
  mining: MiningMonitor,
  transactions: TransactionForm,
};

export default function App() {
  const [role, setRole] = useState('auditor');
  const [tab, setTab] = useState('explorer');

  const availableTabs = ROLES[role].tabs;
  const activeTab = availableTabs.includes(tab) ? tab : availableTabs[0];
  const ActiveView = TAB_VIEWS[activeTab];

  return (
    <div className="min-h-screen bg-chalk">
      <header className="border-b border-stone px-8 py-6 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Custody Chain</h1>
          <p className="font-serif italic text-slate text-sm mt-1">Distributed Blockchain Registry</p>
        </div>
        <div className="flex gap-1 text-sm">
          {Object.entries(ROLES).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => { setRole(key); setTab(ROLES[key].tabs[0]); }}
              className={`px-3 py-1.5 rounded-sm transition-colors ${
                role === key ? 'bg-graphite text-chalk' : 'text-slate hover:text-graphite'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <OverviewBar />

      <nav className="px-8 pt-4 flex gap-6 border-b border-stone">
        {availableTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-3 text-sm transition-colors border-b-2 ${
              activeTab === t
                ? 'border-assayers-gold text-graphite font-medium'
                : 'border-transparent text-slate hover:text-graphite'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>

      <main className="px-8 py-8">
        <ActiveView />
      </main>
    </div>
  );
}
