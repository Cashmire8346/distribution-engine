import { InMemoryIdentifierStore, generateErn, validateErnXml } from './src/index.js'

const requiredEnvironment = [
  'DMF_MESSAGE_ID',
  'DMF_SENDER_PARTY_ID',
  'DMF_SENDER_NAME',
  'DMF_RELEASE_TITLE',
  'DMF_ARTIST_NAME',
  'DMF_ISRC',
  'DMF_UPC',
  'DMF_DURATION',
  'DMF_OWNER_NAME',
  'DMF_OWNER_SHARE'
]

const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key])
if (missingEnvironment.length > 0) {
  throw new Error(`Set real release values before generating ERN: ${missingEnvironment.join(', ')}`)
}

const registry = new InMemoryIdentifierStore()
const release = registry.create({
  messageId: process.env.DMF_MESSAGE_ID,
  senderPartyId: process.env.DMF_SENDER_PARTY_ID,
  senderName: process.env.DMF_SENDER_NAME,
  title: process.env.DMF_RELEASE_TITLE,
  artist: process.env.DMF_ARTIST_NAME,
  isrc: process.env.DMF_ISRC,
  upc: process.env.DMF_UPC,
  duration: process.env.DMF_DURATION,
  owners: [{ name: process.env.DMF_OWNER_NAME, share: Number(process.env.DMF_OWNER_SHARE) }]
})

const xml = generateErn(release)
if (!validateErnXml(xml)) throw new Error('Generated ERN failed structural validation')
console.log(xml)
