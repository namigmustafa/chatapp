import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
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

// Email/password uses the Firebase JS SDK directly in both web and native WebView.
// Using the Capacitor native plugin for email auth doesn't sync auth state to the
// JS SDK automatically, causing auth.currentUser to be null after sign-in.
export const signUpWithEmail = async (email: string, password: string, displayName: string) => {
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
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

const isMobileBrowser = () =>
  !Capacitor.isNativePlatform() && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

export const signInWithGoogle = async () => {
  // Native: use Capacitor plugin for the native Google sign-in sheet,
  // then exchange the credential with the JS SDK so onAuthStateChanged fires.
  if (Capacitor.isNativePlatform()) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication')
    const result = await FirebaseAuthentication.signInWithGoogle()
    const idToken = result.credential?.idToken
    if (!idToken) throw new Error('Google sign-in failed: no ID token returned')
    const credential = GoogleAuthProvider.credential(idToken, result.credential?.accessToken ?? undefined)
    const userCredential = await signInWithCredential(auth, credential)
    const user = userCredential.user
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
  // Mobile browsers block popups — use redirect
  if (isMobileBrowser()) {
    return signInWithRedirect(auth, googleProvider)
  }
  // Desktop web: popup
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
  if (Capacitor.isNativePlatform()) {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication')
      await FirebaseAuthentication.signOut()
    } catch {}
  }
  return firebaseSignOut(auth)
}

export const getUserProfile = async (uid: string) => {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? snap.data() : null
}

export const onAuthChange = (cb: (user: FirebaseUser | null) => void) => {
  return onAuthStateChanged(auth, cb)
}
