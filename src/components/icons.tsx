import { SVGProps } from 'react'
type P = SVGProps<SVGSVGElement> & { s?: number }
const I = ({ s = 20, children, ...p }: P & { children: any }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>
)
export const IExplore = (p: P) => <I {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></I>
export const ICreate = (p: P) => <I {...p}><path d="M12 5v14M5 12h14" /></I>
export const IWallet = (p: P) => <I {...p}><rect x="3" y="6" width="18" height="13" rx="4" /><path d="M16 12.5h.01M3 9h18" /></I>
export const ITrophy = (p: P) => <I {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" /></I>
export const IShield = (p: P) => <I {...p}><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></I>
export const IBook = (p: P) => <I {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></I>
export const IHome = (p: P) => <I {...p}><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></I>
export const IClock = (p: P) => <I {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></I>
export const IArrow = (p: P) => <I {...p}><path d="M5 12h14M13 6l6 6-6 6" /></I>
export const IBack = (p: P) => <I {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></I>
export const ICheck = (p: P) => <I {...p}><path d="m5 12 5 5 9-10" /></I>
export const IX = (p: P) => <I {...p}><path d="M6 6l12 12M18 6 6 18" /></I>
export const ICopy = (p: P) => <I {...p}><rect x="8" y="8" width="12" height="12" rx="3" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></I>
export const IGear = (p: P) => <I {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></I>
export const IUpload = (p: P) => <I {...p}><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></I>
export const ISwap = (p: P) => <I {...p}><path d="M7 4v16M3 8l4-4 4 4M17 20V4M21 16l-4 4-4-4" /></I>
export const ILock = (p: P) => <I {...p}><rect x="5" y="11" width="14" height="9" rx="3" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></I>
export const IBolt = (p: P) => <I {...p}><path d="M13 3 5 14h6l-1 7 8-11h-6z" /></I>
export const ISparkle = (p: P) => <I {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></I>
export const IUsers = (p: P) => <I {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></I>
export const IGhost = (p: P) => <I {...p}><path d="M5 20V10a7 7 0 0 1 14 0v10l-2.5-2-2.3 2-2.2-2-2.3 2-2.2-2z" /><path d="M9.5 10h.01M14.5 10h.01" /></I>
export const IFilter = (p: P) => <I {...p}><path d="M4 5h16l-6 8v6l-4-2v-4z" /></I>
export const IChevron = (p: P) => <I {...p}><path d="m9 6 6 6-6 6" /></I>
export function ISound({ on, s = 20 }: { on: boolean; s?: number }) {
  if (!on) return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /><path d="M3 3l18 18" opacity=".7" /></svg>
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
      {[4, 9, 14, 19].map((x, i) => (
        <rect key={x} x={x - 1.2} width="2.4" rx="1.2" fill="currentColor" y={on ? 6 : 10.5} height={on ? 12 : 3}
          style={on ? { animation: `eqBar ${0.7 + i * 0.13}s ease-in-out ${i * 0.1}s infinite alternate`, transformOrigin: '50% 50%', transformBox: 'fill-box' } : undefined} />
      ))}
    </svg>
  )
}
