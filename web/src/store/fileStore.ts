import { create } from 'zustand'

interface FileStore {
  blobUrls: Record<string, string>   // messageId → blob: URL
  progress: Record<string, number>   // transferId → 0-100
  setBlobUrl: (messageId: string, url: string) => void
  setProgress: (transferId: string, pct: number) => void
  clearProgress: (transferId: string) => void
}

export const useFileStore = create<FileStore>((set) => ({
  blobUrls: {},
  progress: {},
  setBlobUrl: (messageId, url) =>
    set((s) => ({ blobUrls: { ...s.blobUrls, [messageId]: url } })),
  setProgress: (transferId, pct) =>
    set((s) => ({ progress: { ...s.progress, [transferId]: pct } })),
  clearProgress: (transferId) =>
    set((s) => {
      const { [transferId]: _, ...rest } = s.progress
      return { progress: rest }
    }),
}))
