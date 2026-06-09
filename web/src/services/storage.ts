import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage } from './firebase'

export type UploadProgress = (pct: number) => void

export const uploadFile = (
  conversationId: string,
  file: File,
  onProgress?: UploadProgress
): Promise<{ url: string; name: string; size: number }> => {
  return new Promise((resolve, reject) => {
    const path = `messages/${conversationId}/${Date.now()}_${file.name}`
    const storageRef = ref(storage, path)
    const task = uploadBytesResumable(storageRef, file)

    task.on(
      'state_changed',
      (snap) => {
        onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100))
      },
      reject,
      async () => {
        const url = await getDownloadURL(task.snapshot.ref)
        resolve({ url, name: file.name, size: file.size })
      }
    )
  })
}
