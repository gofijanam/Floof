import { fakeAddr, hashStr, mulberry32, pick } from './rng'

export type CoinStatus = 'open' | 'upcoming' | 'curve' | 'graduated' | 'refunding'
export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'N/A'
export type Accessory = 'none' | 'bow' | 'leaf' | 'crown' | 'star' | 'boba' | 'halo' | 'sprout' | 'cap' | 'phones'

export interface Creator {
  handle: string; name: string; rep: number; tier: 'Sprout' | 'Puff' | 'Cloud' | 'Legend'
  bondsPosted: number; bondsReturned: number; launches: number; graduated: number; rugs: number
  joined: string; followers: number; bio: string; hue: number; accessory: Accessory; wallet: string
}
export interface Coin {
  image?: string | null
  id: string; ticker: string; name: string; tagline: string; hue: number; accessory: Accessory
  creator: string; status: CoinStatus; ca: string
  // fair window
  windowStart: number; windowEnd: number; durationMs: number
  priceCeiling: number // SOL per token
  windowTokens: number // tokens sold in window
  minTarget: number // SOL
  pledged: number; pledgers: number
  bondSol: number; lockDays: number
  // post-window
  clearingPrice: number; price: number; change24h: number; volume24h: number
  curveSol: number // SOL deposited in LaunchLab curve so far
  holders: number; snipersBlocked: number
  truth: { grade: Grade; score: number; realPct: number; sybilClusters: number; washPct: number }
  createdAgo: number // ms ago
  tags: string[]
}
export const SUPPLY = 1_000_000_000
export const GRADUATE_SOL = 85 // assumption: LaunchLab default graduation threshold (see HANDOFF)
export const FEES = { total: 1, raydium: 0.25, creator: 0.25, platform: 0.5 }

export const maxRaise = (c: Pick<Coin, 'priceCeiling' | 'windowTokens'>) => c.priceCeiling * c.windowTokens
export const walletCap = (c: Pick<Coin, 'priceCeiling' | 'windowTokens'>) => maxRaise(c) * 0.01
export function settle(c: Coin, myPledge = 0) {
  const cap = maxRaise(c)
  const failed = c.pledged < c.minTarget
  const over = c.pledged > cap
  const fill = failed ? 0 : over ? cap / c.pledged : 1
  const raised = failed ? 0 : Math.min(c.pledged, cap)
  const price = failed ? 0 : raised / c.windowTokens
  const myFilled = myPledge * fill
  const myRefund = myPledge - myFilled
  const myTokens = price > 0 ? myFilled / price : 0
  return { cap, failed, over, oversub: c.pledged / cap, fill, raised, price, myFilled, myRefund, myTokens }
}

const ACCS: Accessory[] = ['bow', 'leaf', 'crown', 'star', 'boba', 'halo', 'sprout', 'cap', 'phones', 'none']

