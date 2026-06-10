import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  startAt,
  endAt,
  limit,
  serverTimestamp,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'
import type { Alias, AliasSchedule } from '@/types'

const ALIASES = 'aliases'

export const createAlias = async (
  userId: string,
  name: string,
  description = ''
): Promise<Alias> => {
  const normalized = name.toLowerCase().trim()

  const existing = await getDoc(doc(db, ALIASES, normalized))
  if (existing.exists()) throw new Error('This alias is already taken')

  const aliasData = {
    userId,
    name: normalized,
    description: description.slice(0, 130),
    isActive: true,
    schedule: {
      enabled: false,
      startTime: '09:00',
      endTime: '18:00',
      days: [1, 2, 3, 4, 5],
      timezone: 'Europe/Amsterdam',
    } as AliasSchedule,
    blockedUsers: [] as string[],
    createdAt: serverTimestamp(),
  }

  await setDoc(doc(db, ALIASES, normalized), aliasData)

  return {
    id: normalized,
    ...aliasData,
    createdAt: Date.now(),
  }
}

export const getUserAliases = async (userId: string): Promise<Alias[]> => {
  const q = query(
    collection(db, ALIASES),
    where('userId', '==', userId)
  )
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Alias))
    .sort((a, b) => (a.createdAt as number) - (b.createdAt as number))
}

export const searchAliases = async (prefix: string): Promise<Alias[]> => {
  if (!prefix.trim()) return []
  const normalized = prefix.toLowerCase().trim()
  const q = query(
    collection(db, ALIASES),
    orderBy('name'),
    startAt(normalized),
    endAt(normalized + ''),
    limit(10)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Alias))
}

export const getAlias = async (aliasId: string): Promise<Alias | null> => {
  const snap = await getDoc(doc(db, ALIASES, aliasId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Alias
}

export const updateAliasActive = async (aliasId: string, isActive: boolean) => {
  await updateDoc(doc(db, ALIASES, aliasId), { isActive })
}

export const updateAliasSchedule = async (
  aliasId: string,
  schedule: AliasSchedule
) => {
  await updateDoc(doc(db, ALIASES, aliasId), { schedule })
}

export const blockUser = async (aliasId: string, blockedUserId: string) => {
  const snap = await getDoc(doc(db, ALIASES, aliasId))
  if (!snap.exists()) return
  const current: string[] = snap.data().blockedUsers || []
  if (current.includes(blockedUserId)) return
  await updateDoc(doc(db, ALIASES, aliasId), {
    blockedUsers: [...current, blockedUserId],
  })
}

export const unblockUser = async (aliasId: string, blockedUserId: string) => {
  const snap = await getDoc(doc(db, ALIASES, aliasId))
  if (!snap.exists()) return
  const current: string[] = snap.data().blockedUsers || []
  await updateDoc(doc(db, ALIASES, aliasId), {
    blockedUsers: current.filter((id) => id !== blockedUserId),
  })
}

export const deleteAlias = async (aliasId: string) => {
  await deleteDoc(doc(db, ALIASES, aliasId))
}

export type AliasStatus =
  | { reachable: true }
  | { reachable: false; reason: 'inactive' | 'blocked' | 'schedule'; scheduleInfo?: string }

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function formatScheduleInfo(days: number[], startTime: string, endTime: string): string {
  const dayLabels = days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d])
    .join(', ')
  return `${dayLabels} · ${startTime}–${endTime}`
}

export const getAliasStatus = (alias: Alias, callerUserId: string): AliasStatus => {
  if (!alias.isActive) return { reachable: false, reason: 'inactive' }
  if (alias.blockedUsers.includes(callerUserId)) return { reachable: false, reason: 'blocked' }

  if (alias.schedule.enabled) {
    const now = new Date()
    const tz = alias.schedule.timezone
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    }).formatToParts(now)

    const hour = Number(parts.find((p) => p.type === 'hour')?.value)
    const minute = Number(parts.find((p) => p.type === 'minute')?.value)
    const weekday = parts.find((p) => p.type === 'weekday')?.value || ''
    const currentDay = DAY_MAP[weekday] ?? now.getDay()

    const scheduleInfo = formatScheduleInfo(alias.schedule.days, alias.schedule.startTime, alias.schedule.endTime)

    if (!alias.schedule.days.includes(currentDay)) {
      return { reachable: false, reason: 'schedule', scheduleInfo }
    }

    const currentMinutes = hour * 60 + minute
    const [startH, startM] = alias.schedule.startTime.split(':').map(Number)
    const [endH, endM] = alias.schedule.endTime.split(':').map(Number)
    const startMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM

    if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
      return { reachable: false, reason: 'schedule', scheduleInfo }
    }
  }

  return { reachable: true }
}

export const subscribeAlias = (
  aliasId: string,
  cb: (alias: Alias | null) => void
): Unsubscribe =>
  onSnapshot(doc(db, ALIASES, aliasId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as Alias) : null)
  })

export const isAliasReachable = (alias: Alias, callerUserId: string): boolean => {
  if (!alias.isActive) return false
  if (alias.blockedUsers.includes(callerUserId)) return false

  if (alias.schedule.enabled) {
    const now = new Date()
    const tz = alias.schedule.timezone
    const localTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    }).formatToParts(now)

    const hour = Number(localTime.find((p) => p.type === 'hour')?.value)
    const minute = Number(localTime.find((p) => p.type === 'minute')?.value)
    const dayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    }
    const weekday = localTime.find((p) => p.type === 'weekday')?.value || ''
    const currentDay = dayMap[weekday] ?? now.getDay()

    if (!alias.schedule.days.includes(currentDay)) return false

    const [startH, startM] = alias.schedule.startTime.split(':').map(Number)
    const [endH, endM] = alias.schedule.endTime.split(':').map(Number)
    const currentMinutes = hour * 60 + minute
    const startMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM

    if (currentMinutes < startMinutes || currentMinutes >= endMinutes) return false
  }

  return true
}
