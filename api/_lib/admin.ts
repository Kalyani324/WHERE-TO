import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'

let app: App | undefined

function init(): App {
  if (app) return app
  if (getApps().length) return (app = getApps()[0])
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'demo-whereto'
  const databaseURL = process.env.FIREBASE_DATABASE_URL || `http://127.0.0.1:9000?ns=${projectId}-default-rtdb`
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  if (sa && !process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    const json = JSON.parse(sa.trim().startsWith('{') ? sa : Buffer.from(sa, 'base64').toString('utf8'))
    app = initializeApp({ credential: cert(json), databaseURL, projectId: json.project_id })
  } else {
    app = initializeApp({ projectId, databaseURL })
  }
  return app
}

export const db = () => getDatabase(init())
export const auth = () => getAuth(init())
