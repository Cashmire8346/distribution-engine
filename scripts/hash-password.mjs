// Generate DMF_ADMIN_PASSWORD_HASH and DMF_SESSION_SECRET values.
//
//   node scripts/hash-password.mjs 'a long passphrase here'
//
// Paste the output into your environment (never commit it).

import crypto from 'node:crypto'

import { hashPassword } from '../src/auth/index.js'

const password = process.argv[2]
if (!password) {
  console.error("usage: node scripts/hash-password.mjs '<password, 12+ chars>'")
  process.exit(2)
}

try {
  console.log(`DMF_ADMIN_PASSWORD_HASH=${hashPassword(password)}`)
  console.log(`DMF_SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`)
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
