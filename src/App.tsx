import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'framer-motion'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Lenis from 'lenis'
import { Nav, MobileDock } from './components/Nav'
import { Toasts } from './components/Toasts'
import { Cursor } from './components/Cursor'
import { CandyField } from './components/CandyField'
import { Preloader } from './components/Preloader'
import { Footer } from './components/Footer'
import { startSim, useStore, closePoof, refresh } from './lib/store'
import { sound } from './lib/audio'
import Landing from './pages/Landing'

const Explore = lazy(() => import('./pages/Explore'))
const Create = lazy(() => import('./pages/Create'))
const CoinLive = lazy(() => import('./pages/CoinLive'))
const Poof = lazy(() => import('./pages/Poof'))
const Trade = lazy(() => import('./pages/Trade'))
const Portfolio = lazy(() => import('./pages/Portfolio'))
const Creator = lazy(() => import('./pages/Creator'))
const Truth = lazy(() => import('./pages/Truth'))
const Scouts = lazy(() => import('./pages/Scouts'))
const Docs = lazy(() => import('./pages/Docs'))

export let lenis: Lenis | null = null

function PoofWatcher() {
  const poof = useStore((s) => s.poof)
  const nav = useNavigate()
  useEffect(() => { if (poof) { nav(`/coin/${poof}/poof`); closePoof() } }, [poof, nav])
  return null
}

export default function App() {
  const loc = useLocation()
  const ready = useStore(s => s.ready)
  const apiError = useStore(s => s.error)
  const [loaded, setLoaded] = useState(() => { try { return sessionStorage.getItem('floof-loaded') === '1' || new URLSearchParams(location.search).has('nopreload') } catch { return false } })
  const done = useCallback(() => { setLoaded(true); try { sessionStorage.setItem('floof-loaded', '1') } catch {} }, [])
  useEffect(() => { startSim() }, [])
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    lenis = new Lenis({ lerp: 0.12, smoothWheel: true })
    let raf = 0
    const f = (t: number) => { lenis?.raf(t); raf = requestAnimationFrame(f) }
    raf = requestAnimationFrame(f)
    return () => { cancelAnimationFrame(raf); lenis?.destroy(); lenis = null }
  }, [])
  useEffect(() => { lenis ? lenis.scrollTo(0, { immediate: true }) : window.scrollTo(0, 0) }, [loc.pathname])
  useEffect(() => { try { if (localStorage.getItem('floof-sound') === '1') { const on = () => { sound.set(true); removeEventListener('pointerdown', on) }; addEventListener('pointerdown', on) } } catch {} }, [])
  const isApp = loc.pathname !== '/'
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="bg-aurora" /><div className="bg-stars" /><CandyField calm={isApp} /><div className="grain" />
        {!loaded && <Preloader onDone={done} />}
        <Nav />
        <PoofWatcher />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.main key={loc.pathname} className="relative z-10 min-h-screen"
            initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.18 } }}
            transition={{ duration: 0.38, ease: [0.2, 0.8, 0.2, 1] }}>
            {apiError && <div role="alert" className="relative mx-auto max-w-3xl px-4 pt-24 text-sm font-bold text-danger">{apiError} <button className="underline" onClick={() => refresh().catch(() => {})}>Retry connection</button></div>}
            <Suspense fallback={<PageSkeleton />}>{!ready ? <PageSkeleton /> : <>
              <Routes location={loc}>
                <Route path="/" element={<Landing ready={loaded} />} />
                <Route path="/explore" element={<Explore />} />
                <Route path="/create" element={<Create />} />
                <Route path="/coin/:id" element={<CoinLive />} />
                <Route path="/coin/:id/poof" element={<Poof />} />
                <Route path="/trade/:id" element={<Trade />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/creator/:handle" element={<Creator />} />
                <Route path="/truth" element={<Truth />} />
                <Route path="/truth/:ca" element={<Truth />} />
                <Route path="/scouts" element={<Scouts />} />
                <Route path="/docs" element={<Docs />} />
                <Route path="*" element={<Landing ready={loaded} />} />
              </Routes></>}
            </Suspense>
            <Footer />
          </motion.main>
        </AnimatePresence>
        <MobileDock />
        <Toasts />
        <Cursor />
      </LayoutGroup>
    </MotionConfig>
  )
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-28 md:px-6">
      <div className="h-10 w-64 animate-pulse rounded-2xl bg-lav/10" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-3xl bg-lav/5" />)}</div>
    </div>
  )
}
