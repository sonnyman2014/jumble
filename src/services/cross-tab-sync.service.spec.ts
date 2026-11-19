// @vitest-environment jsdom
import { Event, kinds } from 'nostr-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CROSS_TAB_SYNC_STORAGE_KEY,
  CrossTabSyncService,
  TCrossTabSyncPayload,
  isNewerOrDifferentReplaceableEvent
} from './cross-tab-sync.service'

function makeFollowEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'b'.repeat(64),
    pubkey: '1'.repeat(64),
    created_at: 1_700_000_100,
    kind: kinds.Contacts,
    tags: [['p', '2'.repeat(64)]],
    content: '',
    sig: 'f'.repeat(128),
    ...overrides
  }
}

describe('cross-tab-sync.service', () => {
  const services: CrossTabSyncService[] = []

  afterEach(() => {
    while (services.length) {
      services.pop()?.destroy()
    }
  })

  describe('isNewerOrDifferentReplaceableEvent', () => {
    it('accepts initial event, rejects older or duplicate events, and breaks ties per NIP-01', () => {
      const base = makeFollowEvent({ id: 'b'.repeat(64), created_at: 100 })
      expect(isNewerOrDifferentReplaceableEvent(null, base)).toBe(true)
      expect(isNewerOrDifferentReplaceableEvent(base, base)).toBe(false)

      const older = makeFollowEvent({ id: 'a'.repeat(64), created_at: 99 })
      expect(isNewerOrDifferentReplaceableEvent(base, older)).toBe(false)

      const newer = makeFollowEvent({ id: 'c'.repeat(64), created_at: 101 })
      expect(isNewerOrDifferentReplaceableEvent(base, newer)).toBe(true)

      const tieSmallerId = makeFollowEvent({ id: 'a'.repeat(64), created_at: 100 })
      const tieLargerId = makeFollowEvent({ id: 'c'.repeat(64), created_at: 100 })
      expect(isNewerOrDifferentReplaceableEvent(base, tieSmallerId)).toBe(true)
      expect(isNewerOrDifferentReplaceableEvent(base, tieLargerId)).toBe(false)
    })
  })

  describe('CrossTabSyncService transport & deduplication', () => {
    it('synchronizes follow-list replaceable events across two open tabs and ignores self-echo', () => {
      const tabA = new CrossTabSyncService('tab-a')
      const tabB = new CrossTabSyncService('tab-b')
      services.push(tabA, tabB)

      const receivedByA: TCrossTabSyncPayload[] = []
      const receivedByB: TCrossTabSyncPayload[] = []
      tabA.subscribe((p) => receivedByA.push(p))
      tabB.subscribe((p) => receivedByB.push(p))

      const followEvent = makeFollowEvent()
      tabA.broadcastReplaceableEvent(followEvent.pubkey, followEvent)

      const rawStored = window.localStorage.getItem(CROSS_TAB_SYNC_STORAGE_KEY)
      expect(rawStored).toBeTruthy()

      // Simulate storage event delivery on Tab B (and self-delivery on Tab A)
      tabA.handleEnvelope(JSON.parse(rawStored!))
      tabB.handleEnvelope(JSON.parse(rawStored!))
      // Duplicate delivery (e.g., BroadcastChannel + storage event) must be deduplicated
      tabB.handleEnvelope(JSON.parse(rawStored!))

      expect(receivedByA).toHaveLength(0)
      expect(receivedByB).toHaveLength(1)
      expect(receivedByB[0]).toEqual({
        type: 'replaceable-event',
        pubkey: followEvent.pubkey,
        event: followEvent
      })
    })

    it('synchronizes notifications-seen-at and stops delivering after unsubscribe', () => {
      const tabA = new CrossTabSyncService('tab-a')
      const tabB = new CrossTabSyncService('tab-b')
      services.push(tabA, tabB)

      const spy = vi.fn()
      const unsub = tabB.subscribe(spy)

      tabA.broadcastNotificationsSeenAt('1'.repeat(64), 1_700_000_500)
      const raw1 = JSON.parse(window.localStorage.getItem(CROSS_TAB_SYNC_STORAGE_KEY)!)
      tabB.handleEnvelope(raw1)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith({
        type: 'notifications-seen-at',
        pubkey: '1'.repeat(64),
        seenAt: 1_700_000_500
      })

      unsub()
      tabA.broadcastNotificationsSeenAt('1'.repeat(64), 1_700_000_900)
      const raw2 = JSON.parse(window.localStorage.getItem(CROSS_TAB_SYNC_STORAGE_KEY)!)
      tabB.handleEnvelope(raw2)
      expect(spy).toHaveBeenCalledTimes(1)
    })
  })
})
