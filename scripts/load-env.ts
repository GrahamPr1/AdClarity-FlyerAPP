// Next.js auto-loads .env.local when run via `next dev`/`next build`, but
// these standalone test scripts run outside that CLI, so load it manually.
// Assumes the script is run from the project root (npm run test:*).
import { config } from "dotenv"

config({ path: "./.env.local" })
