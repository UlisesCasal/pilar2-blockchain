import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';

function MetricCard({ label, value, detail, stripe, delay }) {
  return (
    <div
      className="bg-white rounded-lg shadow-card overflow-hidden transition-lift animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`h-1 ${stripe}`} />
      <div className="px-5 py-4">
        <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">{label}</span>
        <p className="font-serif text-3xl mt-1">{value}</p>
        <p className="text-[11px] text-slate mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

function StatusRow({ label, value, detail, variant }) {
  const colors = {
    gold: 'text-assayers-gold',
    malachite: 'text-malachite',
    garnet: 'text-garnet',
    slate: 'text-slate',
  };
  const dots = {
    gold: 'bg-assayers-gold',
    malachite: 'bg-malachite',
    garnet: 'bg-garnet',
    slate: 'bg-slate/50',
  };
  return (
    <div className="flex items-center justify-between py-3 border-b border-stone/60 last:border-0">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${dots[variant] || 'bg-slate/50'}`} />
        <span className="text-sm font-medium">{label}</span>
        {detail && <span className="font-mono text-xs text-slate ml-1">{detail}</span>}
      </div>
      <span className={`font-serif italic text-sm ${colors[variant] || 'text-slate'}`}>{value}</span>
    </div>
  );
}

export default function MiningMonitor() {
  const { data: status } = usePolling(api.getStatus);
  const { data: pool } = usePolling(api.getPoolStatus);
  const { data: scale } = usePolling(api.getScaleStatus);
  const { data: rabbit } = usePolling(api.getRabbitStatus);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-slate/10 flex items-center justify-center">
          <span className="text-slate text-sm">⚡</span>
        </div>
        <div>
          <h2 className="font-serif text-2xl">Monitor de Minería</h2>
          <p className="font-serif italic text-slate text-sm">Vista en tiempo real de la infraestructura de minado distribuido</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Workers"
          value={scale ? (scale.gpu_workers + scale.cpu_workers) : '—'}
          detail={scale ? `${scale.gpu_workers} GPU · ${scale.cpu_workers} CPU` : 'conectando...'}
          stripe="bg-assayers-gold"
          delay={0}
        />
        <MetricCard
          label="Pendientes"
          value={pool?.pending ?? '—'}
          detail="en el pool de transacciones"
          stripe="bg-malachite"
          delay={80}
        />
        <MetricCard
          label="Cola de Tareas"
          value={rabbit?.queue_depth ?? '—'}
          detail="mensajes en cola de minado"
          stripe="bg-slate"
          delay={160}
        />
        <MetricCard
          label="Dificultad"
          value="0000"
          detail="prefijo de 4 caracteres"
          stripe="bg-graphite"
          delay={240}
        />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="animate-fade-up" style={{ animationDelay: '100ms' }}>
          <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Clúster de Coordinadores</span>
          <div className="mt-3 bg-white rounded-lg shadow-card px-5 py-2">
            <StatusRow
              label="Este nodo"
              value={status?.role === 'leader' ? 'líder' : status?.role ?? 'desconocido'}
              variant={status?.role === 'leader' ? 'gold' : 'slate'}
              detail={`cadena: ${status?.chain_length ?? '—'} bloques`}
            />
          </div>
          <p className="text-[11px] text-slate mt-2 font-serif italic">
            {status?.role === 'leader'
              ? 'Este coordinador ganó la elección Bully y procesa resultados de minado'
              : 'En espera — asumirá el liderazgo si el líder falla'}
          </p>
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '200ms' }}>
          <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Auto-Escalado</span>
          <div className="mt-3 bg-white rounded-lg shadow-card px-5 py-2">
            <StatusRow
              label="Escalado necesario"
              value={scale?.scale_needed ? 'sí' : 'no'}
              variant={scale?.scale_needed ? 'garnet' : 'malachite'}
            />
            <StatusRow
              label="Última solicitud"
              value={scale?.last_scale_request ? new Date(scale.last_scale_request).toLocaleTimeString('es-AR') : 'ninguna'}
              variant="slate"
            />
          </div>
        </div>
      </div>

      <div className="mt-8 animate-fade-up" style={{ animationDelay: '300ms' }}>
        <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Cola de Mensajes Fallidos</span>
        <div className="mt-3 bg-white rounded-lg shadow-card px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-malachite" />
            <p className="font-serif italic text-sm text-malachite">Sin fallas registradas</p>
          </div>
          <p className="text-[11px] text-slate mt-1 font-serif italic">Los resultados de minado fallidos se redirigen aquí vía intercambio DLX tras 4 reintentos con backoff exponencial</p>
        </div>
      </div>
    </div>
  );
}
