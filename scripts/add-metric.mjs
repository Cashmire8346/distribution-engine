// Record one sourced roster metric.
//
//   node scripts/add-metric.mjs "Freezzo" spotify monthly_listeners 1234 [asOf-ISO]
//
// asOf defaults to now. Writes to $DATA_DIR/roster.json (default ./.data).
// There is deliberately no unauthenticated HTTP endpoint for this.

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { recordMetric } from '../src/roster/persist.js'

const [name, source, metricType, rawValue, asOf] = process.argv.slice(2)

if (!name || !source || !metricType || rawValue === undefined) {
  console.error('usage: node scripts/add-metric.mjs <artist> <source> <metricType> <value> [asOf-ISO]')
  process.exit(2)
}

const here = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.join(here, '..', '.data')
const file = path.join(dataDir, 'roster.json')

try {
  recordMetric(file, name, {
    source,
    metricType,
    value: Number(rawValue),
    asOf: asOf || new Date().toISOString()
  })
  console.log(`Recorded ${source} ${metricType}=${rawValue} for ${name} -> ${file}`)
} catch (error) {
  console.error(`Refused: ${error.message}`)
  process.exit(1)
}
