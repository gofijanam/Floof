export const SOL_USD = 182.4
export const short = (a: string, n = 4) => (a.length > 2 * n + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a)
export function fmtSol(v: number, d?: number) {
  const dd = d ?? (v >= 100 ? 1 : v >= 1 ? 2 : 3)
  return v.toLocaleString('en-US', { minimumFractionDigits: dd, maximumFractionDigits: dd })
}
export function fmtCompact(v: number, d = 1) {
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(d) + 'B'
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(d) + 'M'
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(d) + 'K'
  return v.toFixed(0)
}
export const fmtUsd = (v: number) => '$' + (v >= 1000 ? fmtCompact(v, v >= 1e6 ? 2 : 1) : v.toFixed(2))
export function fmtPrice(p: number) {
  if (!Number.isFinite(p) || p <= 0) return '—'
  // SOL per token, show leading zeros compactly e.g. 0.0₆42
  if (p >= 0.001) return p.toFixed(5)
  const s = p.toExponential(2) // 4.20e-7
  const [m, e] = s.split('e')
  const zeros = -parseInt(e) - 1
  const digits = m.replace('.', '').slice(0, 3)
  const sub = String(zeros).split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c]).join('')
  return `0.0${sub}${digits}`
}
export function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
export function hms(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`
}
export function ago(ms: number) {
  const s = Math.floor(ms / 1000)
  if (s < 5) return 'now'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}
