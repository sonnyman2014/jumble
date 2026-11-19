import { BoundedMap } from '@/lib/bounded-map'
import { randomString } from '@/lib/random'
import { Event } from 'nostr-tools'

export const CROSS_TAB_SYNC_CHANNEL = 'jumble:cross-tab-sync'
export const CROSS_TAB_SYNC_STORAGE_KEY = 'jumble:crossTabSyncEnvelope'

export type TCrossTabSyncPayload =
  | {
      type: 'replaceable-event'
      pubkey: string
      event: Event
    }
  | {
      type: 'notifications-seen-at'
      pubkey: string
      seenAt: number
    }

export type TCrossTabSyncEnvelope = {
  messageId: string
  senderTabId: string
  sentAt: number
  payload: TCrossTabSyncPayload
}

type TCrossTabListener = (payload: TCrossTabSyncPayload) => void

/**
 * NIP-01 replaceable event comparison:
 * newer `created_at` wins; on timestamp tie, lexicographically smaller `id` wins.
 */
export function isNewerOrDifferentReplaceableEvent(
  current: Event | null | undefined,
  incoming: Event
): boolean {
  if (!current) return true
  if (current.id === incoming.id) return false
  if (incoming.created_at !== current.created_at) {
    return incoming.created_at > current.created_at
  }
  return incoming.id < current.id
}

export class CrossTabSyncService {
  static instance: CrossTabSyncService

  readonly tabId: string
  private channel: BroadcastChannel | null = null
  private listeners = new Set<TCrossTabListener>()
  private seenMessageIds = new BoundedMap<string, number>({ maxSize: 256 })
  private storageHandler: ((e: StorageEvent) => void) | null = null

  constructor(tabId = randomString(12)) {
    this.tabId = tabId
    this.setupTransports()
  }

  static getInstance(): CrossTabSyncService {
    if (!CrossTabSyncService.instance) {
      CrossTabSyncService.instance = new CrossTabSyncService()
    }
    return CrossTabSyncService.instance
  }

  private setupTransports() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(CROSS_TAB_SYNC_CHANNEL)
        this.channel.onmessage = (msgEvent: MessageEvent) => {
          this.handleEnvelope(msgEvent.data)
        }
      } catch {
        this.channel = null
      }
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this.storageHandler = (e: StorageEvent) => {
        if (e.key !== CROSS_TAB_SYNC_STORAGE_KEY || !e.newValue) return
        try {
          this.handleEnvelope(JSON.parse(e.newValue))
        } catch {
          // ignore malformed storage payloads
        }
      }
      window.addEventListener('storage', this.storageHandler)
    }
  }

  handleEnvelope(raw: unknown) {
    if (!raw || typeof raw !== 'object') return
    const env = raw as Partial<TCrossTabSyncEnvelope>
    if (
      typeof env.messageId !== 'string' ||
      typeof env.senderTabId !== 'string' ||
      !env.payload ||
      typeof env.payload !== 'object'
    ) {
      return
    }
    if (env.senderTabId === this.tabId) return
    if (this.seenMessageIds.get(env.messageId)) return
    this.seenMessageIds.set(env.messageId, Date.now())

    const payload = env.payload as TCrossTabSyncPayload
    if (payload.type === 'replaceable-event') {
      if (
        typeof payload.pubkey !== 'string' ||
        !payload.event ||
        typeof payload.event.id !== 'string' ||
        typeof payload.event.kind !== 'number' ||
        typeof payload.event.created_at !== 'number'
      ) {
        return
      }
    } else if (payload.type === 'notifications-seen-at') {
      if (typeof payload.pubkey !== 'string' || typeof payload.seenAt !== 'number') {
        return
      }
    } else {
      return
    }

    this.listeners.forEach((listener) => {
      try {
        listener(payload)
      } catch (err) {
        console.error('Cross-tab sync listener failed:', err)
      }
    })
  }

  broadcastReplaceableEvent(pubkey: string, event: Event) {
    this.broadcast({
      type: 'replaceable-event',
      pubkey,
      event
    })
  }

  broadcastNotificationsSeenAt(pubkey: string, seenAt: number) {
    this.broadcast({
      type: 'notifications-seen-at',
      pubkey,
      seenAt
    })
  }

  broadcast(payload: TCrossTabSyncPayload) {
    const envelope: TCrossTabSyncEnvelope = {
      messageId: randomString(16),
      senderTabId: this.tabId,
      sentAt: Date.now(),
      payload
    }
    this.seenMessageIds.set(envelope.messageId, envelope.sentAt)

    if (this.channel) {
      try {
        this.channel.postMessage(envelope)
      } catch {
        // ignore closed channel errors
      }
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(CROSS_TAB_SYNC_STORAGE_KEY, JSON.stringify(envelope))
      } catch {
        // ignore quota errors
      }
    }
  }

  subscribe(listener: TCrossTabListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  destroy() {
    this.listeners.clear()
    if (this.channel) {
      this.channel.close()
      this.channel = null
    }
    if (this.storageHandler && typeof window !== 'undefined') {
      window.removeEventListener('storage', this.storageHandler)
      this.storageHandler = null
    }
  }
}

const crossTabSync = CrossTabSyncService.getInstance()
export default crossTabSync
