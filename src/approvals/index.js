import fs from 'node:fs'
import path from 'node:path'

export class FileApprovalStore {
  constructor(filePath = 'approvals-export.json') {
    this.filePath = filePath
  }

  resolve() {
    return path.resolve(process.cwd(), this.filePath)
  }

  read() {
    const target = this.resolve()
    if (!fs.existsSync(target)) {
      return { fileExists: false, approvals: [] }
    }

    try {
      const raw = fs.readFileSync(target, 'utf8').trim()
      if (!raw) {
        return { fileExists: true, approvals: [] }
      }

      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.approvals)) {
        return { fileExists: true, approvals: parsed.approvals }
      }

      return { fileExists: true, approvals: [] }
    } catch {
      return { fileExists: true, approvals: [] }
    }
  }

  write(data) {
    const target = this.resolve()
    const dir = path.dirname(target)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(target, JSON.stringify(data, null, 2))
    return data
  }
}

export class ApprovalGate {
  constructor(store) {
    this.store = store instanceof FileApprovalStore ? store : new FileApprovalStore(store)
  }

  canDeliver({ releaseId }) {
    const snapshot = this.store.read()
    if (!snapshot.fileExists) {
      return { approved: false, reason: 'Missing approval export file. Delivery is denied by default.' }
    }

    const record = snapshot.approvals.find((approval) => String(approval.releaseId) === String(releaseId))
    if (!record) {
      return { approved: false, reason: 'No matching approval record found for this release.' }
    }

    if (record.status === 'approved') {
      const expiresAt = record.expiresAt || record.expires_at
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        return { approved: false, reason: 'Approval record has expired.' }
      }

      return { approved: true, approval: record }
    }

    if (record.status === 'pending') {
      return { approved: false, reason: 'Approval is still pending.' }
    }

    if (record.status === 'rejected') {
      return { approved: false, reason: 'Approval was rejected.' }
    }

    return { approved: false, reason: `Approval status is unknown: ${String(record.status || 'none')}.` }
  }
}
