export interface DialogueNode {
  id: string
  speaker: string
  text: string
  choices?: { label: string; next?: string; action?: string }[]
}

export const DIALOGUES: Record<string, DialogueNode> = {
  intro_1: {
    id: 'intro_1',
    speaker: 'Narrator',
    text: "You've inherited your grandfather's old farm. The land is overgrown, the house is crumbling... and there's a mountain of debt.",
    choices: [{ label: 'Continue', next: 'intro_2' }],
  },
  intro_2: {
    id: 'intro_2',
    speaker: 'Narrator',
    text: "A local moneylender named Mr. Grimes holds the deed. He expects payment within 21 days, or the farm is his.",
    choices: [{ label: "I'll make it work", next: 'intro_3' }],
  },
  intro_3: {
    id: 'intro_3',
    speaker: 'Narrator',
    text: "Clear the land, plant crops, explore the old mine for valuables, and sell everything you can. Good luck.",
    choices: [{ label: 'Start Farming' }],
  },
  grimes_first: {
    id: 'grimes_first',
    speaker: 'Mr. Grimes',
    text: "Well well. You actually showed up. Your granddaddy owed me 5,000 gold. You've got until day 21 to pay up.",
    choices: [
      { label: "I'll have the money", next: 'grimes_confident' },
      { label: 'Can I get more time?', next: 'grimes_notime' },
    ],
  },
  grimes_confident: {
    id: 'grimes_confident',
    speaker: 'Mr. Grimes',
    text: "Ha! We'll see about that. I'll be back to collect. Don't disappoint me.",
  },
  grimes_notime: {
    id: 'grimes_notime',
    speaker: 'Mr. Grimes',
    text: "Time's already been generous. Day 21. Not a day later. Get to work.",
  },
  grimes_visit: {
    id: 'grimes_visit',
    speaker: 'Mr. Grimes',
    text: "Tick tock. How's that purse looking?",
    choices: [
      { label: 'Pay full debt', action: 'pay_full' },
      { label: 'Pay partial (500g)', action: 'pay_partial' },
      { label: 'Not yet', next: 'grimes_threaten' },
    ],
  },
  grimes_threaten: {
    id: 'grimes_threaten',
    speaker: 'Mr. Grimes',
    text: "You're running out of days. This land will be mine soon enough.",
  },
  grimes_paid: {
    id: 'grimes_paid',
    speaker: 'Mr. Grimes',
    text: "Hmph. Acceptable. Keep it up and you might just keep this dump.",
  },
  grimes_partial: {
    id: 'grimes_partial',
    speaker: 'Mr. Grimes',
    text: "Better than nothing. But don't think this buys you mercy. The clock still ticks.",
  },
  shopkeeper_intro: {
    id: 'shopkeeper_intro',
    speaker: 'Martha',
    text: "Welcome to the General Store! I've got seeds, and I buy produce and minerals. Need anything?",
    choices: [{ label: 'Browse wares', action: 'open_shop' }],
  },
  win: {
    id: 'win',
    speaker: 'Narrator',
    text: "The debt is paid in full! Mr. Grimes scowls as he tears up the deed. The farm is yours, free and clear. Your grandfather would be proud.",
    choices: [{ label: 'Continue Playing' }, { label: 'Title Screen', action: 'reset' }],
  },
  lose: {
    id: 'lose',
    speaker: 'Mr. Grimes',
    text: "Time's up. This farm belongs to me now. Pack your things.",
    choices: [{ label: 'Try Again', action: 'reset' }],
  },
}
