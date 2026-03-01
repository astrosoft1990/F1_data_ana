import { HashRouter as BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/common/Layout'
import Home from './pages/Home'
import RaceAnalysis from './pages/RaceAnalysis'
import DriverComparison from './pages/DriverComparison'
import Telemetry from './pages/Telemetry'
import TireStrategy from './pages/TireStrategy'
import Standings from './pages/Standings'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/standings" element={<Standings />} />
          <Route path="/race" element={<RaceAnalysis />} />
          <Route path="/comparison" element={<DriverComparison />} />
          <Route path="/telemetry" element={<Telemetry />} />
          <Route path="/strategy" element={<TireStrategy />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
