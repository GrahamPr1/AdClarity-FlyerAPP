/**
 * One-off: creates the self-serve prices and the Customer Portal configuration
 * in the Stripe SANDBOX, then prints the env lines to paste into .env.local.
 *
 *   npm run stripe:setup
 *
 * Refuses anything but a test-mode key. Live products and prices are set up
 * by hand by the account owner — this script is never the way to do that.
 *
 * Safe to re-run. Prices are found by lookup_key and only created when
 * missing; the portal configuration is found by metadata and updated in
 * place. Stripe prices are immutable, so a changed amount needs a new
 * lookup_key here (bump its version), not an edit — and any older OneFlyer
 * price for that plan/interval is then archived, so exactly one stays active.
 *
 * Prices are tax-EXCLUSIVE: the advertised $19 / $39 is before tax, and
 * Stripe Tax adds tax on top at checkout where the account is registered.
 */
import "./load-env"
import Stripe from "stripe"
import { STRIPE_API_VERSION } from "../lib/stripe"

// Must match lib/plans.ts (monthlyFee / annualFee) to the cent.
// v2 annual: repriced to $180 / $360 (from $182.40 / $374.40).
const PLANS = [
  { plan: "basic", productName: "OneFlyer Basic", monthly: { amount: 1900, version: 1 }, annual: { amount: 18000, version: 2 } },
  { plan: "pro", productName: "OneFlyer Pro", monthly: { amount: 3900, version: 1 }, annual: { amount: 36000, version: 2 } },
] as const

async function main() {
  const key = process.env.STRIPE_SECRET_KEY ?? ""
  if (!/^(sk|rk)_test_/.test(key)) {
    throw new Error("stripe:setup only runs against a sandbox (sk_test_/rk_test_) key.")
  }
  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION })
  const env: string[] = []
  const portalProducts: Stripe.BillingPortal.ConfigurationCreateParams.Features.SubscriptionUpdate.Product[] = []

  for (const p of PLANS) {
    const product = await findOrCreateProduct(stripe, p.plan, p.productName)
    const ids: string[] = []
    for (const [interval, { amount, version }] of [["monthly", p.monthly], ["annual", p.annual]] as const) {
      const lookupKey = `oneflyer_${p.plan}_${interval}_v${version}`
      const existing = (await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 })).data[0]
      const price =
        existing ??
        (await stripe.prices.create({
          product: product.id,
          currency: "usd",
          unit_amount: amount,
          recurring: { interval: interval === "monthly" ? "month" : "year" },
          tax_behavior: "exclusive",
          lookup_key: lookupKey,
          nickname: `${p.productName} — ${interval}`,
          metadata: { oneflyer_plan: p.plan, oneflyer_interval: interval },
        }))
      console.log(`${existing ? "exists " : "created"}  ${lookupKey}  ${price.id}  $${(price.unit_amount! / 100).toFixed(2)}`)
      env.push(`STRIPE_PRICE_${p.plan.toUpperCase()}_${interval.toUpperCase()}=${price.id}`)
      ids.push(price.id)
      await archiveSuperseded(stripe, product.id, p.plan, interval, price.id)
    }
    portalProducts.push({ product: product.id, prices: ids })
  }

  const portal = await upsertPortalConfiguration(stripe, portalProducts)
  env.push(`STRIPE_PORTAL_CONFIGURATION_ID=${portal.id}`)

  console.log("\n# Add to .env.local:\n" + env.join("\n"))
}

/** Archives any other active OneFlyer price for this plan + interval (an older version). */
async function archiveSuperseded(stripe: Stripe, productId: string, plan: string, interval: string, keepId: string) {
  for await (const old of stripe.prices.list({ product: productId, active: true, limit: 100 })) {
    if (old.id === keepId || !old.lookup_key?.startsWith(`oneflyer_${plan}_${interval}_v`)) continue
    await stripe.prices.update(old.id, { active: false })
    console.log(`archived ${old.lookup_key}  ${old.id}  $${(old.unit_amount! / 100).toFixed(2)}`)
  }
}

async function findOrCreateProduct(stripe: Stripe, plan: string, name: string): Promise<Stripe.Product> {
  // Reuses the products already in the sandbox by name, tagging them so the
  // next run finds them by metadata even if renamed.
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    if (product.metadata.oneflyer_plan === plan || product.name === name) {
      if (product.metadata.oneflyer_plan !== plan) {
        await stripe.products.update(product.id, { metadata: { oneflyer_plan: plan } })
      }
      return product
    }
  }
  return stripe.products.create({ name, metadata: { oneflyer_plan: plan } })
}

async function upsertPortalConfiguration(
  stripe: Stripe,
  products: Stripe.BillingPortal.ConfigurationCreateParams.Features.SubscriptionUpdate.Product[],
): Promise<Stripe.BillingPortal.Configuration> {
  const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
    customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
    // At period end, matching the published refund policy: "You keep access
    // until the end of the period you've paid for."
    subscription_cancel: {
      enabled: true,
      mode: "at_period_end",
      cancellation_reason: {
        enabled: true,
        options: ["too_expensive", "missing_features", "unused", "switched_service", "other"],
      },
    },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "create_prorations",
      products,
    },
  }
  for await (const config of stripe.billingPortal.configurations.list({ limit: 100 })) {
    if (config.metadata?.oneflyer === "self-serve") {
      const updated = await stripe.billingPortal.configurations.update(config.id, { features })
      console.log(`updated  portal configuration  ${updated.id}`)
      return updated
    }
  }
  const created = await stripe.billingPortal.configurations.create({
    features,
    metadata: { oneflyer: "self-serve" },
    business_profile: { headline: "OneFlyer — manage your plan" },
  })
  console.log(`created  portal configuration  ${created.id}`)
  return created
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
