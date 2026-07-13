// The 12 config-driven personas (backend: app/engine/personas/configs/*.yaml).
// Keys match the YAML stems and are what /fund/config's active_personas expects.
// An empty active_personas list (or ["all"]) means "run every persona".

export interface PersonaMeta {
  key: string;
  name: string;
  blurb: string;
}

export const PERSONAS: PersonaMeta[] = [
  { key: 'buffett', name: 'Warren Buffett', blurb: 'Value investing with an economic-moat focus.' },
  { key: 'munger', name: 'Charlie Munger', blurb: 'Quality businesses at fair prices; mental models.' },
  { key: 'graham', name: 'Benjamin Graham', blurb: 'Deep value and margin of safety.' },
  { key: 'pabrai', name: 'Mohnish Pabrai', blurb: 'Low-risk, high-uncertainty cloning bets.' },
  { key: 'lynch', name: 'Peter Lynch', blurb: 'Growth at a reasonable price; buy what you know.' },
  { key: 'fisher', name: 'Philip Fisher', blurb: 'Scuttlebutt growth and durable franchises.' },
  { key: 'wood', name: 'Cathie Wood', blurb: 'Disruptive innovation and secular growth.' },
  { key: 'damodaran', name: 'Aswath Damodaran', blurb: 'Intrinsic valuation and story-to-numbers.' },
  { key: 'druckenmiller', name: 'Stanley Druckenmiller', blurb: 'Macro-driven, momentum and liquidity.' },
  { key: 'burry', name: 'Michael Burry', blurb: 'Contrarian deep value and asymmetric risk.' },
  { key: 'jhunjhunwala', name: 'Rakesh Jhunjhunwala', blurb: 'India growth stories with conviction.' },
  { key: 'ackman', name: 'Bill Ackman', blurb: 'Concentrated, activist quality positions.' },
];

export const PERSONA_KEYS = PERSONAS.map((p) => p.key);

const BY_AGENT: Record<string, PersonaMeta> = Object.fromEntries(
  PERSONAS.map((p) => [`${p.key}_analyst`, p]),
);

// Analysts aren't personas but appear alongside them in signals — label them nicely.
const ANALYST_NAMES: Record<string, string> = {
  fundamentals_analyst: 'Fundamentals',
  technical_analyst: 'Technical',
  sentiment_analyst: 'Sentiment',
  valuation_analyst: 'Valuation',
  growth_analyst: 'Growth',
  macro_regime_analyst: 'Macro Regime',
};

export function isPersona(agentId: string): boolean {
  return agentId in BY_AGENT;
}

export function displayForAgent(agentId: string): string {
  if (BY_AGENT[agentId]) return BY_AGENT[agentId].name;
  if (ANALYST_NAMES[agentId]) return ANALYST_NAMES[agentId];
  return agentId.replace(/_analyst$/i, '').replace(/_/g, ' ');
}
