import { createContext, useContext } from 'react'
import type { PropsWithChildren } from 'react'
import type { DayApplication } from '../application/days/day-application'
import type { ExpenseApplication } from '../application/expenses/expense-application'
import type { ExpenseSummaryApplication } from '../application/expenses/expense-summary'
import type { ItineraryApplication } from '../application/itinerary/itinerary-application'
import type { DayMediaApplication } from '../application/media/day-media-application'
import type { PlaceApplication } from '../application/places/place-application'
import type { PlaceImportApplication } from '../application/places/place-import'
import type { PlannerApplication } from '../application/planner/planner-application'
import type { ReservationApplication } from '../application/reservations/reservation-application'
import type { DayTemplateApplication } from '../application/templates/day-template-application'
import type { TravelBookApplication } from '../application/travel-book/travel-book-application'
import type { TravelerDocumentApplication } from '../application/travelers/traveler-document-application'
import type { TravelerApplication } from '../application/travelers/traveler-application'
import type { TripApplication } from '../application/trips/trip-application'

export interface ApplicationServices {
  trips: TripApplication
  days: DayApplication
  planner: PlannerApplication
  reservations: ReservationApplication
  media: DayMediaApplication
  templates: DayTemplateApplication
  expenses: ExpenseApplication & ExpenseSummaryApplication
  travelers: TravelerApplication
  travelerDocuments: TravelerDocumentApplication
  places: PlaceApplication
  placeImport: PlaceImportApplication
  itinerary: ItineraryApplication
  travelBook: TravelBookApplication
}

const ApplicationContext = createContext<ApplicationServices | null>(null)

export function ApplicationProvider({ services, children }: PropsWithChildren<{ services: ApplicationServices }>) {
  return <ApplicationContext.Provider value={services}>{children}</ApplicationContext.Provider>
}

export function useApplicationServices<K extends keyof ApplicationServices>(
  first: K,
  ...rest: K[]
): Pick<ApplicationServices, K> {
  const services = useContext(ApplicationContext)
  if (!services) throw new Error('DTAgency application services are not available.')

  const selected = {} as Pick<ApplicationServices, K>
  for (const key of [first, ...rest]) selected[key] = services[key]
  return selected
}
