import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Card, SectionTitle, cx } from '../components/ui'
import { PeekMochi } from '../components/ui'
import { FEES, GRADUATE_SOL } from '../lib/mock'
import { IChevron } from '../components/icons'

const STEPS = [
  ['Creator sets up', 'Coin details, a presale size (0–86 SOL), an optional creator buy, a min target and a SOL bond. Creator allocation vests on a lock.'],
  ['10-minute fair window', 'Anyone pledges SOL into escrow. Max 1% of the presale per wallet; linked wallets share one cap.'],
  ['Zero', 'Under min target → everyone refunded. Otherwise the presale (plus the creator buy) becomes the first buy on Raydium LaunchLab, executed atomically with pool creation. Oversubscribed → everyone fills pro-rata.'],
  ['Bonding curve', `Trading continues on Raydium LaunchLab’s standard curve (1B supply, 793.1M sold on the curve). It migrates to a Raydium CPMM pool once ~${GRADUATE_SOL} SOL has been raised.`],
  ['Rewards', 'Window tickets, Scout rewards for early holders, creator bond returned on a clean launch.'],
]
const FAQ = [
  ['Why can’t snipers get in?', 'The pool is created and the window’s first buy executes in the same instruction, so nobody can trade before the presale. Being faster changes nothing.'],
  ['What’s the clearing price?', 'The average price of the combined first buy (presale + creator buy) on the standard LaunchLab curve. Everyone in the window — creator included — pays the same price. The Create page shows it live for any raise.'],
  ['What is TRUTH?', 'An indexer that clusters wallets by funding source and behaviour to estimate the share of real buyers vs sybils, bundles and wash trades, graded A+ to D.'],
  ['Can the creator rug?', 'The creator posts a SOL bond and their allocation vests. Early dumping or provable fake volume can slash the bond to holders through the oracle flow.'],
  ['Is this live?', 'This deployment runs on Solana Devnet with test SOL only. No mainnet funds are involved.'],
]
export default function Docs() {
  const [open, setOpen] = useState<number | null>(0)
  useEffect(() => { if (location.hash.includes('fees')) setTimeout(() => document.getElementById('fees')?.scrollIntoView({ behavior: 'smooth' }), 300) }, [])
  const fee = [{ k: 'Protocol (sandbox)', v: FEES.raydium, c: '#5FD4FF' }, { k: 'Creator', v: FEES.creator, c: '#B69CFF' }, { k: 'Platform', v: FEES.platform, c: '#FF5FB8' }]
  let acc = 0
  return (
    <div className="relative mx-auto max-w-[1100px] px-4 pt-24 md:px-6 md:pt-28">
      <PeekMochi src="idle" />
      <SectionTitle kicker="docs" title="How floof works" sub="The whole mechanic on one page." />
      <div className="relative mt-10 space-y-4 before:absolute before:bottom-6 before:left-[22px] before:top-6 before:w-0.5 before:bg-gradient-to-b before:from-blue before:via-lav before:to-pink">
        {STEPS.map(([t, d], i) => (
          <motion.div key={t} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="relative flex gap-4">
            <div className="relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-plum font-num font-semibold text-pink ring-1 ring-pink/40">{i + 1}</div>
            <Card className="flex-1 p-4"><div className="font-display text-xl font-extrabold">{t}</div><p className="text-sm font-semibold text-lav">{d}</p></Card>
          </motion.div>
        ))}
      </div>
      <div id="fees" className="mt-16 scroll-mt-28">
        <SectionTitle kicker="fees" title={<>{FEES.total}% per trade. <span className="text-candy">That’s it.</span></>} />
        <div className="mt-8 grid items-center gap-8 md:grid-cols-[280px_1fr]">
          <svg viewBox="0 0 200 200" className="mx-auto w-56">
            {fee.map((f) => { const start = acc; acc += f.v; const a0 = (start / FEES.total) * Math.PI * 2 - Math.PI / 2, a1 = (acc / FEES.total) * Math.PI * 2 - Math.PI / 2; const large = a1 - a0 > Math.PI ? 1 : 0
              return <path key={f.k} d={`M100 100 L${100 + 90 * Math.cos(a0)} ${100 + 90 * Math.sin(a0)} A90 90 0 ${large} 1 ${100 + 90 * Math.cos(a1)} ${100 + 90 * Math.sin(a1)}Z`} fill={f.c} stroke="#0E0818" strokeWidth="4" style={{ filter: `drop-shadow(0 0 10px ${f.c}66)` }} /> })}
            <circle cx="100" cy="100" r="52" fill="#1A0F2E" /><text x="100" y="108" textAnchor="middle" className="fill-cream font-num text-[28px] font-semibold">{FEES.total}%</text>
          </svg>
          <div className="space-y-3">
            {fee.map((f) => <Card key={f.k} className="flex items-center justify-between p-4"><span className="flex items-center gap-3 font-extrabold"><span className="h-4 w-4 rounded-full" style={{ background: f.c }} />{f.k}</span><span className="font-num text-2xl font-semibold tnum">{f.v}%</span></Card>)}
            <p className="text-xs font-bold text-lav/70">These are sandbox fees; production Raydium fees must be read from the selected on-chain configuration. No fee to pledge. Refunds are free. Creating a coin: 0.02 SOL + refundable bond.</p>
          </div>
        </div>
      </div>
      <div className="mt-16">
        <SectionTitle kicker="faq" title="Questions" />
        <div className="mt-6 space-y-2">
          {FAQ.map(([q, a], i) => (
            <Card key={q} className="overflow-hidden">
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between p-5 text-left font-display text-lg font-extrabold" aria-expanded={open === i}>{q}<IChevron s={18} className={cx('transition-transform', open === i && 'rotate-90')} /></button>
              <AnimatePresence initial={false}>{open === i && <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden"><p className="px-5 pb-5 text-sm font-semibold text-lav">{a}</p></motion.div>}</AnimatePresence>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
