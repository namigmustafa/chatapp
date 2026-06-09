import { useCallback } from 'react'
import { doc, collection } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/store/authStore'
import { useFileStore } from '@/store/fileStore'
import { sendFileMessage } from '@/services/messages'
import {
  createTransferOffer,
  subscribeTransfer,
  sendTransferIce,
  subscribeTransferIce,
  cleanupTransfer,
} from '@/services/fileTransfer'

const CHUNK_SIZE = 16 * 1024
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

export function useFileTransfer() {
  const { user } = useAuthStore()
  const { setBlobUrl, setProgress, clearProgress } = useFileStore()

  const sendFile = useCallback(
    async (conversationId: string, toUserId: string, file: File) => {
      if (!user) return

      const fileType = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
        ? 'video'
        : 'document'

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      const dc = pc.createDataChannel('file', { ordered: true })

      // Buffer ICE candidates — they fire as soon as setLocalDescription is called,
      // before transferId is known. Flush after transferId resolves.
      const iceBuffer: RTCIceCandidateInit[] = []
      let resolvedTransferId: string | null = null
      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) return
        const ice = candidate.toJSON()
        if (resolvedTransferId) {
          sendTransferIce(resolvedTransferId, 'sender', ice).catch(() => {})
        } else {
          iceBuffer.push(ice)
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)   // ICE gathering starts here

      // Pre-generate message ID so blob URL is in store BEFORE onSnapshot fires
      const messageId = doc(collection(db, 'messages')).id
      setBlobUrl(messageId, URL.createObjectURL(file))

      resolvedTransferId = await createTransferOffer({
        conversationId,
        messageId,
        fromUserId: user.uid,
        toUserId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        offer,
      })
      const transferId = resolvedTransferId

      // Flush any ICE candidates that arrived before transferId was known
      for (const ice of iceBuffer) {
        sendTransferIce(transferId, 'sender', ice).catch(() => {})
      }

      await sendFileMessage(
        conversationId,
        user.uid,
        fileType,
        file.name,
        file.size,
        transferId,
        messageId,
      )

      // Buffer receiver's ICE candidates until setRemoteDescription is done
      let remoteDescSet = false
      const pendingIce: RTCIceCandidateInit[] = []

      const unsubIce = subscribeTransferIce(transferId, 'receiver', (ice) => {
        if (remoteDescSet) {
          pc.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {})
        } else {
          pendingIce.push(ice)
        }
      })

      const unsubTransfer = subscribeTransfer(transferId, async (meta) => {
        if (!meta?.answer) return
        if (pc.signalingState !== 'have-local-offer') return
        await pc.setRemoteDescription(new RTCSessionDescription(meta.answer)).catch(() => {})
        remoteDescSet = true
        for (const ice of pendingIce) {
          pc.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {})
        }
        pendingIce.length = 0
      })

      dc.onopen = async () => {
        const buffer = await file.arrayBuffer()
        const total = Math.ceil(buffer.byteLength / CHUNK_SIZE)
        setProgress(transferId, 0)

        for (let i = 0; i < total; i++) {
          const chunk = buffer.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
          // Back-pressure: wait for buffer to drain
          while (dc.bufferedAmount > 256 * 1024) {
            await new Promise((r) => setTimeout(r, 10))
          }
          dc.send(chunk)
          setProgress(transferId, Math.round(((i + 1) / total) * 100))
        }

        dc.send(JSON.stringify({ type: 'done', messageId }))
        clearProgress(transferId)
        unsubTransfer()
        unsubIce()
        setTimeout(() => cleanupTransfer(transferId), 5000)
      }

      dc.onerror = () => {
        clearProgress(transferId)
        unsubTransfer()
        unsubIce()
      }
    },
    [user, setBlobUrl, setProgress, clearProgress]
  )

  return { sendFile }
}
