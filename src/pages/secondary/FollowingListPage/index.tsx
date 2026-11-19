import FollowButton from '@/components/FollowButton'
import Nip05 from '@/components/Nip05'
import ProfileList from '@/components/ProfileList'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import UserAvatar from '@/components/UserAvatar'
import Username from '@/components/Username'
import { useFetchFollowings, useFetchProfile } from '@/hooks'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { useFollowList } from '@/providers/FollowListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { Loader, Lock, Unlock } from 'lucide-react'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const FollowingListPage = forwardRef(({ id, index }: { id?: string; index?: number }, ref) => {
  const { t } = useTranslation()
  const { pubkey: accountPubkey } = useNostr()
  const { profile } = useFetchProfile(id)
  const { followings } = useFetchFollowings(profile?.pubkey)
  const { getFollowings, publicFollowingSet, changing, convertPublicFollowsToPrivate } =
    useFollowList()

  const isOwnList = Boolean(accountPubkey && profile?.pubkey === accountPubkey)
  const ownFollowings = useMemo(() => (isOwnList ? getFollowings() : []), [isOwnList, getFollowings])

  const handleConvertAllToPrivate = async () => {
    const moved = await convertPublicFollowsToPrivate()
    if (moved > 0) {
      toast.success(t('Converted public follows to private'))
    }
  }

  return (
    <SecondaryPageLayout
      ref={ref}
      index={index}
      title={
        profile?.username
          ? t("username's following", { username: profile.username })
          : t('Following')
      }
      displayScrollToTopButton
    >
      {isOwnList ? (
        <OwnFollowingList
          pubkeys={ownFollowings}
          publicCount={publicFollowingSet.size}
          changing={changing}
          onConvertAll={handleConvertAllToPrivate}
        />
      ) : (
        <ProfileList pubkeys={followings} />
      )}
    </SecondaryPageLayout>
  )
})
FollowingListPage.displayName = 'FollowingListPage'
export default FollowingListPage

function OwnFollowingList({
  pubkeys,
  publicCount,
  changing,
  onConvertAll
}: {
  pubkeys: string[]
  publicCount: number
  changing: boolean
  onConvertAll: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [visiblePubkeys, setVisiblePubkeys] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setVisiblePubkeys(pubkeys.slice(0, 10))
  }, [pubkeys])

  useEffect(() => {
    const observerInstance = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && pubkeys.length > visiblePubkeys.length) {
          setVisiblePubkeys((prev) => [...prev, ...pubkeys.slice(prev.length, prev.length + 10)])
        }
      },
      { root: null, rootMargin: '10px', threshold: 1 }
    )

    const currentBottomRef = bottomRef.current
    if (currentBottomRef) {
      observerInstance.observe(currentBottomRef)
    }
    return () => {
      if (currentBottomRef) {
        observerInstance.unobserve(currentBottomRef)
      }
    }
  }, [visiblePubkeys, pubkeys])

  return (
    <div className="space-y-2 px-4 pt-2">
      {publicCount > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
          <div className="text-muted-foreground text-sm">
            {t('Convert public follows to private description')}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={changing} className="shrink-0">
                <Lock className="size-3.5" />
                {t('Convert all to private')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('Convert all to private')}?</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('Convert public follows to private confirmation')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={onConvertAll}>
                  {t('Convert all to private')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
      {visiblePubkeys.map((pubkey, idx) => (
        <OwnFollowingItem key={`${idx}-${pubkey}`} pubkey={pubkey} />
      ))}
      {pubkeys.length > visiblePubkeys.length && <div ref={bottomRef} />}
    </div>
  )
}

function OwnFollowingItem({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const { changing, getFollowType, switchToPrivateFollow, switchToPublicFollow } = useFollowList()
  const { profile } = useFetchProfile(pubkey)
  const followType = useMemo(() => getFollowType(pubkey), [pubkey, getFollowType])
  const [switching, setSwitching] = useState(false)

  return (
    <div className="flex items-start gap-2 py-1">
      <UserAvatar userId={pubkey} className="shrink-0" />
      <div className="w-full overflow-hidden">
        <Username
          userId={pubkey}
          className="w-fit max-w-full truncate font-semibold"
          skeletonClassName="h-4"
        />
        <Nip05 pubkey={pubkey} />
        <div className="text-muted-foreground truncate text-sm">{profile?.about}</div>
      </div>
      <div className="flex items-center gap-2">
        {switching ? (
          <Button disabled variant="ghost" size="icon">
            <Loader className="animate-spin" />
          </Button>
        ) : followType === 'private' ? (
          <Button
            variant="ghost"
            size="icon"
            title={t('Switch to public follow')}
            onClick={() => {
              if (switching) return
              setSwitching(true)
              switchToPublicFollow(pubkey).finally(() => setSwitching(false))
            }}
            disabled={changing}
          >
            <Lock className="text-green-400" />
          </Button>
        ) : followType === 'public' ? (
          <Button
            variant="ghost"
            size="icon"
            title={t('Switch to private follow')}
            onClick={() => {
              if (switching) return
              setSwitching(true)
              switchToPrivateFollow(pubkey).finally(() => setSwitching(false))
            }}
            disabled={changing}
          >
            <Unlock className="text-muted-foreground" />
          </Button>
        ) : null}
        <FollowButton pubkey={pubkey} />
      </div>
    </div>
  )
}
