import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useFileStore } from '@/store/fileStore'
import {
  subscribeIncomingTransfers,
  setTransferAnswer,
  sendTransferIce,
  subscribeTransferIce,
  type FileTransferMeta,
} from '@/services/fileTransfer'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

export function useFileTransferReceiver() {
  const { user } = useAuthStore()
  const { setBlobUrl } = useFileStore()
  const unsubsRef = useRef<(() => void)[]>([])

  useEffect(() => {
    if (!user) return

    const unsubIncoming = subscribeIncomingTransfers(user.uid, (meta) => {
      receiveFile(meta)
    })
    unsubsRef.current.push(unsubIncoming)

    return () => {
      unsubsRef.current.forEach((u) => u())
      unsubsRef.current = []
    }
  }, [user?.uid])

  const receiveFile = (meta: FileTransferMeta) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const chunks: ArrayBuffer[] = []

    pc.ondatachannel = (e) => {
      const dc = e.channel
      dc.binaryType = 'arraybuffer'

      dc.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          try {
            const msg = JSON.parse(ev.data) as { type: string; messageId?: string }
            if (msg.type === 'done') {
              const blob = new Blob(chunks, { type: meta.fileType })
              const url = URL.createObjectURL(blob)
              // msg.messageId from sender, or fall back to meta.messageId
              setBlobUrl(msg.messageId ?? meta.messageId, url)
              pc.close()
            }
          } catch {
            // ignore parse errors
          }
        } else {
          chunks.push(ev.data as ArrayBuffer)
        }
      }
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) sendTransferIce(meta.id, 'receiver', candidate.toJSON()).catch(() => {})
    }

    // Buffer sender ICE candidates until setRemoteDescription is done
    let remoteDescSet = false
    const pendingIce: RTCIceCandidateInit[] = []

    const unsubIce = subscribeTransferIce(meta.id, 'sender', (ice) => {
      if (remoteDescSet) {
        pc.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {})
      } else {
        pendingIce.push(ice)
      }
    })
    unsubsRef.current.push(unsubIce)

    const setup = async () => {
      await pc.setRemoteDescription(new RTCSessionDescription(meta.offer))
      remoteDescSet = true
      for (const ice of pendingIce) {
        pc.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {})
      }
      pendingIce.length = 0

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await setTransferAnswer(meta.id, answer)
    }

    setup().catch((e) => console.error('[fileReceiver] setup failed', e))
  }
}
