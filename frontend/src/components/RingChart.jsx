export default function RingChart({
  value = 0,
  max = 100,
  size = 48,
  strokeWidth = 4,
  color = 'text-mineral',
  trackColor = 'text-surface-bright',
  label,
  showValue = false,
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference * (1 - progress);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.23, 1, 0.32, 1)' }}
        />
      </svg>
      {(showValue || label) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {showValue && (
            <span className={`font-mono text-xs font-bold ${color}`}>
              {Math.round(progress * 100)}%
            </span>
          )}
          {label && (
            <span className="text-[8px] text-text-muted leading-none">{label}</span>
          )}
        </div>
      )}
    </div>
  );
}
