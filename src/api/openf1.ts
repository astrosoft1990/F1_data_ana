import axios from 'axios'
import type {
  Session, Driver, Lap, CarData, Position, Pit,
  Stint, Interval, Weather, RaceControl, Location
} from '../types/f1'

const BASE_URL = 'https://api.openf1.org/v1'

// ─── Rate Limiter ─────────────────────────────────────────────────────────────
// OpenF1 allows max 3 requests/second. This shared limiter gates both axios
// instances so the combined rate never exceeds the cap.

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

class RateLimiter {
  private readonly maxRPS: number
  private readonly windowMs = 1000
  /** Timestamps (ms) of the last maxRPS requests within the window */
  private slots: number[] = []
  private queue: Array<() => void> = []
  private running = false

  constructor(maxRPS = 3) {
    this.maxRPS = maxRPS
  }

  /** Call before every request. Resolves when a slot is available. */
  acquire(): Promise<void> {
    return new Promise(resolve => {
      this.queue.push(resolve)
      if (!this.running) this.drain()
    })
  }

  private async drain() {
    this.running = true
    while (this.queue.length > 0) {
      const now = Date.now()
      // Evict slots older than 1 second
      this.slots = this.slots.filter(t => now - t < this.windowMs)

      if (this.slots.length < this.maxRPS) {
        // Slot available – release next waiter immediately
        this.slots.push(Date.now())
        this.queue.shift()!()
      } else {
        // Wait until the oldest slot expires (+ small safety buffer)
        const waitMs = this.windowMs - (now - this.slots[0]) + 20
        await sleep(Math.max(waitMs, 10))
      }
    }
    this.running = false
  }
}

const limiter = new RateLimiter(3)

// ─── Axios instances ──────────────────────────────────────────────────────────

const api = axios.create({ baseURL: BASE_URL, timeout: 30000 })

const carDataApi = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  paramsSerializer: (params: Record<string, unknown>) =>
    Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&'),
})

// Attach rate-limit interceptor to both instances
function attachRateLimiter(instance: typeof api) {
  instance.interceptors.request.use(async config => {
    await limiter.acquire()
    return config
  })

  // Retry once on 429 after waiting the Retry-After header (or 2s fallback)
  instance.interceptors.response.use(
    res => res,
    async err => {
      const status = err.response?.status
      const config = err.config
      if (status === 429 && !config._retried) {
        config._retried = true
        const retryAfter = Number(err.response?.headers?.['retry-after'] ?? 2)
        await sleep(retryAfter * 1000)
        return instance.request(config)
      }
      return Promise.reject(err)
    }
  )
}

attachRateLimiter(api)
attachRateLimiter(carDataApi)

// ─── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000           // 5 min (live data)
const HISTORICAL_CACHE_TTL = 60 * 60 * 1000  // 1 hour (historical)

async function cachedGet<T>(
  url: string,
  params: Record<string, unknown> = {},
  isHistorical = false,
): Promise<T> {
  const key = `${url}?${JSON.stringify(params)}`
  const hit = cache.get(key)
  const ttl = isHistorical ? HISTORICAL_CACHE_TTL : CACHE_TTL
  if (hit && Date.now() - hit.timestamp < ttl) return hit.data as T

  const response = await api.get<T>(url, { params })
  cache.set(key, { data: response.data, timestamp: Date.now() })
  return response.data
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a JS Date to OpenF1's datetime string (no Z / timezone suffix) */
function toOpenF1DateStr(d: Date): string {
  return d.toISOString().replace('Z', '').replace(/(\.\d{3})\d*$/, '$1000')
}

// ─── Meeting type ─────────────────────────────────────────────────────────────

export interface Meeting {
  meeting_key: number
  meeting_name: string
  meeting_official_name: string
  location: string
  country_key: number
  country_code: string
  country_name: string
  country_flag: string
  circuit_key: number
  circuit_short_name: string
  date_start: string
  date_end: string
  year: number
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const openF1Api = {
  getMeetings: (year: number) =>
    cachedGet<Meeting[]>('/meetings', { year }, year < new Date().getFullYear()),

  getSessions: (params: {
    year?: number
    session_key?: number
    session_type?: string
    meeting_key?: number
  } = {}) =>
    cachedGet<Session[]>('/sessions', params,
      !!params.year && params.year < new Date().getFullYear()),

  getLatestSession: () =>
    cachedGet<Session[]>('/sessions', { session_key: 'latest' }),

  getDrivers: (session_key: number) =>
    cachedGet<Driver[]>('/drivers', { session_key }, true),

  getLaps: (session_key: number, driver_number?: number) =>
    cachedGet<Lap[]>('/laps',
      { session_key, ...(driver_number ? { driver_number } : {}) }, true),

  getCarData: (session_key: number, driver_number: number, speed?: number) =>
    cachedGet<CarData[]>('/car_data', {
      session_key, driver_number,
      ...(speed ? { speed: `>=${speed}` } : {}),
    }, true),

  getCarDataForLap: async (session_key: number, driver_number: number, lap: Lap): Promise<CarData[]> => {
    if (!lap.date_start) throw new Error('该圈次缺少 date_start 字段')
    const dateStart = new Date(lap.date_start)
    if (isNaN(dateStart.getTime())) throw new Error('date_start 格式无效')

    const dateEnd = new Date(dateStart.getTime() + ((lap.lap_duration ?? 120) + 3) * 1000)
    const cacheKey = `car_data_lap_${session_key}_${driver_number}_${lap.lap_number}`
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.timestamp < HISTORICAL_CACHE_TTL) return hit.data as CarData[]

    // OpenF1 requires operator in key name: "date>" not value ">=..."
    const { data } = await carDataApi.get<CarData[]>('/car_data', {
      params: {
        session_key, driver_number,
        'date>': toOpenF1DateStr(new Date(dateStart.getTime() - 500)),
        'date<': toOpenF1DateStr(dateEnd),
      },
    })
    const result = data ?? []
    cache.set(cacheKey, { data: result, timestamp: Date.now() })
    return result
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

  getLocationForLap: async (session_key: number, driver_number: number, lap: Lap): Promise<Location[]> => {
    if (!lap.date_start) return []
    const dateStart = new Date(lap.date_start)
    const dateEnd = new Date(dateStart.getTime() + ((lap.lap_duration ?? 120) + 3) * 1000)

    const cacheKey = `location_lap_${session_key}_${driver_number}_${lap.lap_number}`
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.timestamp < HISTORICAL_CACHE_TTL) return hit.data as Location[]

    const { data } = await carDataApi.get<Location[]>('/location', {
      params: {
        session_key, driver_number,
        'date>': toOpenF1DateStr(new Date(dateStart.getTime() - 500)),
        'date<': toOpenF1DateStr(dateEnd),
      },
    })
    const result = data ?? []
    cache.set(cacheKey, { data: result, timestamp: Date.now() })
    return result
  },
}

export function clearCache() {
  cache.clear()
}
