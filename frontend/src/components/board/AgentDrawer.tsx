import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
  ArrowUp,
  Bot,
  Check,
  CheckCircle2,
  Loader2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { AIConfig, AgentChatResponse, AgentProposal, Board } from "@/lib/types"

interface ChatEntry {
  role: "user" | "assistant"
  content: string
  proposals?: AgentProposal[]
}

export function AgentDrawer({
  board,
  open,
  onOpenChange,
}: {
  board: Board
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [resolved, setResolved] = useState<Record<string, "approved" | "rejected">>({})
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { data, isLoading } = useQuery({
    queryKey: ["ai-config"],
    queryFn: () => api.get<{ config: AIConfig }>("/me/ai"),
    enabled: open,
  })
  const configured = data?.config?.configured ?? false

  useEffect(() => {
    if (open) {
      setMessages([])
      setResolved({})
      setInput("")
    }
  }, [board.id, open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, sending])

  async function send(text?: string) {
    const value = (text ?? input).trim()
    if (!value || sending || !configured) return
    const userEntry: ChatEntry = { role: "user", content: value }
    const nextMessages = [...messages, userEntry]
    setMessages(nextMessages)
    setInput("")
    setSending(true)
    try {
      const history = messages
        .filter((m) => m.content)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }))
      const res = await api.post<AgentChatResponse>("/agent/chat", {
        workspaceId: board.workspaceId,
        boardId: board.id,
        message: value,
        history,
      })
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            res.message ||
            (res.proposals.length > 0
              ? t("I prepared {{count}} change(s) for approval.", { count: res.proposals.length })
              : t("I could not produce an answer.")),
          proposals: res.proposals,
        },
      ])
    } catch (err) {
      const message = err instanceof ApiError ? t(err.message) : t("The AI request failed")
      setMessages((prev) => [...prev, { role: "assistant", content: message }])
    } finally {
      setSending(false)
    }
  }

  async function approve(proposal: AgentProposal) {
    setBusyAction(proposal.id)
    try {
      await api.post(`/agent/actions/${proposal.id}/approve`)
      setResolved((prev) => ({ ...prev, [proposal.id]: "approved" }))
      toast.success(t("Change applied"))
      void queryClient.invalidateQueries({ queryKey: ["board", board.id] })
      void queryClient.invalidateQueries({ queryKey: ["boards"] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    } catch (err) {
      toast.error(err instanceof ApiError ? t(err.message) : t("Could not apply change"))
    } finally {
      setBusyAction(null)
    }
  }

  async function reject(proposal: AgentProposal) {
    setBusyAction(proposal.id)
    try {
      await api.post(`/agent/actions/${proposal.id}/reject`)
      setResolved((prev) => ({ ...prev, [proposal.id]: "rejected" }))
      toast.success(t("Change rejected"))
    } catch (err) {
      toast.error(err instanceof ApiError ? t(err.message) : t("Could not reject change"))
    } finally {
      setBusyAction(null)
    }
  }

  const suggestions = [
    t("Summarize this board"),
    t("What is overdue?"),
    t("Who is working on what?"),
    t("Create a task for the launch"),
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full p-0 sm:max-w-[500px]">
        <SheetTitle className="sr-only">{t("Friday AI")}</SheetTitle>
        <SheetDescription className="sr-only">{t("Ask Friday AI about this board")}</SheetDescription>
        <div className="border-b border-border px-5 pb-4 pr-12 pt-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold">{t("Friday AI")}</h2>
              <p className="text-[11px] text-muted-foreground">
                {t("Board agent · using your own provider key")}
              </p>
            </div>
            <Badge variant="secondary" className="ml-auto">
              {board.icon} {board.name}
            </Badge>
          </div>
        </div>

        {!isLoading && !configured ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Bot className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-bold">{t("Connect your AI provider")}</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {t("Friday uses your own API key (BYOK). Add an OpenAI-compatible key in Settings → AI to start.")}
            </p>
            <Button asChild className="mt-5" onClick={() => onOpenChange(false)}>
              <Link to="/settings?tab=ai">
                <Sparkles /> {t("Configure AI")}
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
              {messages.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm font-semibold">{t("Ask about this board")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("I can summarize work, find items and prepare changes for your approval.")}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => void send(suggestion)}
                        className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium transition hover:border-primary/40 hover:text-primary"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message, index) => (
                    <div key={index} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[92%]", message.role === "user" ? "items-end" : "items-start")}>
                        <div
                          className={cn(
                            "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                            message.role === "user"
                              ? "rounded-br-md bg-primary text-primary-foreground"
                              : "rounded-bl-md border border-border bg-card",
                          )}
                        >
                          {message.content}
                        </div>
                        {message.proposals?.map((proposal) => {
                          const state = resolved[proposal.id]
                          return (
                            <div key={proposal.id} className="mt-2 rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
                              <div className="flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-primary" />
                                <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
                                  {proposal.type === "create_item" ? t("Create item") : t("Update item")}
                                </span>
                              </div>
                              <p className="mt-1 text-xs font-bold">{proposal.payload.itemName}</p>
                              {proposal.payload.changes && proposal.payload.changes.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {proposal.payload.changes.map((change, i) => (
                                    <p key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                      <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                                      <span className="font-semibold text-foreground">{t(change.field)}:</span> {t(change.value)}
                                    </p>
                                  ))}
                                </div>
                              )}
                              {state ? (
                                <Badge variant={state === "approved" ? "success" : "muted"} className="mt-2">
                                  {state === "approved" ? <CheckCircle2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                  {state === "approved" ? t("Applied") : t("Rejected")}
                                </Badge>
                              ) : (
                                <div className="mt-2.5 flex gap-2">
                                  <Button size="sm" className="h-7 px-2.5 text-[11px]" onClick={() => void approve(proposal)} disabled={busyAction !== null}>
                                    {busyAction === proposal.id ? <Loader2 className="animate-spin" /> : <ThumbsUp />}
                                    {t("Apply")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2.5 text-[11px]"
                                    onClick={() => void reject(proposal)}
                                    disabled={busyAction !== null}
                                  >
                                    <ThumbsDown /> {t("Reject")}
                                  </Button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  {sending && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("Friday is thinking…")}
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            <div className="border-t border-border p-3">
              <div className="flex items-end gap-2 rounded-xl border border-border bg-background p-2 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t("Ask Friday about this board…")}
                  className="min-h-[44px] resize-none border-0 bg-transparent p-1 text-[13px] shadow-none focus-visible:ring-0"
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault()
                      void send()
                    }
                  }}
                />
                <Button size="icon" className="h-8 w-8 shrink-0" aria-label={t("Send")} onClick={() => void send()} disabled={!input.trim() || sending}>
                  {sending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
                </Button>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                {t("⌘ + Enter to send · changes require your approval")}
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
