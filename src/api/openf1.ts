import axios from 'axios'
import type {
  Session, Driver, Lap, CarData, Position, Pit,
  Stint, Interval, Weather, RaceControl, Location
} from '../types/f1'

const BASE_URL = 'https://api.openf1.org/v1'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
})

// Cache implementation
const cache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes for live data
const HISTORICAL_CACHE_TTL = 60 * 60 * 1000 // 1 hour for historical data

async function cachedGet<T>(url: string, params: Record<string, unknown> = {}, isHistorical = false): Promise<T> {
  const key = `${url}?${JSON.stringify(params)}`
  const cached = cache.get(key)
  const ttl = isHistorical ? HISTORICAL_CACHE_TTL : CACHE_TTL

  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data as T
  }

  const response = await api.get<T>(url, { params })
  cache.set(key, { data: response.data, timestamp: Date.now() })
  return response.data
}

export const openF1Api = {
  getSessions: (params: {
    year?: number
    session_key?: number
    session_type?: string
    meeting_key?: number
  } = {}) => cachedGet<Session[]>('/sessions', params, !!params.year && params.year < new Date().getFullYear()),

  getLatestSession: () => cachedGet<Session[]>('/sessions', { session_key: 'latest' }),

  getDrivers: (session_key: number) =>
    cachedGet<Driver[]>('/drivers', { session_key }, true),

  getLaps: (session_key: number, driver_number?: number) =>
    cachedGet<Lap[]>('/laps', { session_key, ...(driver_number ? { driver_number } : {}) }, true),

  getCarData: (session_key: number, driver_number: number, speed?: number) =>
    cachedGet<CarData[]>('/car_data', {
      session_key,
      driver_number,
      ...(speed ? { speed: `>=${speed}` } : {}),
    }, true),

  getCarDataForLap: async (session_key: number, driver_number: number, lap: Lap): Promise<CarData[]> => {
    if (!lap.date_start) return []
    const dateStart = new Date(lap.date_start)
    return cachedGet<CarData[]>('/car_data', {
      session_key,
      driver_number,
      date: `>=${dateStart.toISOString()}`,
    }, true)
  },

  getPositions: (session_key: number) =>
    cachedGet<Position[]>('/position', { session_key }, true),

  getPitStops: (session_key: number) =>
    cachedGet<Pit[]>('/pit', { session_key }, true),

  getStints: (session_key: number) =>
    cachedGet<Stint[]>('/stints', { session_key }, true),

  getIntervals: (session_key: number) =>
    cachedGet<Interval[]>('/intervals', { session_key }, true),

  getWeather: (session_key: number) =>
    cachedGet<Weather[]>('/weather', { session_key }, true),

  getRaceControl: (session_key: number) =>
    cachedGet<RaceControl[]>('/race_control', { session_key }, true),

  getLocation: (session_key: number, driver_number: number) =>
    cachedGet<Location[]>('/location', { session_key, driver_number }, true),
}

export function clearCache() {
  cache.clear()
}
