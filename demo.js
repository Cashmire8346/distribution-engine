import { InMemoryIdentifierStore, generateErn, validateErnXml } from './src/index.js'
import { REQUIRED_ENV, getRuntimeConfig } from './src/config.js'

// Fail closed: the demo refuses to invent release values. Every required
// DMF_* value must come from the operator's environment.
const missingEnvironment = REQUIRED_ENV.filter((key) => !String(process.env[key] || '').trim())
if (missingEnvironment.length > 0) {
  throw new Error(`Set real release values before generating ERN: ${missingEnvironment.join(', ')}`)
}

const { release: releaseValues } = getRuntimeConfig()

const registry = new InMemoryIdentifierStore()
const release = registry.create({
  ...releaseValues,
  // approve against the message id unless a dedicated release id is supplied
  releaseId: String(process.env.DMF_RELEASE_ID || releaseValues.messageId).trim()
})

const xml = generateErn(release)
if (!validateErnXml(xml)) throw new Error('Generated ERN failed structural validation')
console.log(xml)
