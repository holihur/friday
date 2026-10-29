import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowRight, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Group, Item } from "@/lib/types"

export function NewItemDialog({
  open,
  onOpenChange,
  groups,
  defaultGroupId,
  onCreate,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: Group[]
  defaultGroupId?: string
  onCreate: (name: string, groupId: string) => Promise<{ item: Item }>
  onCreated?: (item: Item) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id ?? "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setGroupId(defaultGroupId ?? groups[0]?.id ?? "")
      setName("")
      setError("")
    }
  }, [open, defaultGroupId, groups])

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t("Give the item a name."))
      return
    }
    if (!groupId) {
      setError(t("Choose a group for this item."))
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await onCreate(trimmed, groupId)
      onOpenChange(false)
      onCreated?.(res.item)
    } catch {
      setError(t("Could not create item. Please try again."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Plus className="h-4 w-4" />
          </div>
          <DialogTitle>{t("New item")}</DialogTitle>
          <DialogDescription>{t("Add a task, feature or deliverable to the board.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="item-name">{t("Item name")}</Label>
            <Input
              id="item-name"
              autoFocus
              placeholder={t("e.g. Scope the onboarding flow")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit()
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("Group")}</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger>
                <SelectValue placeholder={t("Choose a group")} />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: group.color }} />
                      {t(group.title)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t("Cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : null}
            {t("Create item")} <ArrowRight />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
