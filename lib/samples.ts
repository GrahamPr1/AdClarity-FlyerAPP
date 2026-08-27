/**
 * The "See what OneFlyer creates" gallery.
 *
 * These are SAMPLE OUTPUTS the owner generated with the product, shown as
 * examples of what it makes. They are explicitly NOT testimonials, NOT
 * customer quotes, and NOT attributed to any business — fabricating those
 * would be a false-advertising risk, and real customers' flyers are their
 * own and not ours to publish.
 *
 * Nothing here is pulled from the production database. To add a sample:
 *
 *   1. Generate it in the product like any other campaign.
 *   2. Open it, print to PDF or screenshot it, and save the image into
 *      /public/samples/ (PNG or JPG, roughly 1200px on the long edge).
 *   3. Add an entry below.
 *
 * The gallery renders nothing at all when this list is empty, rather than
 * showing placeholder frames — an empty gallery is honest, a gallery of grey
 * boxes looks broken.
 */

export interface FlyerSample {
  /** Filename inside /public/samples, e.g. "hvac-flyer.png". */
  image: string
  /** Short label, e.g. "Furnace promotion". Describes the PIECE, not a client. */
  label: string
  /** Which output format it is — shown as a chip. */
  format: "Flyer" | "One-pager" | "Proposal" | "Door hanger" | "Social post" | "Coloring page"
  /** The trade or use case it illustrates. Generic by design — never a real business name. */
  useCase: string
}

export const FLYER_SAMPLES: FlyerSample[] = [
  // Intentionally empty until real sample output is added — see the note
  // above. Example of the shape:
  //
  // { image: "hvac-furnace-flyer.png", label: "Furnace promotion", format: "Flyer", useCase: "HVAC" },
]

export const SAMPLES_DISCLAIMER =
  "Sample output produced with OneFlyer. Example businesses are fictional — these are not customer flyers or endorsements."
