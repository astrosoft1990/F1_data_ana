import axios from 'axios'
import type { DriverStanding, ConstructorStanding, Race } from '../types/f1'

const BASE_URL = 'https://api.jolpi.ca/ergast/f1'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
})

const cache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

async function cachedGet<T>(url: string): Promise<T> {
  const cached = cache.get(url)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T
  }
  const response = await api.get<T>(url)
  cache.set(url, { data: response.data, timestamp: Date.now() })
  return response.data
}

interface StandingsResponse {
  MRData: {
    StandingsTable: {
      StandingsLists: Array<{
        DriverStandings?: DriverStanding[]
        ConstructorStandings?: ConstructorStanding[]
      }>
    }
  }
}

interface RacesResponse {
  MRData: {
    RaceTable: {
      Races: Race[]
    }
  }
}

export const jolpicaApi = {
  getDriverStandings: async (year: number): Promise<DriverStanding[]> => {
    const data = await cachedGet<StandingsResponse>(`/${year}/driverStandings.json?limit=30`)
    return data.MRData.StandingsTable.StandingsLists[0]?.DriverStandings || []
  },

  getConstructorStandings: async (year: number): Promise<ConstructorStanding[]> => {
    const data = await cachedGet<StandingsResponse>(`/${year}/constructorStandings.json?limit=20`)
    return data.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings || []
  },

  getRaces: async (year: number): Promise<Race[]> => {
    const data = await cachedGet<RacesResponse>(`/${year}/races.json?limit=30`)
    return data.MRData.RaceTable.Races || []
  },

  getRaceResults: async (year: number, round: number): Promise<Race | null> => {
    const data = await cachedGet<RacesResponse>(`/${year}/${round}/results.json?limit=30`)
    return data.MRData.RaceTable.Races[0] || null
  },
}
