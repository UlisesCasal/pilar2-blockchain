import { useState, useEffect, useRef, useCallback } from 'react';
import { Hexagon, Check, X, Loader2, Circle, ShieldAlert } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import RingChart from '../components/RingChart';

const POLL_INTERVAL = 3000; // 3s

/**
 * Poll the chain for a lot ID and return the block + tx if found.
 */
async function findLotInChain(lotId) {
  try {
    const data = await api.getLot(lotId);
    return { found: data.length > 0, results: data };
  } catch {
    return { found: false, results: [] };
  }
}

/**
 * Track the lifecycle of a single submitted transaction.
 */
function TxTracker({ tx, lotId, onStatusChange }) {
  const [status, setStatus] = useState('pending'); // pending → mining → confirming → confirmed | timeout
  const [detail, setDetail] = useState('');
  const [poolNeeded, setPoolNeeded] = useState(null);
  const intervalRef = useRef(null);

  const pollStatus = useCallback(async () => {
    try {
      // 1. Check if it's already in the chain
      const chainResult = await findLotInChain(lotId);
      if (chainResult.found) {
        setStatus('confirmed');
        setDetail(`Encontrado en ${chainResult.results.length} bloque(s)`);
        clearInterval(intervalRef.current);
        return;
      }

      // 2. Check pool status
      const poolStatus = await api.getPoolStatus();
      const pendingTxs = await api.getPending();

      if (poolStatus.pending > 0) {
        // Check if our tx is still in the pending pool
        const ourTx = pendingTxs.pending.find(t => t.id_lote === lotId);
        if (ourTx) {
          setStatus('pending');
          setPoolNeeded(poolStatus.pending);
          setDetail(`${poolStatus.pending} en pool · faltan ${poolStatus.threshold - poolStatus.pending} para minar`);
        } else {
          // Our tx was flushed but not yet confirmed → it's being mined
          setStatus('mining');
          setDetail('Bloque en proceso de mineria...');
        }
      } else if (poolStatus.pending === 0 && !chainResult.found) {
        // Pool empty but tx not in chain — could be mining right now
        setStatus('mining');
        setDetail('Bloque siendo minado...');
      }
    } catch {
      setDetail('Verificando...');
    }
  }, [lotId]);

  useEffect(() => {
    if (onStatusChange) onStatusChange(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    // Initial check
    pollStatus();

    // Poll every 3s until confirmed
    intervalRef.current = setInterval(pollStatus, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [pollStatus]);

  const statusConfig = {
    pending: {
      icon: <Circle className="w-3 h-3" aria-hidden="true" />,
      color: 'text-pending',
      border: 'border-l-pending',
      bg: 'bg-pending-dim',
      label: 'Pendiente en pool',
    },
    mining: {
      icon: <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />,
      color: 'text-mineral',
      border: 'border-l-mineral',
      bg: 'bg-mineral-dim',
      label: 'Minandose...',
    },
    confirming: {
      icon: <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />,
      color: 'text-text-secondary',
      border: 'border-l-text-muted',
      bg: 'bg-surface',
      label: 'Confirmando...',
    },
    confirmed: {
      icon: <Check className="w-3 h-3" aria-hidden="true" />,
      color: 'text-verified',
      border: 'border-l-verified',
      bg: 'bg-verified-dim',
      label: 'Confirmado en cadena!',
    },
    timeout: {
      icon: <X className="w-3 h-3" aria-hidden="true" />,
      color: 'text-anomaly',
      border: 'border-l-anomaly',
      bg: 'bg-anomaly-dim',
      label: 'Error de verificacion',
    },
  };

  const cfg = statusConfig[status] || statusConfig.pending;

  return (
    <div className={`rounded-lg px-4 py-3 border border-border-subtle border-l-[3px] ${cfg.border} ${cfg.bg} animate-fade-in`}>
      <div className="flex justify-between items-start text-sm">
        <span className="font-mono text-xs text-text-secondary">{lotId}</span>
        <span className="font-mono text-xs text-text-primary">{tx.cantidad} {tx.tipo === 'MINERAL' ? 'tn' : 'bbl'}</span>
      </div>
      <p className="text-sm text-text-muted mt-1">{tx.origen} &rarr; {tx.destino}</p>
      <div className="flex items-center justify-between mt-2">
        <p className={`flex items-center gap-1.5 text-xs font-semibold ${cfg.color}`}>
          {cfg.icon}
          {cfg.label}
        </p>
        {status === 'confirmed' && (
          <a
            href={`/trazabilidad?lot=${encodeURIComponent(lotId)}`}
            onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('navigate', { detail: `custody?lot=${encodeURIComponent(lotId)}` })); }}
            className="text-[11px] text-mineral hover:text-mineral/80 hover:underline font-medium transition-colors"
          >
            Ver trazabilidad →
          </a>
        )}
      </div>
      {detail && <p className="text-[11px] text-text-muted mt-1 font-mono">{detail}</p>}
      {poolNeeded !== null && poolNeeded > 0 && poolNeeded < 10 && (
        <div className="mt-2 w-full bg-surface-bright rounded-full h-1.5">
          <div
            className="bg-mineral h-1.5 rounded-full transition-all"
            style={{ width: `${Math.min(100, (poolNeeded / 10) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * SVG Pipeline Stepper — visual guide for the transaction lifecycle.
 * Highlights step 1 as active when form is incomplete, step 1 complete when ready.
 */
function PipelineStepper({ isReady, submitting, txStatus }) {
  const steps = [
    { label: 'Completar', sublabel: 'formulario' },
    { label: 'Firmar', sublabel: 'Ed25519' },
    { label: 'Pool', sublabel: 'pendiente' },
    { label: 'Minar', sublabel: 'PoW' },
    { label: 'Confirmar', sublabel: 'cadena' },
  ];

  let activeStep = 0;
  if (txStatus === 'confirmed') activeStep = 5;
  else if (txStatus === 'mining') activeStep = 4;
  else if (txStatus === 'pending') activeStep = 3;
  else if (txStatus === 'sent') activeStep = 2;
  else if (submitting) activeStep = 1;
  else if (isReady) activeStep = 1;

  const nodeRadius = 12;
  const nodeSpacing = 130;
  const svgWidth = (steps.length - 1) * nodeSpacing + nodeRadius * 2 + 100;
  const svgHeight = 72;
  const startX = 32;
  const cy = 24;

  return (
    <div className="mb-6">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="block w-full"
        role="img"
        aria-label="Pipeline de transaccion"
      >
        <style>{`@keyframes flowDash { to { stroke-dashoffset: -10; } }`}</style>

        {/* Connecting lines */}
        {steps.map((_, i) => {
          if (i >= steps.length - 1) return null;
          const x1 = startX + i * nodeSpacing + nodeRadius;
          const x2 = startX + (i + 1) * nodeSpacing - nodeRadius;
          const isCompleted = i < activeStep;

          return (
            <line
              key={`line-${i}`}
              x1={x1}
              y1={cy}
              x2={x2}
              y2={cy}
              stroke={isCompleted ? '#22C55E' : '#33302E'}
              strokeWidth={2}
              strokeDasharray="6 4"
              style={isCompleted
                ? { animation: 'flowDash 1s linear infinite' }
                : undefined
              }
            />
          );
        })}

        {/* Nodes */}
        {steps.map((step, i) => {
          const cx = startX + i * nodeSpacing;
          const isActive = i === activeStep;
          const isCompleted = i < activeStep;
          const isFuture = i > activeStep;

          let fillColor = '#2A2725'; // surface-bright
          let strokeColor = '#33302E'; // border-subtle
          let textColor = '#6B6560'; // text-muted

          if (isCompleted) {
            fillColor = '#22C55E'; // verified
            strokeColor = '#22C55E';
            textColor = '#1A1816';
          } else if (isActive) {
            fillColor = '#B8860B'; // mineral
            strokeColor = '#B8860B';
            textColor = '#1A1816';
          }

          return (
            <g key={`node-${i}`} style={{ animationDelay: `${i * 30}ms` }}>
              {/* Glow for active */}
              {isActive && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={nodeRadius + 4}
                  fill="none"
                  stroke="#B8860B"
                  strokeWidth={2}
                  opacity={0.3}
                />
              )}

              <circle
                cx={cx}
                cy={cy}
                r={nodeRadius}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={1.5}
                className="transition-all duration-200"
              />

              {/* Step number or check */}
              {isCompleted ? (
                <text
                  x={cx}
                  y={cy + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={textColor}
                  fontSize={12}
                  fontFamily="ui-monospace, monospace"
                  fontWeight={700}
                >
                  &#x2713;
                </text>
              ) : (
                <text
                  x={cx}
                  y={cy + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={textColor}
                  fontSize={11}
                  fontFamily="ui-monospace, monospace"
                  fontWeight={600}
                >
                  {i + 1}
                </text>
              )}

              {/* Labels below */}
              <text
                x={cx}
                y={cy + nodeRadius + 14}
                textAnchor="middle"
                fill={isFuture ? '#6B6560' : (isActive ? '#B8860B' : '#22C55E')}
                fontSize={10}
                fontFamily="system-ui, sans-serif"
                fontWeight={isActive ? 600 : 400}
              >
                {step.label}
              </text>
              <text
                x={cx}
                y={cy + nodeRadius + 26}
                textAnchor="middle"
                fill="#6B6560"
                fontSize={9}
                fontFamily="system-ui, sans-serif"
              >
                {step.sublabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function TransactionForm() {
  const { user } = useAuth();
  const [entities, setEntities] = useState([]);
  const [form, setForm] = useState({ tipo: 'MINERAL', origen: '', destino: '', id_lote: '', cantidad: '' });
  const [submissions, setSubmissions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [poolInfo, setPoolInfo] = useState(null);
  const [miningResult, setMiningResult] = useState(null);
  const [error, setError] = useState(null);
  const [lastTxStatus, setLastTxStatus] = useState(null);

  useEffect(() => {
    api.getEntities().then(setEntities).catch(() => {});
    refreshPoolInfo();
  }, []);

  useEffect(() => {
    if (user?.name) {
      setForm((f) => ({ ...f, origen: user.name }));
    }
  }, [user]);

  async function refreshPoolInfo() {
    try {
      const info = await api.getPoolStatus();
      setPoolInfo(info);
    } catch {
      // silent
    }
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const transaction = {
      id: self.crypto?.randomUUID?.() ?? ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)),
      id_lote: form.id_lote,
      origen: form.origen,
      destino: form.destino,
      cantidad: Number(form.cantidad),
      tipo: form.tipo,
      timestamp: new Date().toISOString(),
    };

    try {
      const signed = await api.signTransaction(transaction);
      const result = await api.submitTransaction(signed);

      if (!result.accepted) {
        setError(result.errors?.[0] || 'Transaccion rechazada');
        setSubmitting(false);
        return;
      }

      // Add to submissions for tracking
      const txTrack = {
        tx: signed,
        lotId: form.id_lote,
        submittedAt: Date.now(),
      };

      setLastTxStatus('sent');
      setSubmissions((s) => [txTrack, ...s]);
      setForm((f) => ({ ...f, id_lote: '', cantidad: '' }));
      await refreshPoolInfo();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForceMine() {
    setMiningResult(null);
    setError(null);
    try {
      const result = await api.triggerMining();
      setMiningResult(result);
      await refreshPoolInfo();
      // Refresh in a few seconds to show mining started
      setTimeout(refreshPoolInfo, 2000);
    } catch (err) {
      setError(err.message);
    }
  }

  const isImpostor = user?.name === 'impostor';
  const unit = form.tipo === 'MINERAL' ? 'toneladas' : 'barriles';
  const isReady = form.origen && form.destino && form.id_lote && form.cantidad;

  // Pool gauge color: pending > 70% threshold → pending color, else mineral
  const poolGaugeColor = poolInfo && poolInfo.threshold > 0 && (poolInfo.pending / poolInfo.threshold) > 0.7
    ? 'text-pending'
    : 'text-mineral';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="col-span-full lg:col-span-7">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-mineral-dim flex items-center justify-center">
            <Hexagon className="w-4 h-4 text-mineral" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-sans text-2xl font-semibold text-text-primary">Nueva Transferencia de Custodia</h2>
            <p className="text-text-muted text-sm">Registra una transferencia de recursos fisicos entre entidades</p>
          </div>
        </div>

        {/* Pipeline Stepper */}
        <PipelineStepper isReady={isReady} submitting={submitting} txStatus={lastTxStatus} />

        {/* Pool status bar */}
        {poolInfo && poolInfo.pending > 0 && (
          <div className="mb-6 bg-mineral-dim border border-mineral/20 rounded-lg px-4 py-3 animate-fade-up">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-mineral">
                {poolInfo.pending} transaccion(es) pendiente(s)
              </span>
              <span className="text-text-muted">
                Faltan {Math.max(0, poolInfo.threshold - poolInfo.pending)} para minar
              </span>
            </div>
            <div className="mt-2 w-full bg-surface-bright rounded-full h-2">
              <div
                className="bg-mineral h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (poolInfo.pending / poolInfo.threshold) * 100)}%` }}
              />
            </div>
            {poolInfo.pending > 0 && (
              <button
                onClick={handleForceMine}
                className="mt-3 w-full py-2 bg-surface border border-mineral/30 hover:border-mineral/60 active:scale-[0.97] text-mineral text-xs font-semibold rounded-lg cursor-pointer transition-all duration-150"
              >
                Minar ahora ({poolInfo.pending} transacciones)
              </button>
            )}
            {miningResult && (
              <p className="text-xs text-verified font-medium mt-2 animate-fade-up flex items-center gap-1">
                <Check className="w-3 h-3" aria-hidden="true" /> Minado iniciado: {miningResult.transactions} transacciones
              </p>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-surface rounded-lg border border-border-subtle shadow-card px-5 py-5 space-y-5">
            {/* Resource type toggle + Lot ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">Tipo de Recurso</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => update('tipo', 'MINERAL')}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold border transition-all duration-150 active:scale-[0.97] cursor-pointer ${
                      form.tipo === 'MINERAL'
                        ? 'bg-mineral-dim text-mineral border-mineral'
                        : 'bg-base text-text-muted border-border-subtle hover:border-text-muted'
                    }`}
                  >
                    MINERAL
                  </button>
                  <button
                    type="button"
                    onClick={() => update('tipo', 'CRUDO')}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold border transition-all duration-150 active:scale-[0.97] cursor-pointer ${
                      form.tipo === 'CRUDO'
                        ? 'bg-crude-dim text-crude border-crude'
                        : 'bg-base text-text-muted border-border-subtle hover:border-text-muted'
                    }`}
                  >
                    CRUDO
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="lote-id" className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">ID de Lote</label>
                <input
                  id="lote-id"
                  type="text"
                  value={form.id_lote}
                  onChange={(e) => update('id_lote', e.target.value)}
                  placeholder="LOTE-2026-MIN-001"
                  className="w-full bg-base border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary font-mono placeholder:text-text-muted/40 focus:border-mineral focus:outline-none hover:border-text-muted/40 transition-colors duration-200"
                  required
                />
              </div>
            </div>

            {/* Impostor warning */}
            {isImpostor && (
              <div className="bg-anomaly-dim border border-anomaly/30 rounded-lg px-4 py-3 animate-fade-up">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-anomaly flex-shrink-0" />
                  <div>
                    <p className="text-anomaly text-sm font-semibold">Modo Impostor</p>
                    <p className="text-text-muted text-xs mt-0.5">
                      Selecciona una entidad a suplantar. La transaccion se firmara con TUS claves, no las de la entidad seleccionada. El validator la rechazara.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Origin and destination */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">
                  {isImpostor ? 'Suplantar Entidad' : 'Entidad de Origen'}
                </label>
                {isImpostor ? (
                  <>
                    <select
                      value={form.origen}
                      onChange={(e) => update('origen', e.target.value)}
                      className="w-full bg-base border border-anomaly/40 rounded-lg px-3 py-2.5 text-sm text-anomaly font-mono focus:border-anomaly focus:outline-none"
                      required
                    >
                      <option value="">Seleccionar victima...</option>
                      {entities.filter((e) => (e.name || e) !== 'impostor').map((e) => (
                        <option key={e.name || e} value={e.name || e}>{e.display_name || e.name || e}</option>
                      ))}
                    </select>
                    {form.origen && (
                      <p className="flex items-center gap-1 mt-1.5 text-xs">
                        <ShieldAlert className="w-3 h-3 text-anomaly" />
                        <span className="text-anomaly">suplantando a <span className="font-medium">{form.origen}</span>, firmando con claves de impostor</span>
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="w-full bg-base border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary">
                      {user?.displayName || form.origen}
                    </div>
                    <p className="flex items-center gap-1 mt-1.5 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-mineral" />
                      <span className="text-text-muted">firmando como <span className="text-mineral font-medium">{user?.displayName || form.origen}</span></span>
                    </p>
                  </>
                )}
              </div>
              <div>
                <label htmlFor="destino" className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">Entidad de Destino</label>
                <select
                  id="destino"
                  value={form.destino}
                  onChange={(e) => update('destino', e.target.value)}
                  className="w-full bg-base border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-mineral focus:outline-none hover:border-text-muted/40 transition-colors duration-200"
                  required
                >
                  <option value="">Seleccionar destino...</option>
                  {entities.filter((e) => (e.name || e) !== form.origen).map((e) => (
                    <option key={e.name || e} value={e.name || e}>{e.display_name || e.name || e}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quantity */}
            <div className="max-w-xs">
              <label htmlFor="cantidad" className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">Cantidad</label>
              <div className="flex items-center gap-2">
                <input
                  id="cantidad"
                  type="number"
                  min="1"
                  step="any"
                  value={form.cantidad}
                  onChange={(e) => update('cantidad', e.target.value)}
                  className="flex-1 bg-base border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-mineral focus:outline-none hover:border-text-muted/40 transition-colors duration-200"
                  required
                />
                <span className="text-sm text-text-muted font-mono">{unit}</span>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-anomaly-dim border border-anomaly/20 rounded-lg px-4 py-3 animate-fade-up">
              <p className="text-anomaly text-sm flex items-center gap-2">
                <X className="w-3 h-3" aria-hidden="true" /> {error}
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !isReady}
            className={`w-full py-3 rounded-lg text-sm font-semibold transition-all duration-150 ${
              isReady
                ? isImpostor
                  ? 'bg-anomaly text-base cursor-pointer hover:brightness-110 active:scale-[0.97] shadow-card'
                  : 'bg-mineral text-base cursor-pointer hover:brightness-110 active:scale-[0.97] shadow-card hover:shadow-glow-mineral'
                : 'bg-surface-bright text-text-muted cursor-not-allowed'
            } disabled:opacity-50`}
          >
            {submitting
              ? 'Firmando y enviando...'
              : isReady
                ? isImpostor ? 'Intentar Falsificar Transaccion' : 'Firmar y Enviar al Pool'
                : 'Completa todos los campos'}
          </button>
        </form>
      </div>

      {/* Right sidebar */}
      <div className="col-span-full lg:col-span-5">
        {/* Pool Gauge */}
        {poolInfo && (
          <div className="bg-surface rounded-lg border border-border-subtle shadow-card px-5 py-4 mb-4">
            <div className="flex items-center gap-4">
              <RingChart
                value={poolInfo.pending || 0}
                max={poolInfo.threshold || 10}
                size={72}
                strokeWidth={6}
                color={poolGaugeColor}
                trackColor="text-surface-bright"
              />
              <div>
                <p className="font-mono text-lg text-text-primary">
                  {poolInfo.pending || 0}<span className="text-text-muted">/{poolInfo.threshold || 10}</span>
                </p>
                <p className="text-[11px] text-text-muted mt-0.5">transacciones en pool</p>
              </div>
            </div>
          </div>
        )}

        {/* Transaction status tracker */}
        <div className="bg-surface rounded-lg border border-border-subtle shadow-card overflow-hidden">
          <div className="bg-mineral-dim px-5 py-3 border-b border-border-subtle">
            <span className="font-semibold uppercase tracking-widest text-[10px] text-mineral">Estado de Transacciones</span>
          </div>

          <div className="px-5 py-4">
            {submissions.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-text-secondary">Sin transferencias registradas</p>
                <p className="text-[11px] text-text-muted mt-1">Cada transaccion se trackea automaticamente hasta su confirmacion en cadena</p>
              </div>
            ) : (
              <div className="space-y-3">
                {submissions.map((s, i) => (
                  <TxTracker key={s.lotId + s.submittedAt} tx={s.tx} lotId={s.lotId} onStatusChange={i === 0 ? setLastTxStatus : undefined} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick instructions */}
        <div className="mt-4 bg-surface rounded-lg border border-border-subtle shadow-card px-5 py-4">
          <span className="font-semibold uppercase tracking-widest text-[10px] text-text-muted">Como funciona la trazabilidad</span>
          <div className="mt-3 space-y-2 text-xs text-text-secondary">
            <div className="flex gap-2">
              <span className="text-mineral font-semibold font-mono shrink-0">1.</span>
              <p>Completa la transferencia y enviala al pool</p>
            </div>
            <div className="flex gap-2">
              <span className="text-mineral font-semibold font-mono shrink-0">2.</span>
              <p>Se muestra en la columna de estado como <span className="text-pending font-medium">pendiente</span></p>
            </div>
            <div className="flex gap-2">
              <span className="text-mineral font-semibold font-mono shrink-0">3.</span>
              <p>Cuando haya 10 txs, el bloque se mina automaticamente</p>
            </div>
            <div className="flex gap-2">
              <span className="text-mineral font-semibold font-mono shrink-0">4.</span>
              <p>Tambien podes usar <span className="text-text-primary font-medium">"Minar ahora"</span> para forzar el minado</p>
            </div>
            <div className="flex gap-2">
              <Check className="w-3 h-3 text-verified shrink-0 mt-0.5" aria-hidden="true" />
              <p>Pasa a la vista <span className="text-text-primary font-medium">Trazabilidad</span> para ver el historial completo por lote</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
