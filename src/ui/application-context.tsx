import { createContext, useContext } from 'react'
import type { PropsWithChildren } from 'react'
import type { TripApplication } from '../application/trips/trip-application'

export interface ApplicationServices {
  trips: TripApplication
}

const ApplicationContext = createContext<ApplicationServices | null>(null)

export function ApplicationProvider({
  services,
  children,
}: PropsWithChildren<{ services: ApplicationServices }>) {
  return <ApplicationContext.Provider value={services}>{children}</ApplicationContext.Provider>
}

export function useApplicationServices(): ApplicationServices {
  const services = useContext(ApplicationContext)
  if (!services) throw new Error('DTAgency application services are not available.')
  return services
}
