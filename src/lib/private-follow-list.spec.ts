import { describe, expect, it } from 'vitest'
import {
  addFollowTag,
  convertAllPublicFollowsToPrivate,
  detectEncryptedFollowContent,
  parsePrivateFollowTags,
  removeFollowTagFromBoth,
  switchFollowVisibility
} from './private-follow-list'

describe('private-follow-list', () => {
  const alice = 'a'.repeat(64)
  const bob = 'b'.repeat(64)
  const carol = 'c'.repeat(64)

  describe('detectEncryptedFollowContent', () => {
    it('treats empty or legacy NIP-02 plaintext relay JSON as unencrypted', () => {
      expect(detectEncryptedFollowContent('')).toEqual({ isEncrypted: false, isNip04: false })
      expect(detectEncryptedFollowContent(null)).toEqual({ isEncrypted: false, isNip04: false })
      expect(
        detectEncryptedFollowContent('{"wss://nos.lol":{"read":true,"write":true}}')
      ).toEqual({ isEncrypted: false, isNip04: false })
    })

    it('distinguishes NIP-04 (?iv=) from NIP-44 ciphertext', () => {
      expect(detectEncryptedFollowContent('ciphertextBase64==?iv=ivBase64==')).toEqual({
        isEncrypted: true,
        isNip04: true
      })
      expect(detectEncryptedFollowContent('AgB nip44PayloadBase64String==')).toEqual({
        isEncrypted: true,
        isNip04: false
      })
    })
  })

  describe('parsePrivateFollowTags', () => {
    it('parses valid tag matrices and rejects non-array payloads', () => {
      expect(parsePrivateFollowTags('')).toEqual([])
      expect(parsePrivateFollowTags(JSON.stringify([['p', alice, 'wss://nos.lol']]))).toEqual([
        ['p', alice, 'wss://nos.lol']
      ])
      expect(() => parsePrivateFollowTags('{"bad":true}')).toThrow()
    })
  })

  describe('addFollowTag & removeFollowTagFromBoth', () => {
    it('adds public and private follows without duplicating across lists', () => {
      const r1 = addFollowTag([['p', alice]], [], bob, 'private')
      expect(r1.publicTags).toEqual([['p', alice]])
      expect(r1.privateTags).toEqual([['p', bob]])

      // Moving alice from public to private via addFollowTag('private')
      const r2 = addFollowTag(r1.publicTags, r1.privateTags, alice, 'private')
      expect(r2.publicTags).toEqual([])
      expect(r2.privateTags).toEqual([['p', bob], ['p', alice]])

      // Removing bob cleans privateTags
      const r3 = removeFollowTagFromBoth(r2.publicTags, r2.privateTags, bob)
      expect(r3.changed).toBe(true)
      expect(r3.privateTags).toEqual([['p', alice]])
    })
  })

  describe('switchFollowVisibility', () => {
    it('preserves relay hints and petnames when toggling public <-> private', () => {
      const pub = [['p', alice, 'wss://relay.damus.io', 'alice_pet']]
      const toPriv = switchFollowVisibility(pub, [], alice, 'private')
      expect(toPriv.changed).toBe(true)
      expect(toPriv.publicTags).toEqual([])
      expect(toPriv.privateTags).toEqual([['p', alice, 'wss://relay.damus.io', 'alice_pet']])

      const toPub = switchFollowVisibility(toPriv.publicTags, toPriv.privateTags, alice, 'public')
      expect(toPub.changed).toBe(true)
      expect(toPub.privateTags).toEqual([])
      expect(toPub.publicTags).toEqual([['p', alice, 'wss://relay.damus.io', 'alice_pet']])
    })
  })

  describe('convertAllPublicFollowsToPrivate', () => {
    it('moves all public p tags into privateTags, deduplicates overlaps, and keeps non-p tags', () => {
      const publicTags = [
        ['p', alice, 'wss://nos.lol'],
        ['p', bob],
        ['client', 'jumble']
      ]
      const privateTags = [['p', bob], ['p', carol]]

      const res = convertAllPublicFollowsToPrivate(publicTags, privateTags)
      expect(res.movedCount).toBe(2)
      expect(res.publicTags).toEqual([['client', 'jumble']])
      expect(res.privateTags).toEqual([
        ['p', bob],
        ['p', carol],
        ['p', alice, 'wss://nos.lol']
      ])
    })
  })
})
