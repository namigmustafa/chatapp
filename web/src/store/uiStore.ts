import { create } from 'zustand'

export interface ToastNotif {
  id: string
  title: string
  body: string
  convId: string
}

interface UIState {
  activeConvId: string | null
  pendingNavConvId: string | null
  callFromBackground: boolean
  toast: ToastNotif | null
  pendingCallKitAction: 'answer' | 'decline' | null
  setActiveConvId: (id: string | null) => void
  setPendingNavConvId: (id: string | null) => void
  setCallFromBackground: (val: boolean) => void
  setToast: (toast: ToastNotif | null) => void
  setPendingCallKitAction: (action: 'answer' | 'decline' | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeConvId: null,
  pendingNavConvId: null,
  callFromBackground: false,
  toast: null,
  pendingCallKitAction: null,
  setActiveConvId: (id) => set({ activeConvId: id }),
  setPendingNavConvId: (id) => set({ pendingNavConvId: id }),
  setCallFromBackground: (val) => set({ callFromBackground: val }),
  setToast: (toast) => set({ toast }),
  setPendingCallKitAction: (action) => set({ pendingCallKitAction: action }),
}))
