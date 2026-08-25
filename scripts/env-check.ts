import "./load-env"
import { describeEnvironment, assertRequiredEnv, environmentClass } from "../lib/env"
import { readRedisEnvironmentMarker, setRedisEnvironmentMarker } from "../lib/store"
import { readBlobEnvironmentMarker, setBlobEnvironmentMarker } from "../lib/blob-env"

/**
 * Answers one question, safely: which environment am I actually connected to?
 *
 * Prints fingerprints, never values. The fingerprints exist so two
 * environments can be compared — if dev and prod show the same
 * sessionSecretFingerprint, they are signing sessions with the same key and a
 * dev leak forges production sessions. That is exactly the condition this
 * script was written to make visible.
 *
 *   npm run env:check              report only
 *   npm run env:check -- --claim   label an UNMARKED database for this env
 *
 * --claim deliberately refuses to overwrite an existing marker, so it can
 * never silently relabel production as development.
 */
async function main() {
  const report = describeEnvironment()
  const claim = process.argv.includes("--claim")

  console.log("")
  console.log("  OneFlyer environment check")
  console.log("  " + "-".repeat(46))
  console.log(`  app environment          : ${report.environment}`)
  console.log(`  VERCEL_ENV               : ${process.env.VERCEL_ENV ?? "(unset — local)"}`)
  console.log(`  NODE_ENV                 : ${process.env.NODE_ENV ?? "(unset)"}`)
  console.log("")
  console.log(`  redis host fingerprint   : ${report.redisHostFingerprint}`)
  console.log(`  session secret fingerprint: ${report.sessionSecretFingerprint}`)
  console.log("  (fingerprints only — compare across environments; they must DIFFER)")
  console.log("")

  let marker: string | null = null
  try {
    marker = await readRedisEnvironmentMarker()
  } catch (e) {
    console.log(`  redis marker             : UNREACHABLE (${e instanceof Error ? e.message : "error"})`)
  }

  if (marker === null) {
    console.log("  redis marker             : (unmarked)")
    if (claim) {
      await setRedisEnvironmentMarker(report.environment)
      console.log(`  -> claimed this database as "${report.environment}"`)
    } else {
      console.log(`  -> run with --claim to label it "${report.environment}"`)
    }
  } else {
    console.log(`  redis marker             : ${marker}`)
    if (claim && marker !== report.environment) {
      console.log(`  -> REFUSING to relabel an existing "${marker}" database. Change the connection instead.`)
    }
  }

  // Blob is guarded the same way, but by CLASS — one non-production store is
  // shared by development and preview. See lib/blob-env.ts.
  const expectedBlob = environmentClass(report.environment)
  let blobMarker: string | null = null
  let blobReachable = true
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    console.log("  blob marker              : (BLOB_READ_WRITE_TOKEN not set)")
    blobReachable = false
  } else {
    try {
      blobMarker = await readBlobEnvironmentMarker()
      console.log(`  blob marker              : ${blobMarker ?? "(unmarked)"}`)
    } catch (e) {
      blobReachable = false
      console.log(`  blob marker              : UNREACHABLE (${e instanceof Error ? e.message : "error"})`)
    }
    if (blobMarker === null && blobReachable) {
      if (claim) {
        await setBlobEnvironmentMarker(expectedBlob)
        blobMarker = expectedBlob
        console.log(`  -> claimed the Blob store as "${expectedBlob}"`)
      } else {
        console.log(`  -> run with --claim to label it "${expectedBlob}"`)
      }
    } else if (blobMarker !== null && claim && blobMarker !== expectedBlob) {
      console.log(`  -> REFUSING to relabel an existing "${blobMarker}" Blob store. Change the token instead.`)
    }
  }

  console.log("")
  const isolated = marker !== null && marker === report.environment
  console.log(`  REDIS ISOLATION          : ${isolated ? "OK — connected to this environment's own database" : "CHECK — marker does not match app environment"}`)
  const blobIsolated = !blobReachable || (blobMarker !== null && blobMarker === expectedBlob)
  console.log(`  BLOB ISOLATION           : ${blobIsolated ? "OK — connected to this environment class's own store" : "CHECK — marker does not match app environment"}`)
  if (report.environment === "development" && marker === "production") {
    console.log("  *** DEVELOPMENT IS POINTED AT PRODUCTION REDIS — fix before running the app ***")
  }
  if (expectedBlob !== "production" && blobMarker === "production") {
    console.log("  *** NON-PRODUCTION IS POINTED AT THE PRODUCTION BLOB STORE — fix before running the app ***")
  }

  if (report.missingRequired.length) console.log(`  MISSING REQUIRED         : ${report.missingRequired.join(", ")}`)
  if (report.missingOptional.length) console.log(`  missing optional         : ${report.missingOptional.join(", ")}`)
  console.log("")

  assertRequiredEnv()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
