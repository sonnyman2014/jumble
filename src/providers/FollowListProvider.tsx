import { createFollowListDraftEvent } from '@/lib/draft-event'
import { formatError } from '@/lib/error'
import {
  addFollowTag,
  convertAllPublicFollowsToPrivate,
  detectEncryptedFollowContent,
  parsePrivateFollowTags,
  removeFollowTagFromBoth,
  switchFollowVisibility
} from '@/lib/private-follow-list'
import { getPubkeysFromPTags } from '@/lib/tag'
import client from '@/services/client.service'
import dialogService from '@/services/dialog.service'
import indexedDb from '@/services/indexed-db.service'
import { Event, kinds } from 'nostr-tools'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useNostr } from './NostrProvider'

type TFollowListContext = {
  followingSet: Set<string>
  publicFollowingSet: Set<string>
  privateFollowingSet: Set<string>
  changing: boolean
  getFollowings: () => string[]
  getFollowType: (pubkey: string) => 'public' | 'private' | null
  follow: (pubkey: string) => Promise<void>
  followPrivately: (pubkey: string) => Promise<void>
  unfollow: (pubkey: string) => Promise<void>
  switchToPrivateFollow: (pubkey: string) => Promise<void>
  switchToPublicFollow: (pubkey: string) => Promise<void>
  convertPublicFollowsToPrivate: () => Promise<number>
}

const FollowListContext = createContext<TFollowListContext | undefined>(undefined)

export const useFollowList = () => {
  const context = useContext(FollowListContext)
  if (!context) {
    throw new Error('useFollowList must be used within a FollowListProvider')
  }
  return context
}