export const CREATORS: Creator[] = [
  { handle: 'mochimaker', name: 'Mochi Maker', rep: 94, tier: 'Legend', bondsPosted: 14, bondsReturned: 14, launches: 14, graduated: 9, rugs: 0, joined: 'Mar 2026', followers: 18420, bio: 'Baking squishy coins since the first fair window. Bond always returned, LP always locked.', hue: 200, accessory: 'crown', wallet: 'MoCH1mkr9pQ2vXc7Lw4Rz8TnYb3sKfEuGd6hJaV5' },
  { handle: 'cloudkitchen', name: 'Cloud Kitchen', rep: 88, tier: 'Cloud', bondsPosted: 9, bondsReturned: 9, launches: 9, graduated: 5, rugs: 0, joined: 'May 2026', followers: 9310, bio: 'Food-themed floofs. Every launch ships with a meme pack and a locked bond.', hue: 330, accessory: 'boba', wallet: 'CLdK1tcHn4Wq8PzR2vL6mXy9bT3sFgE7uJaD5hK' },
  { handle: 'yuzu_dev', name: 'yuzu.dev', rep: 81, tier: 'Cloud', bondsPosted: 6, bondsReturned: 6, launches: 6, graduated: 3, rugs: 0, joined: 'Jun 2026', followers: 5120, bio: 'Citrus energy. Ships tools for holders, not exits.', hue: 50, accessory: 'leaf', wallet: 'YuZu7dEv3Kq9WpR2mL8xN4bT6sFgH5jCaV1zD' },
  { handle: 'pastelwizard', name: 'Pastel Wizard', rep: 76, tier: 'Puff', bondsPosted: 4, bondsReturned: 4, launches: 4, graduated: 2, rugs: 0, joined: 'Aug 2026', followers: 3870, bio: 'Casts gentle spells on charts. ✨', hue: 275, accessory: 'star', wallet: 'PsTW1z4rD9qK2mL7xN3bT8vR5sFgH6jCaE1uY' },
  { handle: 'snootlab', name: 'Snoot Lab', rep: 69, tier: 'Puff', bondsPosted: 3, bondsReturned: 3, launches: 3, graduated: 1, rugs: 0, joined: 'Sep 2026', followers: 2210, bio: 'Research-grade boops.', hue: 160, accessory: 'phones', wallet: 'SnT9La8bQ2wK4mL7xR3zN5vT6sFgH1jCaE9uD' },
  { handle: 'newfloof', name: 'newfloof', rep: 52, tier: 'Sprout', bondsPosted: 1, bondsReturned: 0, launches: 1, graduated: 0, rugs: 0, joined: 'Nov 2026', followers: 310, bio: 'First launch! Be gentle. Bond is posted 🙏', hue: 120, accessory: 'sprout', wallet: 'NwF1o0f3Kq8WpR2mL9xN4bT7sFgH5jCaV6zD' },
]
let apiCreators: Creator[] = []
export const setCreators = (creators: Creator[]) => { apiCreators = creators }
const emptyCreator: Creator = {handle:'pending',name:'Creator',rep:0,tier:'Sprout',bondsPosted:0,bondsReturned:0,launches:0,graduated:0,rugs:0,joined:'—',followers:0,bio:'',hue:200,accessory:'none',wallet:''}
export const creatorBy = (h: string) => apiCreators.find((c) => c.handle === h) ?? {...emptyCreator,handle:h,name:h}

type Seed = [string, string, string, number, Accessory, string, CoinStatus, Grade, string[]]
const SEEDS: Seed[] = [
  ['floof', 'FLOOF', 'floof.fun', 205, 'halo', 'mochimaker', 'open', 'A+', ['official', 'platform']],
  ['mochi', 'MOCHI', 'Mochi Mochi', 195, 'bow', 'mochimaker', 'open', 'A', ['meme', 'kawaii']],
  ['boba', 'BOBA', 'Boba Blob', 330, 'boba', 'cloudkitchen', 'open', 'A', ['food']],
  ['yuzu', 'YUZU', 'Yuzu Puff', 52, 'leaf', 'yuzu_dev', 'open', 'B', ['utility']],
  ['blep', 'BLEP', 'Blep', 300, 'none', 'newfloof', 'open', 'C', ['meme']],
  ['kumo', 'KUMO', 'Kumo Cloud', 220, 'star', 'pastelwizard', 'upcoming', 'A', ['art']],
  ['dango', 'DANGO', 'Dango Trio', 340, 'sprout', 'cloudkitchen', 'upcoming', 'A', ['food']],
  ['snoot', 'SNOOT', 'Snoot Boop', 165, 'phones', 'snootlab', 'upcoming', 'B', ['meme']],
  ['tofu', 'TOFU', 'Tofu Toes', 40, 'cap', 'yuzu_dev', 'upcoming', 'B', ['meme']],
  ['puff', 'PUFF', 'Puff Daddy Mochi', 285, 'crown', 'mochimaker', 'curve', 'A+', ['meme']],
  ['momo', 'MOMO', 'Momo Peach', 350, 'bow', 'pastelwizard', 'curve', 'A', ['kawaii']],
  ['wiggle', 'WIGGLE', 'Wiggle', 180, 'star', 'snootlab', 'curve', 'B', ['meme']],
  ['sugar', 'SUGAR', 'Sugar Cube', 15, 'none', 'newfloof', 'curve', 'D', ['meme']],
  ['nubs', 'NUBS', 'Nub Ears', 210, 'cap', 'mochimaker', 'graduated', 'A+', ['og']],
  ['pipi', 'PIPI', 'Pipi Bird Mochi', 140, 'sprout', 'cloudkitchen', 'graduated', 'A', ['meme']],
  ['cloudy', 'CLOUDY', 'Cloudy Days', 240, 'halo', 'pastelwizard', 'graduated', 'A', ['art']],
]
const TAGLINES: Record<string, string> = {
  floof: 'The platform coin. Launched the fair way, like everything here.',
  mochi: 'Soft, round, and absolutely unsnipeable.', boba: 'Chewy pearls of pure community.',
  yuzu: 'Zesty utility floof with holder tools.', blep: 'Tongue out. Bags up.',
  kumo: 'A cloud that paints the sky pastel.', dango: 'Three friends on a stick. Fair-launched.',
  snoot: 'Boop the snoot, join the window.', tofu: 'Wobbly, wholesome, wonderful.',
  puff: 'The puffiest king of the curve.', momo: 'Peachy keen and pink.', wiggle: 'Can’t stop, won’t stop wiggling.',
  sugar: 'Sweet… maybe too sweet. Check TRUTH.', nubs: 'Little ears, big graduation.',
  pipi: 'Tweet tweet, it’s on Raydium.', cloudy: 'Overcast with a chance of gains.',
}
const GRADE_TRUTH: Record<Grade, [number, number, number, number]> = {
  'N/A': [0,0,0,0], 'A+': [97, 98, 0, 1], A: [90, 93, 1, 3], B: [78, 84, 2, 7], C: [63, 71, 4, 14], D: [41, 52, 9, 31],
}

