import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function appendUnique<T>(existing: T[], incoming: T[]): T[] {
  if (incoming.length === 0) {
    return existing
  }
  const seen = new Set(existing)
  const result = [...existing]
  for (const item of incoming) {
    if (!seen.has(item)) {
      seen.add(item)
      result.push(item)
    }
  }
  return result
}
