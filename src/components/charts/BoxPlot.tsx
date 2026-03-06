import { formatLapTime } from '../../utils/f1'

export interface BoxStats {
  name: string
  teamName: string
  color: string
  count: number
  min: number
  q1: number
  median: number
  q3: number
  max: number
  mean: number
  stdDev: number
  variance: number
  whiskerMin: number
  whiskerMax: number
  outliers: number[]
}

export function computeBoxStats(name: string, teamName: string, color: string, values: number[]): BoxStats {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length

  const quantile = (p: number) => {
    if (n === 0) return 0
    const idx = p * (n - 1)
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    return lo === hi ? sorted[lo] : sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo)
  }

  const q1 = quantile(0.25)
  const median = quantile(0.5)
  const q3 = quantile(0.75)
  const iqr = q3 - q1
  const lowerFence = q1 - 1.5 * iqr
  const upperFence = q3 + 1.5 * iqr

  const outliers = sorted.filter(v => v < lowerFence || v > upperFence)
  const inner = sorted.filter(v => v >= lowerFence && v <= upperFence)

  const mean = sorted.reduce((a, b) => a + b, 0) / n
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n

  return {
    name, teamName, color, count: n,
    min: sorted[0], q1, median, q3, max: sorted[n - 1],
    mean, stdDev: Math.sqrt(variance), variance,
    whiskerMin: inner[0] ?? sorted[0],
    whiskerMax: inner[inner.length - 1] ?? sorted[n - 1],
    outliers,
  }
}

// ─── SVG BoxPlot Chart ────────────────────────────────────────────────────────

const PAD = { top: 24, right: 16, bottom: 52, left: 72 }
const SVG_H = 340

function yScale(value: number, yMin: number, yMax: number, chartH: number): number {
  return PAD.top + (1 - (value - yMin) / (yMax - yMin)) * chartH
}

interface BoxPlotChartProps {
  data: BoxStats[]
  colWidth?: number
}

