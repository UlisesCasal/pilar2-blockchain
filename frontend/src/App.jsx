import { useState } from 'react';

const ROLES = ['auditor', 'operador', 'monitor'];

export default function App() {
  const [role, setRole] = useState('auditor');
  const [tab, setTab] = useState('explorer');

  return (
    <div className="min-h-screen bg-chalk">
      <header className="border-b border-stone px-8 py-6 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Custody Chain</h1>
          <p className="font-serif italic text-slate text-sm mt-1">Distributed Blockchain Registry</p>
        </div>
        <div className="flex gap-1 text-sm">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`px-3 py-1.5 rounded-sm capitalize transition-colors ${
                role === r
                  ? 'bg-graphite text-chalk'
                  : 'text-slate hover:text-graphite'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </header>
      <main className="px-8 py-6">
        <p className="text-slate font-serif italic">Role: {role} — views coming next</p>
      </main>
    </div>
  );
}
