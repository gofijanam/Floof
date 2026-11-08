import { Link } from 'react-router-dom'
import {useStore} from '../lib/store'
export function Footer() {
  const devnet=useStore(s=>s.mode==='devnet')
  return (
    <footer className="relative z-10 mx-auto mt-24 max-w-[1400px] px-4 pb-32 md:px-6 lg:pb-12">
      <div className="flex flex-col items-start justify-between gap-6 border-t border-lav/10 pt-8 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <img src="./logo/floof-mark-mochi.svg" alt="" className="h-10 w-10" />
          <div>
            <img src="./logo/floof-wordmark-cream.svg" alt="floof.fun" className="h-6" />
            <div className="mt-1 text-xs font-bold text-lav/70">Fair launches. One price. No snipers. · {devnet ? 'Solana Devnet · test SOL only.' : 'Sandbox · saved test balances · no on-chain funds.'} USD figures use an illustrative SOL rate.</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-extrabold text-lav">
          <Link to="/docs" className="hover:text-cream">How it works</Link><Link to="/docs#fees" className="hover:text-cream">Fees</Link>
          <Link to="/truth" className="hover:text-cream">TRUTH</Link><Link to="/scouts" className="hover:text-cream">Scouts</Link><Link to="/create" className="hover:text-cream">Launch a coin</Link>
        </div>
      </div>
    </footer>
  )
}