export function buildCoins(now: number): Coin[] {
  return SEEDS.map(([id, ticker, name, hue, accessory, creator, status, grade, tags], i) => {
    const r = mulberry32(hashStr(id) + 7)
    const durationMs = 10 * 60 * 1000
    const windowTokens = 300_000_000
    const priceCeiling = [4e-7, 3.5e-7, 3e-7, 2.6e-7, 2.2e-7][i % 5]
    const cap = priceCeiling * windowTokens
    const minTarget = Math.round(cap * (0.25 + r() * 0.15))
    let windowEnd = now, pledged = 0, pledgers = 0
    if (status === 'open') {
      const left = id === 'floof' ? 7 * 60e3 + 42e3 : (1.5 + r() * 8) * 60e3
      windowEnd = now + left
      const elapsed = 1 - left / durationMs
      const target = id === 'blep' ? 0.35 : id === 'yuzu' ? 0.8 : 0.9 + r() * 0.5
      pledged = cap * target * Math.min(1, 0.25 + elapsed)
      pledgers = Math.round(pledged / (0.18 + r() * 0.2))
    } else if (status === 'upcoming') {
      windowEnd = now + (14 + i * 9 + r() * 20) * 60e3 + durationMs
    } else {
      windowEnd = now - (1 + r() * 30) * 3600e3 * (status === 'graduated' ? 4 : 1)
      pledged = cap * (1.1 + r() * 1.4)
      pledgers = Math.round(pledged / (0.2 + r() * 0.2))
    }
    const clearing = status === 'curve' || status === 'graduated' ? priceCeiling : 0
    const mult = status === 'graduated' ? 3 + r() * 9 : 1.1 + r() * 1.6
    const [score, realPct, sybil, wash] = GRADE_TRUTH[grade]
    return {
      id, ticker, name, tagline: TAGLINES[id], hue, accessory, creator, status,
      ca: fakeAddr(r, 44, 'fLF'),
      windowStart: windowEnd - durationMs, windowEnd, durationMs, priceCeiling, windowTokens, minTarget,
      pledged, pledgers,
      bondSol: [10, 5, 5, 2, 1][Math.floor(r() * 5)] * (creator === 'mochimaker' ? 2 : 1), lockDays: [30, 60, 90, 180][Math.floor(r() * 4)],
      clearingPrice: clearing, price: clearing * mult, change24h: (r() - 0.35) * 80,
      volume24h: status === 'open' || status === 'upcoming' ? 0 : (40 + r() * 900) * 1000,
      curveSol: status === 'graduated' ? GRADUATE_SOL : status === 'curve' ? 12 + r() * 64 : 0,
      holders: status === 'open' || status === 'upcoming' ? 0 : Math.round(pledgers * (1.2 + r() * 2.5)),
      snipersBlocked: status === 'upcoming' ? 0 : Math.round(30 + r() * 900),
      truth: { grade, score: score + Math.round(r() * 2), realPct: realPct + r() * 1.5, sybilClusters: sybil, washPct: wash + r() * 2 },
      createdAgo: (1 + r() * 40) * 3600e3, tags,
    }
  })
}

