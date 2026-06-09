export interface User {
  uid: string
  email: string | null
  phone: string | null
  createdAt: number
}

export interface Alias {
  id: string
  userId: string
  name: string
  isActive: boolean
  schedule: AliasSchedule
  blockedUsers: string[]
  createdAt: number
}

export interface AliasSchedule {
  enabled: boolean
  startTime: string   // "09:00"
  endTime: string     // "18:00"
  days: number[]      // 0=Sun, 1=Mon, ..., 6=Sat
  timezone: string    // "Europe/Amsterdam"
}

export interface Conversation {
  id: string
  participants: string[]          // [userId1, userId2]
  participantAliases: string[]    // [aliasId1, aliasId2]
  lastMessage: LastMessage | null
  updatedAt: number
  typing?: Record<string, boolean>
  lastReadAt?: Record<string, number>  // { [userId]: timestamp }
}

export interface LastMessage {
  content: string
  senderId: string
  type: MessageType
  timestamp: number
}

export type MessageType = 'text' | 'image' | 'video' | 'document' | 'call_missed' | 'call_ended' | 'call_rejected'

export interface Message {
  id: string
  conversationId: string
  senderId: string
  content: string       // for text: message text; for files: empty string or caption
  type: MessageType
  status: 'sent' | 'delivered' | 'read'
  createdAt: number
  deletedAt: number | null
  fileUrl?: string      // blob: URL — in-memory only, not persisted
  fileName?: string
  fileSize?: number
  transferId?: string   // links to fileTransfers/{id} for P2P transfer
}

export type CallStatus = 'ringing' | 'active' | 'ended' | 'rejected' | 'missed'
export type CallType = 'audio' | 'video'

export interface Call {
  id: string
  callerUserId: string
  callerAliasId: string
  calleeAliasId: string
  calleeUserId: string
  type: CallType
  status: CallStatus
  offer: RTCSessionDescriptionInit | null
  answer: RTCSessionDescriptionInit | null
  createdAt: number
}

export interface IceCandidate {
  candidate: string
  sdpMid: string | null
  sdpMLineIndex: number | null
}
