// OpenF1 API Types

export interface Session {
  circuit_key: number
  circuit_short_name: string
  country_code: string
  country_key: number
  country_name: string
  date_end: string
  date_start: string
  gmt_offset: string
  location: string
  meeting_key: number
  meeting_name: string
  meeting_official_name: string
  session_key: number
  session_name: string
  session_type: 'Race' | 'Qualifying' | 'Sprint' | 'Sprint Qualifying' | 'Practice 1' | 'Practice 2' | 'Practice 3'
  year: number
}

export interface Driver {
  broadcast_name: string
  country_code: string
  driver_number: number
  first_name: string
  full_name: string
  headshot_url: string
  last_name: string
  meeting_key: number
  name_acronym: string
  session_key: number
  team_colour: string
  team_name: string
}

export interface Lap {
  date_start: string
  driver_number: number
  duration_sector_1: number | null
  duration_sector_2: number | null
  duration_sector_3: number | null
  i1_speed: number | null
  i2_speed: number | null
  is_pit_out_lap: boolean
  lap_duration: number | null
  lap_number: number
  meeting_key: number
  segments_sector_1: number[] | null
  segments_sector_2: number[] | null
  segments_sector_3: number[] | null
  session_key: number
  st_speed: number | null
}

export interface CarData {
  brake: number
  date: string
  driver_number: number
  drs: number
  meeting_key: number
  n_gear: number
  rpm: number
  session_key: number
  speed: number
  throttle: number
}

export interface Position {
  date: string
  driver_number: number
  meeting_key: number
  position: number
  session_key: number
}

export interface Pit {
  date: string
  driver_number: number
  lap_number: number
  meeting_key: number
  pit_duration: number
  session_key: number
}

export interface Stint {
  compound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET' | 'UNKNOWN'
  driver_number: number
  lap_end: number
  lap_start: number
  meeting_key: number
  session_key: number
  stint_number: number
  tyre_age_at_start: number
}

export interface Interval {
  date: string
  driver_number: number
  gap_to_leader: number | null
  interval: number | null
  meeting_key: number
  session_key: number
}

export interface Weather {
  air_temperature: number
  date: string
  humidity: number
  meeting_key: number
  pressure: number
  rainfall: number
  session_key: number
  track_temperature: number
  wind_direction: number
  wind_speed: number
}

export interface RaceControl {
  category: string
  date: string
  driver_number: number | null
  flag: string | null
  lap_number: number | null
  meeting_key: number
  message: string
  scope: string
  sector: number | null
  session_key: number
}

export interface Location {
  date: string
  driver_number: number
  meeting_key: number
  session_key: number
  x: number
  y: number
  z: number
}

// Jolpica/Ergast API Types
export interface DriverStanding {
  position: string
  positionText: string
  points: string
  wins: string
  Driver: {
    driverId: string
    permanentNumber: string
    code: string
    url: string
    givenName: string
    familyName: string
    dateOfBirth: string
    nationality: string
  }
  Constructors: Array<{
    constructorId: string
    url: string
    name: string
    nationality: string
  }>
}

export interface ConstructorStanding {
  position: string
  positionText: string
  points: string
  wins: string
  Constructor: {
    constructorId: string
    url: string
    name: string
    nationality: string
  }
}

export interface Race {
  season: string
  round: string
  url: string
  raceName: string
  Circuit: {
    circuitId: string
    url: string
    circuitName: string
    Location: {
      lat: string
      long: string
      locality: string
      country: string
    }
  }
  date: string
  time?: string
  Results?: RaceResult[]
}

export interface RaceResult {
  number: string
  position: string
  positionText: string
  points: string
  Driver: DriverStanding['Driver']
  Constructor: ConstructorStanding['Constructor']
  grid: string
  laps: string
  status: string
  Time?: {
    millis: string
    time: string
  }
  FastestLap?: {
    rank: string
    lap: string
    Time: { time: string }
    AverageSpeed: { units: string; speed: string }
  }
}

// App-level types
export type TireCompound = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET' | 'UNKNOWN'

export const TIRE_COLORS: Record<TireCompound, string> = {
  SOFT: '#e8002d',
  MEDIUM: '#ffd700',
  HARD: '#ffffff',
  INTERMEDIATE: '#39b54a',
  WET: '#0067ff',
  UNKNOWN: '#888888',
}

export const DRIVER_COLORS = [
  '#e8002d', '#ff8700', '#ffd700', '#00d2be', '#0067ff',
  '#dc0000', '#900000', '#2b4562', '#b6babd', '#005aff',
  '#00e2d2', '#52e252', '#ff61af', '#c92d4b', '#fe86bc',
  '#37bedd', '#6cd3bf', '#ff6961', '#8b0000', '#006f62',
]
