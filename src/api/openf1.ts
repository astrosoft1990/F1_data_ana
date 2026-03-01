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

// Separate instance for large car_data requests
const carDataApi = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  // Prevent axios from URL-encoding operator chars in param keys (>, <, >=)
  paramsSerializer: (params: Record<string, unknown>) => {
    return Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
  },
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

// Format a JS Date to OpenF1's expected format: "2024-12-08T13:10:17.466000" (no timezone suffix)
function toOpenF1DateStr(d: Date): string {
  return d.toISOString().replace('Z', '').replace(/(\.\d{3})\d*$/, '$1000')
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
    if (!lap.date_start) throw new Error('该圈次缺少开始时间数据 (date_start)')

    const dateStart = new Date(lap.date_start)
    if (isNaN(dateStart.getTime())) throw new Error('圈次开始时间格式无效')

    const lapDurationSec = lap.lap_duration ?? 120
    // End time = lap start + lap duration + 3s buffer
    const dateEnd = new Date(dateStart.getTime() + (lapDurationSec + 3) * 1000)

    const cacheKey = `car_data_lap_${session_key}_${driver_number}_${lap.lap_number}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < HISTORICAL_CACHE_TTL) {
      return cached.data as CarData[]
    }

    // OpenF1 API requires the comparison operator as part of the PARAMETER KEY,
    // e.g. "date>" not "date" with value ">=...". Only > and < work; >= returns HTTP 500.
    const response = await carDataApi.get<CarData[]>('/car_data', {
      params: {
        session_key,
        driver_number,
        'date>': toOpenF1DateStr(new Date(dateStart.getTime() - 500)), // 0.5s before lap start
        'date<': toOpenF1DateStr(dateEnd),
      },
    })

    const data = response.data ?? []
    cache.set(cacheKey, { data, timestamp: Date.now() })
    return data
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
