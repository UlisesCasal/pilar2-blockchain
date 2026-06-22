import { Zap } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import RingChart from '../components/RingChart';

export default function MiningMonitor() {
  const { data: status } = usePolling(api.getStatus);
  const { data: pool } = usePolling(api.getPoolStatus);
  const { data: scale } = usePolling(api.getScaleStatus);
  const { data: rabbit } = usePolling(api.getRabbitStatus);

  const gpuCount = scale?.gpu_workers ?? 0;
  const cpuCount = scale?.cpu_workers ?? 0;
  const poolPending = pool?.pending ?? 0;
  const poolThreshold = pool?.threshold ?? 10;
  const queueDepth = rabbit?.queue_depth ?? 0;
  const dlqCount = rabbit?.dlq_count ?? 0;
  const isLeader = status?.role === 'leader';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-crude-dim flex items-center justify-center">
          <Zap className="w-4 h-4 text-crude" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-sans text-2xl font-semibold text-text-primary">Monitor de Minería</h2>
          <p className="text-text-muted text-sm">Vista en tiempo real de la infraestructura de minado distribuido</p>
        </div>
      </div>

      {/* 2x2 Control Room Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ── Top-Left: Workers ── */}
        <div
          className="bg-surface border border-border-subtle rounded-lg overflow-hidden shadow-card transition-shadow duration-200 hover:shadow-card-hover animate-fade-up"
          style={{ animationDelay: '0ms' }}
        >
          <div className="h-[2px] bg-crude" />
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-crude" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Workers Activos
              </span>
            </div>

            {/* Worker dot grid */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Array.from({ length: gpuCount }).map((_, i) => (
                <div
                  key={`gpu-${i}`}
                  className="w-3 h-3 rounded-full bg-crude"
                  title="GPU Worker"
                />
              ))}
              {Array.from({ length: cpuCount }).map((_, i) => (
                <div
                  key={`cpu-${i}`}
                  className="w-3 h-3 rounded-full bg-mineral"
                  title="CPU Worker"
                />
              ))}
              {gpuCount + cpuCount === 0 && (
                <span className="text-xs text-text-muted">Sin workers conectados</span>
              )}
            </div>

            <p className="font-mono text-sm text-text-secondary">
              <span className="text-crude">{gpuCount}</span> GPU
              <span className="text-text-muted mx-1.5">·</span>
              <span className="text-mineral">{cpuCount}</span> CPU
            </p>
          </div>
        </div>

        {/* ── Top-Right: Pool & Queue ── */}
        <div
          className="bg-surface border border-border-subtle rounded-lg overflow-hidden shadow-card transition-shadow duration-200 hover:shadow-card-hover animate-fade-up"
          style={{ animationDelay: '80ms' }}
        >
          <div className="h-[2px] bg-pending" />
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-pending" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Pool y Cola
              </span>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <RingChart
                value={poolPending}
                max={poolThreshold}
                size={56}
                strokeWidth={5}
                color={poolPending / poolThreshold > 0.5 ? 'text-pending' : 'text-mineral'}
                showValue
              />
              <div>
                <p className="font-mono text-2xl font-bold text-text-primary leading-none">
                  {poolPending}
                  <span className="text-sm text-text-muted font-normal">/{poolThreshold}</span>
                </p>
                <p className="text-xs text-text-muted mt-1">transacciones pendientes</p>
              </div>
            </div>

            {/* Queue bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-muted">Cola de minado</span>
                <span className={`font-mono text-xs ${queueDepth > 5 ? 'text-anomaly' : 'text-mineral'}`}>
                  {queueDepth} msgs
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-bright overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    queueDepth > 5 ? 'bg-anomaly' : 'bg-mineral'
                  }`}
                  style={{ width: `${Math.min((queueDepth / 20) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom-Left: Coordinator ── */}
        <div
          className="bg-surface border border-border-subtle rounded-lg overflow-hidden shadow-card transition-shadow duration-200 hover:shadow-card-hover animate-fade-up"
          style={{ animationDelay: '160ms' }}
        >
          <div className="h-[2px] bg-verified" />
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${isLeader ? 'bg-verified animate-pulse-slow' : 'bg-text-muted'}`} />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Coordinador
              </span>
            </div>

            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-text-primary">Este nodo</span>
              {isLeader ? (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-verified-dim text-verified border border-verified/20">
                  Líder
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-surface-hover text-text-secondary border border-border-subtle">
                  {status?.role ?? 'desconocido'}
                </span>
              )}
            </div>

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Cadena</span>
                <span className="font-mono text-text-primary">{status?.chain_length ?? '—'} bloques</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Elección</span>
                <span className="font-mono text-text-secondary">Bully</span>
              </div>
            </div>

            <p className="text-[11px] text-text-muted mt-3">
              {isLeader
                ? 'Ganó la elección Bully — procesa resultados de minado'
                : 'En espera — asumirá liderazgo si el líder falla'}
            </p>
          </div>
        </div>

        {/* ── Bottom-Right: System Health ── */}
        <div
          className="bg-surface border border-border-subtle rounded-lg overflow-hidden shadow-card transition-shadow duration-200 hover:shadow-card-hover animate-fade-up"
          style={{ animationDelay: '240ms' }}
        >
          <div className={`h-[2px] ${dlqCount > 0 ? 'bg-anomaly' : 'bg-mineral'}`} />
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${dlqCount > 0 ? 'bg-anomaly' : 'bg-verified animate-pulse-slow'}`} />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Salud del Sistema
              </span>
            </div>

            <div className="space-y-2.5">
              {/* DLQ */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">DLQ (fallas)</span>
                <span className={`font-mono text-sm font-semibold ${dlqCount > 0 ? 'text-anomaly' : 'text-verified'}`}>
                  {dlqCount}
                </span>
              </div>

              {/* Auto-scaling */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">Auto-escalado</span>
                <span className={`font-mono text-sm ${scale?.scale_needed ? 'text-anomaly' : 'text-verified'}`}>
                  {scale?.scale_needed ? 'sí' : 'no'}
                </span>
              </div>

              {/* Last scale request */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">Última solicitud</span>
                <span className="font-mono text-xs text-text-secondary">
                  {scale?.last_scale_request
                    ? new Date(scale.last_scale_request).toLocaleTimeString('es-AR')
                    : 'ninguna'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-text-muted mt-3">
              Resultados fallidos se redirigen vía DLX tras 4 reintentos
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
