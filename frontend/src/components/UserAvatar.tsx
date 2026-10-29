import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn, initials } from "@/lib/utils"
import type { User } from "@/lib/types"

const sizes = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-[11px]",
  lg: "h-10 w-10 text-sm",
  xl: "h-14 w-14 text-lg",
}

export function UserAvatar({
  user,
  name,
  color,
  size = "md",
  className,
  ring,
}: {
  user?: Pick<User, "name" | "avatarColor">
  name?: string
  color?: string
  size?: keyof typeof sizes
  className?: string
  ring?: boolean
}) {
  const displayName = user?.name ?? name ?? "?"
  const bg = user?.avatarColor ?? color ?? "#6161ff"
  return (
    <Avatar className={cn(sizes[size], ring && "ring-2 ring-background", className)}>
      <AvatarFallback style={{ backgroundColor: bg }} title={displayName}>
        {initials(displayName)}
      </AvatarFallback>
    </Avatar>
  )
}

export function AvatarStack({
  users,
  max = 4,
  size = "sm",
}: {
  users: Array<Pick<User, "id" | "name" | "avatarColor">>
  max?: number
  size?: keyof typeof sizes
}) {
  const shown = users.slice(0, max)
  const rest = users.length - shown.length
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((u) => (
        <UserAvatar key={u.id} user={u} size={size} ring />
      ))}
      {rest > 0 && (
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-secondary font-semibold text-muted-foreground ring-2 ring-background",
            sizes[size],
          )}
        >
          +{rest}
        </span>
      )}
    </div>
  )
}
