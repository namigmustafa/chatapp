import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  updateProfile,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { Capacitor } from '@capacitor/core'
import { auth, db } from './firebase'
import { setOffline } from './presence'

const googleProvider = new GoogleAuthProvider()

export const signUpWithEmail = async (email: string, password: string, displayName: string) => {
  if (Capacitor.isNativePlatform()) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication')
    await FirebaseAuthentication.createUserWithEmailAndPassword({ email, password })
    const user = auth.currentUser!
    await updateProfile(user, { displayName })
    await setDoc(doc(db, 'users', user.uid), {
      email,
      displayName,
      phone: null,
      createdAt: serverTimestamp(),
    })
    return user
  }
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(cred.user, { displayName })
  await setDoc(doc(db, 'users', cred.user.uid), {
    email,
    displayName,
    phone: null,
    createdAt: serverTimestamp(),
  })
  return cred.user
}

export const signInWithEmail = async (email: string, password: string) => {
  if (Capacitor.isNativePlatform()) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication')
    await FirebaseAuthentication.signInWithEmailAndPassword({ email, password })
    return auth.currentUser
  }
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider)
    const user = result.user
    const existing = await getDoc(doc(db, 'users', user.uid))
    if (!existing.exists()) {
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        displayName: user.displayName,
        phone: user.phoneNumber ?? null,
        createdAt: serverTimestamp(),
      })
    }
    return user
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
      return signInWithRedirect(auth, googleProvider)
    }
    throw err
  }
}

export const handleGoogleRedirect = async () => {
  const result = await getRedirectResult(auth)
  if (!result) return null
  const user = result.user
  const existing = await getDoc(doc(db, 'users', user.uid))
  if (!existing.exists()) {
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      displayName: user.displayName,
      phone: user.phoneNumber ?? null,
      createdAt: serverTimestamp(),
    })
  }
  return user
}

export const setupRecaptcha = (containerId: string) => {
  return new RecaptchaVerifier(auth, containerId, { size: 'invisible' })
}

export const sendPhoneOtp = async (
  phone: string,
  recaptchaVerifier: RecaptchaVerifier
) => {
  return signInWithPhoneNumber(auth, phone, recaptchaVerifier)
}

export const signOut = async (userId?: string) => {
  if (userId) await setOffline(userId)
  return firebaseSignOut(auth)
}

export const getUserProfile = async (uid: string) => {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? snap.data() : null
}

export const onAuthChange = (cb: (user: FirebaseUser | null) => void) => {
  return onAuthStateChanged(auth, cb)
}
