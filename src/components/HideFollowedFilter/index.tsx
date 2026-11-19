import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import { UserRoundX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function HideFollowedFilter({ feedId }: { feedId: string }) {
  const { t } = useTranslation()
  const { getHideFollowedInFeed, updateHideFollowedInFeed } = useUserPreferences()
  const hideFollowed = getHideFollowedInFeed(feedId)
  const label = t('Hide posts from people you follow')

  return (
    <Button
      variant="ghost"
      size="titlebar-icon"
      aria-pressed={hideFollowed}
      aria-label={label}
      title={label}
      className={cn(
        'relative',
        hideFollowed
          ? 'text-primary hover:text-primary-hover'
          : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={() => {
        updateHideFollowedInFeed(feedId, !hideFollowed)
      }}
    >
      <UserRoundX size={16} />
    </Button>
  )
}
