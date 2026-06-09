import { create } from 'zustand'
import type { User as FirebaseUser } from 'firebase/auth'

interface AuthState {
  user: FirebaseUser | null
  loading: boolean
  setUser: (user: FirebaseUser | null) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user, loading: false }),
  setLoading: (loading) => set({ loading }),
}))
