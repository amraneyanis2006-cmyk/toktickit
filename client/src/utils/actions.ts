// Small shared helpers for the Actions Taken UI (kept out of component files for fast refresh).
export const isLocked = (a: { status: string }) => a.status === 'COMPLETED' || a.status === 'CANCELLED';

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
