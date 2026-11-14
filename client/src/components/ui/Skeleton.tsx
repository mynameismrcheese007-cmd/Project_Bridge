import type { CSSProperties } from 'react';

/** One placeholder block. Give it the size of what it stands in for, so nothing shifts when content arrives. */
export function Skeleton({ width = '100%', height = 16, round = false, style }: { width?: number | string; height?: number | string; round?: boolean; style?: CSSProperties }) {
  return <div className="skeleton" aria-hidden="true" style={{ width, height, borderRadius: round ? '50%' : undefined, ...style }} />;
}

/** Placeholder for a list of rows (requests, notifications, conversations, queue items). */
export function SkeletonList({ rows = 4, avatar = false, label = 'Loading…' }: { rows?: number; avatar?: boolean; label?: string }) {
  return (
    <div className="skeleton-stack" role="status" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card card-pad skeleton-row" aria-hidden="true">
          {avatar && <Skeleton width={36} height={36} round />}
          <div className="skeleton-stack" style={{ flex: 1 }}>
            <Skeleton width={`${40 + ((i * 17) % 30)}%`} height={14} />
            <Skeleton width={`${70 + ((i * 11) % 25)}%`} height={12} />
          </div>
        </div>
      ))}
    </div>
  );
}
