import { Event, kinds } from 'nostr-tools'
import { getEventAuthorPubkey } from './event-core'

export function isDiscoveryRelayFeed(feedId?: string | null): boolean {
  if (!feedId) return false
  return feedId.startsWith('relays-') || feedId.startsWith('relay-')
}

function getRepostTargetAuthors(event: Event): string[] {
  if (event.kind !== kinds.Repost && event.kind !== kinds.GenericRepost) {
    return []
  }
  const authors = new Set<string>()
  for (const tag of event.tags) {
    if (tag[0] === 'p' && tag[1]) {
      authors.add(tag[1])
    } else if (tag[0] === 'a' && tag[1]) {
      const parts = tag[1].split(':')
      if (parts.length >= 2 && parts[1]) {
        authors.add(parts[1])
      }
    }
  }
  if (event.content) {
    try {
      const embedded = JSON.parse(event.content) as Partial<Event>
      if (typeof embedded?.pubkey === 'string' && embedded.pubkey) {
        authors.add(embedded.pubkey)
      }
    } catch {
      // ignore malformed repost content
    }
  }
  return Array.from(authors)
}

export function shouldHideFollowedEvent(
  event: Event,
  followingSet: ReadonlySet<string>,
  accountPubkey?: string | null
): boolean {
  if (followingSet.size === 0) return false

  const authorPubkey = getEventAuthorPubkey(event)
  const isRepost = event.kind === kinds.Repost || event.kind === kinds.GenericRepost
  if (!isRepost && accountPubkey && event.pubkey === accountPubkey && authorPubkey === accountPubkey) {
    return false
  }

  if (authorPubkey && authorPubkey !== accountPubkey && followingSet.has(authorPubkey)) {
    return true
  }

  if (isRepost) {
    if (event.pubkey !== accountPubkey && followingSet.has(event.pubkey)) {
      return true
    }
    for (const targetAuthor of getRepostTargetAuthors(event)) {
      if (targetAuthor !== accountPubkey && followingSet.has(targetAuthor)) {
        return true
      }
    }
  }

  return false
}
