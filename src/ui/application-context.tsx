import { createContext, useContext } from 'react'
import type { PropsWithChildren } from 'react'
import type { DayApplication } from '../application/days/day-application'
import type { DayMediaApplication } from '../application/media/day-media-application'
import type { PlannerApplication } from '../application/planner/planner-application'
import type { ReservationApplication } from '../application/reservations/reservation-application'
import type { DayTemplateApplication } from '../application/templates/day-template-application'
import type { TripApplication } from '../application/trips/trip-application'

export interface ApplicationServices {
  trips: TripApplication
  days: DayApplication
  planner: PlannerApplication
  reservations: ReservationApplication
  media: DayMediaApplication
  templates: DayTemplateApplication
}

const ApplicationContext = createContext<ApplicationServices | null>(null)

export function ApplicationProvider({ services, children }: PropsWithChildren<{ services: ApplicationServices }>) {
  return <ApplicationContext.Provider value={services}>{children}</ApplicationContext.Provider>
}

export function useApplicationServices(): ApplicationServices {
  const services = useContext(ApplicationContext)
  if (!services) throw new Error('DTAgency application services are not available.')
  return services
}