export function BoxPlotChart({ data, colWidth = 60 }: BoxPlotChartProps) {
  if (data.length === 0) return null

  const chartW = Math.max(data.length * colWidth + 40, 400)
  const chartH = SVG_H - PAD.top - PAD.bottom
  const svgW = chartW + PAD.left + PAD.right

  // Y range from whiskerMin - padding to whiskerMax + padding
  const allValues = data.flatMap(d => [d.whiskerMin, d.whiskerMax, ...d.outliers])
  const rawMin = Math.min(...allValues)
  const rawMax = Math.max(...allValues)
  const pad = (rawMax - rawMin) * 0.08
  const yMin = rawMin - pad
  const yMax = rawMax + pad

  // Y-axis ticks
  const yTicks: number[] = []
  const tickStep = Math.ceil((rawMax - rawMin) / 6 / 0.5) * 0.5
  let tick = Math.floor(rawMin / tickStep) * tickStep
  while (tick <= rawMax + tickStep) { yTicks.push(tick); tick += tickStep }

  const bw = colWidth * 0.48  // box width
  const cw = colWidth * 0.28  // whisker cap width

  const ys = (v: number) => yScale(v, yMin, yMax, chartH)
  const cx = (i: number) => PAD.left + i * colWidth + colWidth / 2

  return (
    <div className="overflow-x-auto">
      <svg
        width={svgW}
        height={SVG_H}
        viewBox={`0 0 ${svgW} ${SVG_H}`}
        className="block"
      >
        {/* Grid lines */}
        {yTicks.map(t => (
          <g key={t}>
            <line
              x1={PAD.left} x2={PAD.left + chartW}
              y1={ys(t)} y2={ys(t)}
              stroke="#383850" strokeWidth={1}
            />
            <text
              x={PAD.left - 6} y={ys(t)}
              textAnchor="end" dominantBaseline="middle"
              fontSize={10} fill="#8888aa"
            >
              {formatLapTime(t)}
            </text>
          </g>
        ))}

        {/* Mean reference line (fastest mean) */}
        {(() => {
          const bestMean = Math.min(...data.map(d => d.mean))
          return (
            <line
              x1={PAD.left} x2={PAD.left + chartW}
              y1={ys(bestMean)} y2={ys(bestMean)}
              stroke="#ffd700" strokeWidth={1} strokeDasharray="4 3" opacity={0.5}
            />
          )
        })()}

        {/* Box plots */}
        {data.map((d, i) => {
          const x = cx(i)
          return (
            <g key={d.name}>
              {/* Whisker line (vertical) */}
              <line x1={x} x2={x} y1={ys(d.whiskerMax)} y2={ys(d.whiskerMin)}
                stroke={d.color} strokeWidth={1.5} />
              {/* Whisker caps */}
              <line x1={x - cw / 2} x2={x + cw / 2} y1={ys(d.whiskerMax)} y2={ys(d.whiskerMax)}
                stroke={d.color} strokeWidth={1.5} />
              <line x1={x - cw / 2} x2={x + cw / 2} y1={ys(d.whiskerMin)} y2={ys(d.whiskerMin)}
                stroke={d.color} strokeWidth={1.5} />
              {/* IQR box */}
              <rect
                x={x - bw / 2} y={ys(d.q3)}
                width={bw} height={Math.max(ys(d.q1) - ys(d.q3), 2)}
                fill={d.color} fillOpacity={0.25}
                stroke={d.color} strokeWidth={1.5} rx={2}
              />
              {/* Median line */}
              <line x1={x - bw / 2} x2={x + bw / 2} y1={ys(d.median)} y2={ys(d.median)}
                stroke={d.color} strokeWidth={2.5} />
              {/* Mean diamond */}
              <polygon
                points={`${x},${ys(d.mean) - 4} ${x + 4},${ys(d.mean)} ${x},${ys(d.mean) + 4} ${x - 4},${ys(d.mean)}`}
                fill={d.color} opacity={0.9}
              />
              {/* Outliers */}
              {d.outliers.map((v, oi) => (
                <circle key={oi} cx={x} cy={ys(v)} r={3}
                  fill="none" stroke={d.color} strokeWidth={1.5} opacity={0.7} />
              ))}
              {/* Driver label */}
              <text x={x} y={SVG_H - PAD.bottom + 14}
                textAnchor="middle" fontSize={11} fontWeight="600" fill={d.color}>
                {d.name}
              </text>
              <text x={x} y={SVG_H - PAD.bottom + 28}
                textAnchor="middle" fontSize={9} fill="#8888aa">
                {d.count}圈
              </text>
            </g>
          )
        })}

        {/* Y-axis line */}
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + chartH}
          stroke="#383850" strokeWidth={1} />

        {/* Legend */}
        <g transform={`translate(${PAD.left + 8}, ${SVG_H - 10})`}>
          {[
            { shape: 'rect', label: 'IQR (Q1–Q3)' },
            { shape: 'line', label: '中位数' },
            { shape: 'diamond', label: '均值' },
            { shape: 'circle', label: '异常值' },
          ].map(({ shape, label }, i) => {
            const bx = i * 100
            return (
              <g key={label} transform={`translate(${bx}, 0)`}>
                {shape === 'rect' && <rect x={0} y={-6} width={12} height={8} fill="#888" fillOpacity={0.3} stroke="#888" strokeWidth={1} rx={1} />}
                {shape === 'line' && <line x1={0} x2={12} y1={-2} y2={-2} stroke="#888" strokeWidth={2} />}
                {shape === 'diamond' && <polygon points="6,-6 10,-2 6,2 2,-2" fill="#888" />}
                {shape === 'circle' && <circle cx={6} cy={-2} r={3} fill="none" stroke="#888" strokeWidth={1.5} />}
                <text x={16} y={2} fontSize={9} fill="#8888aa">{label}</text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

// ─── Statistics Table ─────────────────────────────────────────────────────────

export function BoxStatsTable({ data }: { data: BoxStats[] }) {
  const fastest = Math.min(...data.map(d => d.median))

  return (
    <div className="overflow-x-auto mt-4">
      <table className="w-full text-xs min-w-[640px]">
        <thead>
          <tr className="border-b border-f1-border">
            {['车手', '有效圈数', '最快圈', '均值', '中位数', '标准差', '方差', 'Q1', 'Q3', 'IQR'].map(h => (
              <th key={h} className="text-left text-f1-muted font-medium py-2 pr-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...data].sort((a, b) => a.median - b.median).map(d => {
            const gapToFastest = d.median - fastest
            return (
              <tr key={d.name} className="border-b border-f1-border/40 hover:bg-f1-gray/30">
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="font-semibold text-white">{d.name}</span>
                  </div>
                </td>
                <td className="py-2 pr-3 text-f1-muted">{d.count}</td>
                <td className="py-2 pr-3 font-mono text-white">{formatLapTime(d.whiskerMin)}</td>
                <td className="py-2 pr-3 font-mono text-white">{formatLapTime(d.mean)}</td>
                <td className="py-2 pr-3">
                  <span className="font-mono text-white">{formatLapTime(d.median)}</span>
                  {gapToFastest > 0.001 && (
                    <span className="text-red-400 font-mono ml-1">+{gapToFastest.toFixed(3)}</span>
                  )}
                </td>
                <td className="py-2 pr-3 font-mono text-f1-muted">{d.stdDev.toFixed(3)}s</td>
                <td className="py-2 pr-3 font-mono text-f1-muted">{d.variance.toFixed(4)}</td>
                <td className="py-2 pr-3 font-mono text-f1-muted">{formatLapTime(d.q1)}</td>
                <td className="py-2 pr-3 font-mono text-f1-muted">{formatLapTime(d.q3)}</td>
                <td className="py-2 font-mono text-f1-muted">{(d.q3 - d.q1).toFixed(3)}s</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
