import { cn } from "@/lib/utils"

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary text-[15px] font-extrabold text-primary-foreground shadow-md shadow-primary/25">
        F
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-background bg-success" />
      </div>
      {!compact && (
        <span className="text-[18px] font-extrabold tracking-tight">Friday</span>
      )}
    </div>
  )
}
