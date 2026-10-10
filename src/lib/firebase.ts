import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase } from 'firebase/database'

const env = import.meta.env
const useEmulator = env.VITE_USE_EMULATOR === '1'
const projectId = env.VITE_FIREBASE_PROJECT_ID || 'demo-whereto'

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || `http://127.0.0.1:9000?ns=${projectId}-default-rtdb`,
  projectId,
  appId: env.VITE_FIREBASE_APP_ID,
})

export const auth = getAuth(app)
export const db = getDatabase(app)

if (useEmulator) {
  // Same host the page was loaded from, so phones on the LAN can reach the emulator.
  const host = location.hostname === 'localhost' ? '127.0.0.1' : location.hostname
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectDatabaseEmulator(db, host, 9000)
}

let ready: Promise<User> | null = null
export function signIn(): Promise<User> {
  ready ??= new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, (u) => {
      if (u) {
        off()
        resolve(u)
      }
    })
    signInAnonymously(auth).catch((e) => {
      off()
      ready = null
      reject(e)
    })
  })
  return ready
}
