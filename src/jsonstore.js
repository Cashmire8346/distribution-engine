// Small atomic JSON-file store shared by the campaign, royalty and release
// stores. Fail loud: a corrupt file throws instead of reading as empty, because
// reading as empty and then writing would erase the real records.

import fs from 'node:fs'
import path from 'node:path'

export function readJsonFile(file, fallback) {
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
  if (raw.trim() === '') return fallback
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`Store file is not valid JSON, refusing to overwrite it: ${file}`)
  }
}

export function writeJsonFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}
