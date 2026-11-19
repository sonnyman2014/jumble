// @vitest-environment jsdom
import { Event, kinds } from 'nostr-tools'
import { beforeEach, describe, expect, it } from 'vitest'
import { isDiscoveryRelayFeed, shouldHideFollowedEvent } from './hide-followed'
import storage from '@/services/local-storage.service'

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'e'.repeat(64),
    pubkey: '1'.repeat(64),
    created_at: 1_700_000_000,
    kind: kinds.ShortTextNote,
    tags: [],
    content: 'ola nostr',
    sig: 'f'.repeat(128),
    ...overrides
  }
}

describe('hide-followed', () => {
  const me = '0'.repeat(64)
  const alice = 'a'.repeat(64)
  const bob = 'b'.repeat(64)
  const carol = 'c'.repeat(64)

  describe('isDiscoveryRelayFeed', () => {
    it('matches relay-set and single-relay feed ids only', () => {
      expect(isDiscoveryRelayFeed('relays-pt-feed')).toBe(true)
      expect(isDiscoveryRelayFeed('relay-wss://feeds.nostr.band/lang/pt')).toBe(true)
      expect(isDiscoveryRelayFeed('following')).toBe(false)
      expect(isDiscoveryRelayFeed('pinned')).toBe(false)
      expect(isDiscoveryRelayFeed('trending')).toBe(false)
      expect(isDiscoveryRelayFeed('')).toBe(false)
      expect(isDiscoveryRelayFeed(undefined)).toBe(false)
    })
  })

  describe('shouldHideFollowedEvent', () => {
    const following = new Set([alice, bob])

    it('keeps notes from unfollowed authors visible', () => {
      expect(shouldHideFollowedEvent(makeEvent({ pubkey: carol }), following, me)).toBe(false)
    })

    it('hides notes authored by followed users', () => {
      expect(shouldHideFollowedEvent(makeEvent({ pubkey: alice }), following, me)).toBe(true)
    })

    it('hides reposts whose original author is followed', () => {
      const repost = makeEvent({
        kind: kinds.Repost,
        pubkey: carol,
        tags: [['e', '9'.repeat(64)], ['p', alice]],
        content: ''
      })
      expect(shouldHideFollowedEvent(repost, following, me)).toBe(true)
    })

    it('hides reposts made by a followed user even when original author is unfollowed', () => {
      const repost = makeEvent({
        kind: kinds.GenericRepost,
        pubkey: bob,
        tags: [['e', '8'.repeat(64)], ['p', carol]],
        content: ''
      })
      expect(shouldHideFollowedEvent(repost, following, me)).toBe(true)
    })

    it('keeps reposts between unfollowed users visible', () => {
      const repost = makeEvent({
        kind: kinds.Repost,
        pubkey: carol,
        tags: [['e', '7'.repeat(64)], ['p', 'd'.repeat(64)]],
        content: ''
      })
      expect(shouldHideFollowedEvent(repost, following, me)).toBe(false)
    })

    it('never hides the active account own note even if self-followed', () => {
      const withSelf = new Set([me, alice])
      expect(shouldHideFollowedEvent(makeEvent({ pubkey: me }), withSelf, me)).toBe(false)
    })

    it('returns false when following set is empty', () => {
      expect(shouldHideFollowedEvent(makeEvent({ pubkey: alice }), new Set(), me)).toBe(false)
    })
  })

  describe('per-feed storage persistence', () => {
    beforeEach(() => {
      window.localStorage.clear()
    })

    it('persists hide-followed state independently per relay set feedId', () => {
      expect(storage.getHideFollowedInFeed('relays-pt')).toBe(false)
      expect(storage.getHideFollowedInFeed('relays-en')).toBe(false)

      storage.setHideFollowedInFeed('relays-pt', true)
      expect(storage.getHideFollowedInFeed('relays-pt')).toBe(true)
      expect(storage.getHideFollowedInFeed('relays-en')).toBe(false)

      storage.setHideFollowedInFeed('relays-pt', false)
      expect(storage.getHideFollowedInFeed('relays-pt')).toBe(false)
    })
  })
})
