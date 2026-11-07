import { useSyncExternalStore } from 'react'
import { sound } from './audio'
export const useSound = () => useSyncExternalStore((cb) => sound.subscribe(cb), () => sound.on)
