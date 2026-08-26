importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js')

// Service workers run in their own global scope and can't read import.meta.env
// (self.FIREBASE_API_KEY etc. were never actually set anywhere — always
// undefined, which is why Firebase Installations rejected this with "Missing
// App configuration value: projectId"). These are public, client-side Firebase
// config values (safe to hardcode, not secrets) — must be kept in sync with
// web/.env.local / the VITE_FIREBASE_* GitHub Actions secrets by hand, since a
// service worker file can't be templated by Vite's env injection at build time.
firebase.initializeApp({
  apiKey: 'AIzaSyB6gPKufQdqI40CtkUWIGT8bgGsCg7gtvw',
  authDomain: 'chatapp-48786.firebaseapp.com',
  projectId: 'chatapp-48786',
  storageBucket: 'chatapp-48786.firebasestorage.app',
  messagingSenderId: '656202089228',
  appId: '1:656202089228:web:e00f6ceb02a932fae23f29',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {}
  if (!title) return

  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    data: payload.data,
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      if (clientList.length > 0) {
        clientList[0].focus()
      } else {
        clients.openWindow('/')
      }
    })
  )
})
