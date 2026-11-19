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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Modal, ModalContent, ModalTrigger } from '@/components/ui/modal'
import { useFollowList } from '@/providers/FollowListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { Loader, Lock, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function FollowButton({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const { pubkey: accountPubkey, checkLogin } = useNostr()
  const { followingSet, changing, getFollowType, follow, followPrivately, unfollow } =
    useFollowList()
  const [updating, setUpdating] = useState(false)
  const [hover, setHover] = useState(false)
  const isFollowing = useMemo(() => followingSet.has(pubkey), [followingSet, pubkey])
  const followType = useMemo(() => getFollowType(pubkey), [getFollowType, pubkey])

  if (!accountPubkey || (pubkey && pubkey === accountPubkey)) return null

  const handleFollow = async (e: React.MouseEvent, isPrivate = false) => {
    e.stopPropagation()
    checkLogin(async () => {
      if (isFollowing) return

      setUpdating(true)
      try {
        if (isPrivate) {
          await followPrivately(pubkey)
        } else {
          await follow(pubkey)
        }
      } finally {
        setUpdating(false)
      }
    })
  }

  const handleUnfollow = async (e: React.MouseEvent) => {
    e.stopPropagation()
    checkLogin(async () => {
      if (!isFollowing) return

      setUpdating(true)
      try {
        await unfollow(pubkey)
      } finally {
        setUpdating(false)
      }
    })
  }

  if (isFollowing) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              className="min-w-28 rounded-full"
              variant={hover ? 'destructive' : 'secondary'}
              disabled={updating || changing}
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
            >
              {updating ? (
                <Loader className="animate-spin" />
              ) : hover ? (
                t('Unfollow')
              ) : (
                <>
                  {followType === 'private' && <Lock className="size-3.5 text-green-400" />}
                  {t('buttonFollowing')}
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('Unfollow')}?</AlertDialogTitle>
              <AlertDialogDescription>
                {t('Are you sure you want to unfollow this user?')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleUnfollow} variant="destructive">
                {t('Unfollow')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  const trigger = (
    <Button
      className="min-w-28 rounded-full"
      disabled={updating || changing}
      onClick={(e) => e.stopPropagation()}
    >
      {updating ? <Loader className="animate-spin" /> : t('Follow')}
    </Button>
  )

  if (isSmallScreen) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Modal>
          <ModalTrigger asChild>{trigger}</ModalTrigger>
          <ModalContent>
            <div className="py-2">
              <Button
                className="w-full justify-start gap-4 p-6 text-lg [&_svg]:size-5"
                variant="ghost"
                onClick={(e) => handleFollow(e, false)}
                disabled={updating || changing}
              >
                <UserPlus />
                {t('Follow user publicly')}
              </Button>
              <Button
                className="w-full justify-start gap-4 p-6 text-lg [&_svg]:size-5"
                variant="ghost"
                onClick={(e) => handleFollow(e, true)}
                disabled={updating || changing}
              >
                <Lock />
                {t('Follow user privately')}
              </Button>
            </div>
          </ModalContent>
        </Modal>
      </div>
    )
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={(e) => handleFollow(e, false)}>
            <UserPlus />
            {t('Follow user publicly')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => handleFollow(e, true)}>
            <Lock />
            {t('Follow user privately')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
