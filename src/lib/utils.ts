import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatISK(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  return value.toFixed(2)
}

// EVE's market tick scales with price magnitude (roughly 4 significant digits),
// e.g. 0.01 ISK below 1000, 1 ISK at 1000-9999, 1000 ISK at 1,000,000+.
export function getTickSize(price: number): number {
  if (price < 1000) return 0.01
  return Math.pow(10, Math.floor(Math.log10(price)) - 3)
}

export function formatIskPrice(price: number): string {
  return getTickSize(price) < 1 ? price.toFixed(2) : price.toFixed(0)
}

export function formatVolume(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}