const NAMES = ['mochi.sol', 'puffpuff', 'blobfren', 'kawaii_k', 'sol_sakura', 'dango.eth', 'floofer', 'noodle', 'cottoncat', 'boop_lord', 'pastelpaws', 'bun.sol', 'gummy', 'squishy', 'jellybean', 'marsh', 'nyan.sol', 'cloud9', 'momo_fan', 'yuzuzu', 'tofu.sol', 'sprinkle', 'nibbles', 'lilpuff']
export function randomWallet(r: () => number = Math.random) {
  return r() < 0.55 ? pick(r, NAMES) : fakeAddr(r, 8)
}

export function priceSeries(seed: string, n: number, start: number, end: number, vol = 0.06) {
  const r = mulberry32(hashStr(seed))
  const out: number[] = []
  let v = start
  for (let i = 0; i < n; i++) {
    const drift = (end - v) / (n - i + 4)
    v = Math.max(start * 0.4, v + drift + (r() - 0.5) * vol * v)
    out.push(v)
  }
  out[n - 1] = end
  return out
}

export function holdersFor(c: Coin) {
  const r = mulberry32(hashStr(c.id + 'h'))
  const rows = Array.from({ length: 10 }, (_, i) => ({ wallet: i === 0 ? 'LaunchLab curve' : randomWallet(r), pct: 0, tag: i === 0 ? 'curve' : r() < 0.25 ? 'window' : r() < 0.2 ? 'scout' : '' }))
  let left = 100
  rows.forEach((row, i) => { const p = i === 0 ? 18 + r() * 20 : Math.min(left, (0.3 + r() * 0.9) * (i < 3 ? 1.1 : 0.7)); row.pct = p; left -= p })
  return rows
}

export interface Ticket { coin: string; ticker: string; hue: number; accessory: Accessory; no: number; date: string; pledged: number; filled: number; rarity: 'Gold' | 'Ice' | 'Candy' }
export const MY_TICKETS: Ticket[] = [
  { coin: 'puff', ticker: 'PUFF', hue: 285, accessory: 'crown', no: 42, date: 'Nov 6', pledged: 1.2, filled: 0.61, rarity: 'Gold' },
  { coin: 'nubs', ticker: 'NUBS', hue: 210, accessory: 'cap', no: 7, date: 'Nov 2', pledged: 0.9, filled: 0.9, rarity: 'Ice' },
  { coin: 'pipi', ticker: 'PIPI', hue: 140, accessory: 'sprout', no: 318, date: 'Oct 29', pledged: 0.5, filled: 0.33, rarity: 'Candy' },
  { coin: 'momo', ticker: 'MOMO', hue: 350, accessory: 'bow', no: 96, date: 'Oct 24', pledged: 1.05, filled: 0.7, rarity: 'Candy' },
]
export const MY_POSITIONS = [
  { coin: 'puff', tokens: 2_740_000, cost: 0.61 },
  { coin: 'nubs', tokens: 3_000_000, cost: 0.9 },
  { coin: 'momo', tokens: 1_980_000, cost: 0.7 },
  { coin: 'pipi', tokens: 1_210_000, cost: 0.33 },
]
export const MY_CLAIMS = [
  { id: 'c1', kind: 'refund' as const, coin: 'puff', amount: 0.59, note: 'Oversubscribed 1.97× — pro-rata refund' },
  { id: 'c2', kind: 'scout' as const, coin: 'nubs', amount: 0.214, note: 'Scout reward · held through graduation' },
  { id: 'c3', kind: 'scout' as const, coin: 'pipi', amount: 0.087, note: 'Scout reward · week 2 streak' },
]

export const SCOUTS = Array.from({ length: 24 }, (_, i) => {
  const r = mulberry32(900 + i)
  return {
    rank: i + 1, wallet: i === 6 ? 'you · 7fLo…oF5u' : randomWallet(r),
    points: Math.round(48000 / (1 + i * 0.32) + r() * 600), windows: Math.round(42 - i * 1.3 + r() * 4),
    hold: Math.round(88 - i * 1.1 + r() * 6), earned: +(12 / (1 + i * 0.4) + r()).toFixed(2),
    hue: Math.floor(r() * 360), accessory: ACCS[Math.floor(r() * ACCS.length)], me: i === 6,
  }
})

export const ME = { wallet: '7fLoQ2mX9vRk3bT8nW4zP6sY1cJ5hGdE2aUoF5u', short: '7fLo…oF5u', sol: 12.48, scoutPoints: SCOUTS[6].points, scoutRank: 7 }
