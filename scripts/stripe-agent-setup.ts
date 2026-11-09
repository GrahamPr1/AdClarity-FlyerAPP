/**
 * One-off: the agent Pro billing setup in the Stripe SANDBOX. Prints the env
 * lines to paste into .env.local.
 *
 *   npm run stripe:agent-setup
 *
 * Refuses anything but a test-mode key. It does NOT create the agent price:
 * the account owner creates "OneFlyer Agent Pro" ($40/month, tax-exclusive,
 * lookup key oneflyer_agent_pro_monthly_v1) by hand; this finds it by lookup
 * key and checks it. It creates (or updates in place) the agent Customer
 * Portal configuration, found by metadata oneflyer=agent-pro: card, invoices,
 * cancel at period end, and NO plan switching, so an agent can never move to
 * an SMB price. Safe to re-run. The SMB configuration is never touched.
 */
import "./load-env"
import Stripe from "stripe"
import { STRIPE_API_VERSION } from "../lib/stripe"

const LOOKUP_KEY = "oneflyer_agent_pro_monthly_v1"

async function main() {
  const key = process.env.STRIPE_SECRET_KEY ?? ""
  if (!/^(sk|rk)_test_/.test(key)) throw new Error("stripe:agent-setup only runs against a sandbox (sk_test_/rk_test_) key.")
  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION })

  const prices = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], active: true, expand: ["data.product"] })
  const price = prices.data[0]
  if (!price) throw new Error(`No active price with lookup key ${LOOKUP_KEY}. Create it in the dashboard first.`)
  const product = price.product as Stripe.Product
  const problems = [
    price.unit_amount !== 4000 && `amount is ${price.unit_amount}, expected 4000`,
    price.currency !== "usd" && `currency is ${price.currency}`,
    price.recurring?.interval !== "month" && `interval is ${price.recurring?.interval}`,
    price.tax_behavior !== "exclusive" && `tax behavior is ${price.tax_behavior}, expected exclusive`,
  ].filter(Boolean)
  if (problems.length) throw new Error(`Agent price ${price.id}: ${problems.join("; ")}`)
  console.log(`found    agent price          ${price.id} (${product.name})`)

  const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
    customer_update: { enabled: true, allowed_updates: ["email", "address"] },
    subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: true, options: ["too_expensive", "missing_features", "unused", "other"] } },
    subscription_update: { enabled: false },
  }
  const business_profile = { headline: "OneFlyer — manage your agent Pro plan" }
  let config: Stripe.BillingPortal.Configuration | null = null
  for await (const c of stripe.billingPortal.configurations.list({ limit: 100 })) {
    if (c.metadata?.oneflyer === "agent-pro") {
      config = await stripe.billingPortal.configurations.update(c.id, { features, business_profile, default_return_url: "https://oneflyer.org/agent" })
      console.log(`updated  agent portal         ${config.id}`)
      break
    }
  }
  if (!config) {
    config = await stripe.billingPortal.configurations.create({ features, business_profile, default_return_url: "https://oneflyer.org/agent", metadata: { oneflyer: "agent-pro" } })
    console.log(`created  agent portal         ${config.id}`)
  }
  console.log(`\nSTRIPE_PRICE_AGENT_PRO_MONTHLY=${price.id}\nSTRIPE_AGENT_PORTAL_CONFIGURATION_ID=${config.id}\n(STRIPE_AGENT_WEBHOOK_SECRET: from \`stripe listen\` locally, or the endpoint's signing secret)`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
