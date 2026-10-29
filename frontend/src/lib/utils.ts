import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, formatDistanceToNow, isValid, parseISO } from "date-fns"
import { enUS, zhCN } from "date-fns/locale"
import i18n from "@/i18n"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getDateLocale() {
  return i18n.language.startsWith("zh") ? zhCN : enUS
}

export function formatFullDate(date: Date): string {
  return format(date, "EEEE, MMMM d", { locale: getDateLocale() })
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function formatDateValue(value: unknown, fallback = "—"): string {
  if (typeof value !== "string" || !value) return fallback
  const date = value.length === 10 ? parseISO(value) : new Date(value)
  if (!isValid(date)) return fallback
  return format(date, "MMM d", { locale: getDateLocale() })
}

export function formatLongDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "—"
  const date = value.length === 10 ? parseISO(value) : new Date(value)
  if (!isValid(date)) return "—"
  return format(date, "MMM d, yyyy", { locale: getDateLocale() })
}

export function formatDateTime(value: string): string {
  const date = new Date(value)
  if (!isValid(date)) return "—"
  return format(date, "MMM d, yyyy 'at' h:mm a", { locale: getDateLocale() })
}

export function timeAgo(value: string): string {
  const date = new Date(value)
  if (!isValid(date)) return ""
  return formatDistanceToNow(date, { addSuffix: true, locale: getDateLocale() })
}

export function dueTone(value: unknown): "danger" | "warning" | "normal" {
  if (typeof value !== "string" || !value) return "normal"
  const date = value.length === 10 ? parseISO(value) : new Date(value)
  if (!isValid(date)) return "normal"
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((date.getTime() - today.getTime()) / 86400000)
  if (days < 0) return "danger"
  if (days <= 2) return "warning"
  return "normal"
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "")
  if (clean.length !== 6) return `rgba(97, 97, 255, ${alpha})`
  const int = parseInt(clean, 16)
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`
}

export function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

export function toInputDate(value: unknown): string {
  if (typeof value !== "string" || !value) return ""
  if (value.length >= 10) return value.slice(0, 10)
  return ""
}

export function safeArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string")
  if (typeof value === "string" && value) return [value]
  return []
}

export function readableTextColor(hex: string): string {
  const clean = hex.replace("#", "")
  if (clean.length !== 6) return "#ffffff"
  const int = parseInt(clean, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.68 ? "#323338" : "#ffffff"
}


export function describeUserAgent(ua?: string): string {
  if (!ua) return "Unknown device"
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser"
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad|iPod/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : ""
  return os ? `${browser} · ${os}` : browser
}
