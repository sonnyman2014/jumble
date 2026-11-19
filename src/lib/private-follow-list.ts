import { z } from 'zod'

const privateTagsSchema = z.array(z.array(z.string()))

export function detectEncryptedFollowContent(content?: string | null): {
  isEncrypted: boolean
  isNip04: boolean
} {
  const trimmed = (content ?? '').trim()
  if (!trimmed) {
    return { isEncrypted: false, isNip04: false }
  }
  // Legacy NIP-02 kind:3 events may store plaintext relay JSON objects in content.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return { isEncrypted: false, isNip04: false }
  }
  return {
    isEncrypted: true,
    isNip04: trimmed.includes('?iv=')
  }
}

export function parsePrivateFollowTags(plainText: string): string[][] {
  const trimmed = plainText.trim()
  if (!trimmed) return []
  return privateTagsSchema.parse(JSON.parse(trimmed))
}

export function addFollowTag(
  publicTags: string[][],
  privateTags: string[][],
  pubkey: string,
  visibility: 'public' | 'private'
): { publicTags: string[][]; privateTags: string[][] } {
  if (visibility === 'public') {
    const existingPrivate = privateTags.find(([name, val]) => name === 'p' && val === pubkey)
    const nextPrivate = privateTags.filter(([name, val]) => name !== 'p' || val !== pubkey)
    const alreadyPublic = publicTags.some(([name, val]) => name === 'p' && val === pubkey)
    const nextPublic = alreadyPublic
      ? [...publicTags]
      : [...publicTags, existingPrivate ? [...existingPrivate] : ['p', pubkey]]
    return { publicTags: nextPublic, privateTags: nextPrivate }
  }

  const existingPublic = publicTags.find(([name, val]) => name === 'p' && val === pubkey)
  const nextPublic = publicTags.filter(([name, val]) => name !== 'p' || val !== pubkey)
  const alreadyPrivate = privateTags.some(([name, val]) => name === 'p' && val === pubkey)
  const nextPrivate = alreadyPrivate
    ? [...privateTags]
    : [...privateTags, existingPublic ? [...existingPublic] : ['p', pubkey]]
  return { publicTags: nextPublic, privateTags: nextPrivate }
}

export function removeFollowTagFromBoth(
  publicTags: string[][],
  privateTags: string[][],
  pubkey: string
): { publicTags: string[][]; privateTags: string[][]; changed: boolean } {
  const nextPublic = publicTags.filter(([name, val]) => name !== 'p' || val !== pubkey)
  const nextPrivate = privateTags.filter(([name, val]) => name !== 'p' || val !== pubkey)
  return {
    publicTags: nextPublic,
    privateTags: nextPrivate,
    changed: nextPublic.length !== publicTags.length || nextPrivate.length !== privateTags.length
  }
}

export function switchFollowVisibility(
  publicTags: string[][],
  privateTags: string[][],
  pubkey: string,
  targetVisibility: 'public' | 'private'
): { publicTags: string[][]; privateTags: string[][]; changed: boolean } {
  if (targetVisibility === 'private') {
    const publicTag = publicTags.find(([name, val]) => name === 'p' && val === pubkey)
    if (!publicTag) {
      return { publicTags, privateTags, changed: false }
    }
    const nextPublic = publicTags.filter(([name, val]) => name !== 'p' || val !== pubkey)
    const alreadyPrivate = privateTags.some(([name, val]) => name === 'p' && val === pubkey)
    const nextPrivate = alreadyPrivate ? [...privateTags] : [...privateTags, [...publicTag]]
    return { publicTags: nextPublic, privateTags: nextPrivate, changed: true }
  }

  const privateTag = privateTags.find(([name, val]) => name === 'p' && val === pubkey)
  if (!privateTag) {
    return { publicTags, privateTags, changed: false }
  }
  const nextPrivate = privateTags.filter(([name, val]) => name !== 'p' || val !== pubkey)
  const alreadyPublic = publicTags.some(([name, val]) => name === 'p' && val === pubkey)
  const nextPublic = alreadyPublic ? [...publicTags] : [...publicTags, [...privateTag]]
  return { publicTags: nextPublic, privateTags: nextPrivate, changed: true }
}

export function convertAllPublicFollowsToPrivate(
  publicTags: string[][],
  privateTags: string[][]
): { publicTags: string[][]; privateTags: string[][]; movedCount: number } {
  const nonPTags: string[][] = []
  const movedPTags: string[][] = []

  for (const tag of publicTags) {
    if (tag[0] === 'p' && tag[1]) {
      movedPTags.push([...tag])
    } else {
      nonPTags.push([...tag])
    }
  }

  if (movedPTags.length === 0) {
    return { publicTags, privateTags, movedCount: 0 }
  }

  const seenPrivatePubkeys = new Set(
    privateTags.filter((tag) => tag[0] === 'p' && Boolean(tag[1])).map((tag) => tag[1])
  )
  const nextPrivate = [...privateTags.map((tag) => [...tag])]
  for (const pTag of movedPTags) {
    if (!seenPrivatePubkeys.has(pTag[1])) {
      seenPrivatePubkeys.add(pTag[1])
      nextPrivate.push(pTag)
    }
  }

  return {
    publicTags: nonPTags,
    privateTags: nextPrivate,
    movedCount: movedPTags.length
  }
}
