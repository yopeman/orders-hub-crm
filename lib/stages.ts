// Pipeline stages taken from the Orders Hub client life cycle flowchart.
// `next` is the suggested next action when a lead moves into that stage.

export type StageKey =
  | "prospect"
  | "greeted"
  | "other_channel"
  | "social_checked"
  | "problem_found"
  | "demo_offered"
  | "demo_sent"
  | "demo_done"
  | "reg_sent"
  | "registered"
  | "business_created"
  | "products_uploaded"
  | "link_shared"
  | "first_order"
  | "loyal"
  | "advocate"
  | "transferred"
  | "dropped";

export interface Stage {
  key: StageKey;
  label: string;
  next: string;
  closed?: boolean;
}

export const STAGES: Stage[] = [
  { key: "prospect", label: "Prospect found", next: "Send greeting" },
  { key: "greeted", label: "Greeting sent", next: "Check if they responded, then ask if they use social media" },
  { key: "other_channel", label: "Other channel", next: "Ask for other sales channels or social media management" },
  { key: "social_checked", label: "Uses social media", next: "Ask if collecting orders is a problem" },
  { key: "problem_found", label: "Order problem found", next: "Introduce Orders Hub and ask if they want a demo" },
  { key: "demo_offered", label: "Demo offered", next: "Send demo YouTube link" },
  { key: "demo_sent", label: "Demo sent", next: "Ask if they have questions about the demo" },
  { key: "demo_done", label: "Demo completed", next: "Ask them to register" },
  { key: "reg_sent", label: "Registration link sent", next: "Follow up until they register" },
  { key: "registered", label: "Registered", next: "Encourage them to create their business" },
  { key: "business_created", label: "Business created", next: "Encourage them to upload 5 products" },
  { key: "products_uploaded", label: "Products uploaded", next: "Encourage them to share the link on social media" },
  { key: "link_shared", label: "Link shared", next: "Wait for first order and help if needed" },
  { key: "first_order", label: "First order accepted", next: "Encourage them to keep using Orders Hub" },
  { key: "loyal", label: "Loyal customer", next: "Ask them to recommend Orders Hub" },
  { key: "advocate", label: "Advocate", next: "Keep the relationship warm" },
  { key: "transferred", label: "Transferred to partner", next: "Confirm the partner has taken over", closed: true },
  { key: "dropped", label: "Dropped", next: "", closed: true },
];

export const STAGE_KEYS = STAGES.map((s) => s.key);

export const stageByKey = (key: string): Stage =>
  STAGES.find((s) => s.key === key) ?? STAGES[0];
