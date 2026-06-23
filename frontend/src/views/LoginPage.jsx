import { useState, useEffect } from 'react';
import { Link } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [entities, setEntities] = useState([]);
  const [entity, setEntity] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getEntities().then(setEntities).catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(entity, password);
    } catch (err) {
      setError(err.message || 'Error al iniciar sesion');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-base">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="glass rounded-lg border border-border-subtle shadow-card px-6 py-8">
          {/* Branding */}
          <div className="flex items-center gap-2 mb-1">
            <Link className="w-5 h-5 text-mineral" strokeWidth={2} aria-hidden="true" />
            <h1 className="font-display font-bold text-xl text-text-primary tracking-tight">
              Custody Chain
            </h1>
          </div>
          <p className="text-xs text-text-muted mb-8 pl-7">
            Blockchain de custodia distribuida
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Entity dropdown */}
            <div>
              <label htmlFor="login-entity" className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">
                Entidad
              </label>
              <select
                id="login-entity"
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                className="w-full bg-base border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary font-mono focus:border-mineral focus:outline-none"
                required
              >
                <option value="">Seleccionar entidad...</option>
                {entities.map((ent) => (
                  <option key={ent.name || ent} value={ent.name || ent}>
                    {ent.display_name || ent.name || ent}
                  </option>
                ))}
              </select>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresa tu password"
                className="w-full bg-base border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary font-mono placeholder:text-text-muted/40 focus:border-mineral focus:outline-none"
                required
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !entity || !password}
              className="w-full py-2.5 rounded-lg text-sm font-semibold bg-mineral text-base cursor-pointer hover:brightness-110 active:scale-[0.97] shadow-card transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          {/* Error */}
          {error && (
            <div className="mt-4 bg-anomaly-dim border border-anomaly/20 rounded-lg px-4 py-3 animate-fade-up">
              <p className="text-anomaly text-sm">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
