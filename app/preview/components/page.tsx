import { RefreshSiteHeader } from "@/components/refresh/site-header"
import { RefreshSiteFooter } from "@/components/refresh/site-footer"
import { Button, ButtonLink, Card, FeatureTile, Field, Pill, SectionHeading, StatTile } from "@/components/refresh/ui"
import { SegmentedDemo } from "@/components/refresh/segmented-demo"

// /preview/components: every shared component of the refresh design (step A),
// for review in light and dark. Values here are labelled samples, not data.

const ICON = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--rf-muted)" }}>{title}</h2>
      {children}
    </section>
  )
}

export default function ComponentsPreview() {
  return (
    <>
      <RefreshSiteHeader />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px 64px", display: "flex", flexDirection: "column", gap: 40 }}>
        <p style={{ margin: 0, color: "var(--rf-muted)" }}>Design preview · step A · shared components. Numbers below are labelled samples.</p>

        <Block title="Section heading">
          <SectionHeading eyebrow="How it works" title="Three steps," accent="a few minutes." />
          <SectionHeading title="One promotion in." accent="Five pieces out." align="left" />
        </Block>

        <Block title="Buttons">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <Button size="lg">Primary large</Button>
            <Button>Primary</Button>
            <Button size="sm">Primary small</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="amber">Amber</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete</Button>
            <Button disabled>Disabled</Button>
            <ButtonLink href="#top" variant="outline">Link as button</ButtonLink>
          </div>
        </Block>

        <Block title="Pills">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Pill tone="primary">Pro</Pill>
            <Pill tone="blue">Basic</Pill>
            <Pill tone="neutral">Free trial</Pill>
            <Pill tone="teal">LIVE</Pill>
            <Pill tone="amber">PROOF</Pill>
            <Pill tone="solid-amber">MOST POPULAR</Pill>
            <Pill tone="pink">Social post</Pill>
            <Pill tone="green">Approved</Pill>
          </div>
        </Block>

        <Block title="Billing toggle">
          <SegmentedDemo />
        </Block>

        <Block title="Stat tiles">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            <StatTile label="Clients (sample)" value="12" />
            <StatTile label="Paying (sample)" value="5" accent="teal" />
            <StatTile label="Flyers this month (sample)" value="31" accent="blue" />
            <StatTile label="Organizations live (sample)" value="2" variant="navy" accent="amber" />
            <StatTile label="QR scans, 30 days" value="—" note="No data yet" />
          </div>
        </Block>

        <Block title="Feature tiles (five tints)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <FeatureTile tone="blue" icon={ICON} title="Print-ready flyer">Letter and print-shop sizes.</FeatureTile>
            <FeatureTile tone="pink" icon={ICON} title="Instagram post">A square graphic for your feed.</FeatureTile>
            <FeatureTile tone="teal" icon={ICON} title="Text message">Short copy for a text blast.</FeatureTile>
            <FeatureTile tone="green" icon={ICON} title="Nextdoor post">Neighborly copy for your feed.</FeatureTile>
            <FeatureTile tone="amber" icon={ICON} title="Trackable QR code">Scans and leads on your offer page.</FeatureTile>
          </div>
        </Block>

        <Block title="Cards">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            <Card><h3 style={{ margin: "0 0 6px", fontSize: 18 }}>Surface card</h3><p style={{ margin: 0, color: "var(--rf-muted)" }}>Default container for app content.</p></Card>
            <Card variant="soft"><h3 style={{ margin: "0 0 6px", fontSize: 18 }}>Soft card</h3><p style={{ margin: 0, color: "var(--rf-muted)" }}>Steps and secondary panels.</p></Card>
            <Card variant="navy"><h3 style={{ margin: "0 0 6px", fontSize: 18 }}>Navy card</h3><p style={{ margin: 0, color: "var(--rf-on-navy-2)" }}>Bands and highlights.</p></Card>
          </div>
        </Block>

        <Block title="Form fields">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            <Field id="pv-org" label="Organization name"><input id="pv-org" className="rf-input" placeholder="Sample Benefits Co." /></Field>
            <Field id="pv-email" label="Work email" hint="We'll send setup steps here."><input id="pv-email" type="email" className="rf-input" placeholder="you@example.com" /></Field>
          </div>
        </Block>
      </main>
      <RefreshSiteFooter />
    </>
  )
}
