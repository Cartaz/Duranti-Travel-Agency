import type { Trip } from './entities'

export type TripDateRange = Pick<Trip, 'startDate' | 'endDate'>

export function isDayDateWithinTripRange(range: TripDateRange, date: string): boolean {
  if (range.startDate && date < range.startDate) return false
  if (range.endDate && date > range.endDate) return false
  return true
}

export function assertDayDateWithinTripRange(range: TripDateRange, date: string): void {
  if (range.startDate && date < range.startDate) {
    throw new Error(`La giornata non può precedere la partenza del viaggio (${range.startDate}).`)
  }
  if (range.endDate && date > range.endDate) {
    throw new Error(`La giornata non può superare il ritorno del viaggio (${range.endDate}).`)
  }
}
