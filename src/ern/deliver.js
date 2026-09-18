import fs from 'node:fs'
import path from 'node:path'
import { ApprovalGate, FileApprovalStore } from '../approvals/index.js'
import { generateErn, validateErnXml } from './index.js'

export function deliverErn(release, options = {}) {
  const approvalFile = options.approvalFile || 'approvals-export.json'
  const outputPath = options.outputPath || 'dist/ern-output.xml'
  const releaseId = release.releaseId || release.messageId

  const gate = new ApprovalGate(new FileApprovalStore(approvalFile))
  const decision = gate.canDeliver({ releaseId })

  if (!decision.approved) {
    return {
      approved: false,
      reason: decision.reason,
      outputPath: null,
      xml: null
    }
  }

  const xml = generateErn(release)
  if (!validateErnXml(xml)) {
    return {
      approved: false,
      reason: 'Generated ERN failed structural validation.',
      outputPath: null,
      xml: null
    }
  }

  const resolvedOutputPath = path.resolve(process.cwd(), outputPath)
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true })
  fs.writeFileSync(resolvedOutputPath, xml, 'utf8')

  return {
    approved: true,
    approval: decision.approval,
    outputPath: resolvedOutputPath,
    xml
  }
}