export function FollowListProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const {
    pubkey: accountPubkey,
    followListEvent,
    publish,
    updateFollowListEvent,
    nip04Decrypt,
    nip44Encrypt,
    nip44Decrypt
  } = useNostr()
  const currentAccountPubkey = useRef(accountPubkey)
  currentAccountPubkey.current = accountPubkey

  const [tags, setTags] = useState<string[][]>([])
  const [privateTags, setPrivateTags] = useState<string[][]>([])
  const [changing, setChanging] = useState(false)

  const publicFollowingSet = useMemo(() => new Set(getPubkeysFromPTags(tags)), [tags])
  const privateFollowingSet = useMemo(
    () => new Set(getPubkeysFromPTags(privateTags)),
    [privateTags]
  )
  const followingSet = useMemo(
    () => new Set([...Array.from(publicFollowingSet), ...Array.from(privateFollowingSet)]),
    [publicFollowingSet, privateFollowingSet]
  )

  const getPrivateTags = useCallback(
    async (event: Event): Promise<{ privateTags: string[][]; wasNip04: boolean }> => {
      const { isEncrypted, isNip04 } = detectEncryptedFollowContent(event.content)
      if (!isEncrypted) {
        return { privateTags: [], wasNip04: false }
      }

      const storedPlainText = await indexedDb.getDecryptedContent(event.id)
      let plainText: string
      if (storedPlainText) {
        plainText = storedPlainText
      } else {
        plainText = isNip04
          ? await nip04Decrypt(event.pubkey, event.content)
          : await nip44Decrypt(event.pubkey, event.content)
        await indexedDb.putDecryptedContent(event.id, plainText)
      }

      return {
        privateTags: parsePrivateFollowTags(plainText),
        wasNip04: isNip04
      }
    },
    [nip04Decrypt, nip44Decrypt]
  )

  const fetchLatestFollowListEvent = async (pubkey: string): Promise<Event | null> => {
    const remote = await client.fetchFollowListEvent(pubkey)
    const cached = await indexedDb.getReplaceableEvent(pubkey, kinds.Contacts)
    if (cached && (!remote || cached.created_at >= remote.created_at)) return cached
    return remote
  }

  useEffect(() => {
    let cancelled = false
    const syncFollowTags = async () => {
      if (!followListEvent || followListEvent.pubkey !== accountPubkey) {
        setTags([])
        setPrivateTags([])
        return
      }
      setTags(followListEvent.tags)
      const decrypted = await getPrivateTags(followListEvent).catch((error) => {
        console.error('Failed to decrypt private follow list content', error)
        return { privateTags: [] as string[][], wasNip04: false }
      })
      if (cancelled) return
      setPrivateTags(decrypted.privateTags)
    }
    syncFollowTags()
    return () => {
      cancelled = true
    }
  }, [accountPubkey, followListEvent, getPrivateTags])

  const publishFollowList = async (
    nextPublicTags: string[][],
    nextPrivateTags: string[][],
    previousEvent: Event | null,
    hadEncryptedContent: boolean
  ) => {
    if (!accountPubkey) throw new Error('You need to login first')
    let content = previousEvent?.content ?? ''
    if (nextPrivateTags.length > 0) {
      content = await nip44Encrypt(accountPubkey, JSON.stringify(nextPrivateTags))
    } else if (hadEncryptedContent) {
      content = ''
    }
    if (currentAccountPubkey.current !== accountPubkey) {
      throw new Error('Account changed')
    }
    const draft = createFollowListDraftEvent(nextPublicTags, content)
    if (previousEvent) {
      draft.created_at = Math.max(draft.created_at, previousEvent.created_at + 1)
    }
    const published = await publish(draft)
    if (published.pubkey !== accountPubkey) return
    await updateFollowListEvent(published, nextPrivateTags)
  }

  const followWithVisibility = async (pubkey: string, visibility: 'public' | 'private') => {
    if (!accountPubkey || changing) return
    setChanging(true)
    try {
      const latestEvent = await fetchLatestFollowListEvent(accountPubkey)
      if (!latestEvent) {
        const result = await dialogService.confirm(t('FollowListNotFoundConfirmation'))
        if (!result) return
      }
      if (currentAccountPubkey.current !== accountPubkey) return
      const hadEncrypted = detectEncryptedFollowContent(latestEvent?.content).isEncrypted
      const currentPrivate = latestEvent ? (await getPrivateTags(latestEvent)).privateTags : []
      const { publicTags: nextPublic, privateTags: nextPrivate } = addFollowTag(
        latestEvent?.tags ?? [],
        currentPrivate,
        pubkey,
        visibility
      )
      await publishFollowList(nextPublic, nextPrivate, latestEvent, hadEncrypted)
    } catch (error) {
      const errors = formatError(error)
      errors.forEach((err) => {
        toast.error(`${t('Follow failed')}: ${err}`, { duration: 10_000 })
      })
    } finally {
      setChanging(false)
    }
  }

  const follow = async (pubkey: string) => {
    await followWithVisibility(pubkey, 'public')
  }

  const followPrivately = async (pubkey: string) => {
    await followWithVisibility(pubkey, 'private')
  }

  const unfollow = async (pubkey: string) => {
    if (!accountPubkey || changing) return
    setChanging(true)
    try {
      const latestEvent = await fetchLatestFollowListEvent(accountPubkey)
      if (!latestEvent) return
      const hadEncrypted = detectEncryptedFollowContent(latestEvent.content).isEncrypted
      const currentPrivate = (await getPrivateTags(latestEvent)).privateTags
      const { publicTags: nextPublic, privateTags: nextPrivate, changed } =
        removeFollowTagFromBoth(latestEvent.tags, currentPrivate, pubkey)
      if (!changed) return
      await publishFollowList(nextPublic, nextPrivate, latestEvent, hadEncrypted)
    } catch (error) {
      const errors = formatError(error)
      errors.forEach((err) => {
        toast.error(`${t('Unfollow failed')}: ${err}`, { duration: 10_000 })
      })
    } finally {
      setChanging(false)
    }
  }

  const switchVisibility = async (pubkey: string, target: 'public' | 'private') => {
    if (!accountPubkey || changing) return
    setChanging(true)
    try {
      const latestEvent = await fetchLatestFollowListEvent(accountPubkey)
      if (!latestEvent) return
      const hadEncrypted = detectEncryptedFollowContent(latestEvent.content).isEncrypted
      const currentPrivate = (await getPrivateTags(latestEvent)).privateTags
      const { publicTags: nextPublic, privateTags: nextPrivate, changed } =
        switchFollowVisibility(latestEvent.tags, currentPrivate, pubkey, target)
      if (!changed) return
      await publishFollowList(nextPublic, nextPrivate, latestEvent, hadEncrypted)
    } catch (error) {
      const errors = formatError(error)
      errors.forEach((err) => {
        toast.error(`${t('Follow failed')}: ${err}`, { duration: 10_000 })
      })
    } finally {
      setChanging(false)
    }
  }

  const switchToPrivateFollow = async (pubkey: string) => {
    await switchVisibility(pubkey, 'private')
  }

  const switchToPublicFollow = async (pubkey: string) => {
    await switchVisibility(pubkey, 'public')
  }

  const convertPublicFollowsToPrivate = async (): Promise<number> => {
    if (!accountPubkey || changing) return 0
    setChanging(true)
    try {
      const latestEvent = await fetchLatestFollowListEvent(accountPubkey)
      if (!latestEvent) return 0
      const hadEncrypted = detectEncryptedFollowContent(latestEvent.content).isEncrypted
      const currentPrivate = (await getPrivateTags(latestEvent)).privateTags
      const { publicTags: nextPublic, privateTags: nextPrivate, movedCount } =
        convertAllPublicFollowsToPrivate(latestEvent.tags, currentPrivate)
      if (movedCount === 0) return 0
      await publishFollowList(nextPublic, nextPrivate, latestEvent, hadEncrypted)
      return movedCount
    } catch (error) {
      const errors = formatError(error)
      errors.forEach((err) => {
        toast.error(`${t('Follow failed')}: ${err}`, { duration: 10_000 })
      })
      return 0
    } finally {
      setChanging(false)
    }
  }

  const getFollowings = useCallback(() => Array.from(followingSet), [followingSet])

  const getFollowType = useCallback(
    (pubkey: string): 'public' | 'private' | null => {
      if (publicFollowingSet.has(pubkey)) return 'public'
      if (privateFollowingSet.has(pubkey)) return 'private'
      return null
    },
    [publicFollowingSet, privateFollowingSet]
  )

  return (
    <FollowListContext.Provider
      value={{
        followingSet,
        publicFollowingSet,
        privateFollowingSet,
        changing,
        getFollowings,
        getFollowType,
        follow,
        followPrivately,
        unfollow,
        switchToPrivateFollow,
        switchToPublicFollow,
        convertPublicFollowsToPrivate
      }}
    >
      {children}
    </FollowListContext.Provider>
  )
}
