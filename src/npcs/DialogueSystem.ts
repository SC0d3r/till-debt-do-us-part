import { sound } from '../core/SoundManager'

interface DialogueEntry {
  speaker: string
  text: string
  choices?: Array<{ label: string; action: string }>
}

const DIALOGUES: Record<string, DialogueEntry> = {
  intro_1: {
    speaker: 'Narrator',
    text: "You've inherited your grandpa's old farm. It's seen better days... There's a debt of 5,000 gold hanging over it. You have 21 days to pay it off, or the bank takes everything.",
    choices: [{ label: "I'll do my best!", action: 'close' }],
  },
  grimes_first: {
    speaker: 'Mr. Grimes',
    text: "Well well well! So YOU'RE the one who inherited this dump? I'm Mr. Grimes, from the bank. Your grandpa owed us 5,000 gold. You've got until day 21. I'll be checking in every 5 days. Don't disappoint me.",
    choices: [{ label: "I won't let you down!", action: 'close' }],
  },
  grimes_visit: {
    speaker: 'Mr. Grimes',
    text: "Time's ticking! How's that debt coming along? I'm here to collect what you can pay.",
    choices: [
      { label: 'Pay Full Amount', action: 'pay_full' },
      { label: 'Pay 500g', action: 'pay_partial' },
      { label: "I need more time...", action: 'close' },
    ],
  },
  grimes_paid: {
    speaker: 'Mr. Grimes',
    text: "Hmph. Full payment. I suppose you're more capable than your grandpa gave you credit for. The debt is cleared. This farm is yours free and clear.",
    choices: [{ label: 'Thank goodness!', action: 'close' }],
  },
  grimes_partial: {
    speaker: 'Mr. Grimes',
    text: "A partial payment? Fine, I'll take what I can get. But don't think this buys you forever. The clock is still ticking.",
    choices: [{ label: "I'll keep working.", action: 'close' }],
  },
  win: {
    speaker: '🎉 Congratulations!',
    text: "You've paid off the entire debt! The farm is yours! Your grandpa would be so proud. The seasons will continue, and your legacy grows stronger each day.",
    choices: [{ label: 'Keep Farming!', action: 'close' }, { label: 'Start Over', action: 'reset' }],
  },
  lose: {
    speaker: '💔 Game Over',
    text: "Day 21 has passed and the debt remains unpaid. Mr. Grimes arrives with the foreclosure papers. The farm is lost... But maybe next time things will go differently.",
    choices: [{ label: 'Try Again', action: 'reset' }],
  },
  spoil_notice: {
    speaker: '⚠️ Notice',
    text: "Some crops wilted overnight because they weren't watered! Remember: crops MUST be watered each day or they'll spoil by morning.",
    choices: [{ label: "I'll remember.", action: 'close' }],
  },
  tool_broken: {
    speaker: '🔧 Tool Broken!',
    text: "This tool is worn out and can't be used anymore! Visit the shop to repair it, or buy a replacement.",
    choices: [{ label: 'Got it.', action: 'close' }],
  },
  no_water: {
    speaker: '💧 Empty!',
    text: "Your watering can is empty! Go to the well and press E to refill it.",
    choices: [{ label: 'OK', action: 'close' }],
  },
}

export class DialogueSystem {
  active = false
  private dialogBox: HTMLElement
  private speakerEl: HTMLElement
  private textEl: HTMLElement
  private choicesEl: HTMLElement
  private onChoice: ((action: string) => void) | null = null

  constructor() {
    this.dialogBox = document.getElementById('dialog-box')!
    this.speakerEl = document.getElementById('dialog-speaker')!
    this.textEl = document.getElementById('dialog-text')!
    this.choicesEl = document.getElementById('dialog-choices')!
  }

  show(id: string, onChoice?: (action: string) => void) {
    const entry = DIALOGUES[id]
    if (!entry) return

    this.active = true
    this.onChoice = onChoice || null
    sound.menuOpen()

    this.speakerEl.textContent = entry.speaker
    this.textEl.textContent = ''
    this.choicesEl.innerHTML = ''
    this.dialogBox.style.display = 'block'

    // Typewriter effect
    let charIdx = 0
    const typeInterval = setInterval(() => {
      if (charIdx < entry.text.length) {
        this.textEl.textContent += entry.text[charIdx]
        charIdx++
      } else {
        clearInterval(typeInterval)
        this.showChoices(entry.choices)
      }
    }, 25)

    // Allow skip by clicking
    const skipHandler = () => {
      if (charIdx < entry.text.length) {
        clearInterval(typeInterval)
        this.textEl.textContent = entry.text
        this.showChoices(entry.choices)
      }
      this.dialogBox.removeEventListener('click', skipHandler)
    }
    this.dialogBox.addEventListener('click', skipHandler)
  }

  private showChoices(choices?: Array<{ label: string; action: string }>) {
    this.choicesEl.innerHTML = ''
    if (!choices) {
      this.close()
      return
    }
    for (const choice of choices) {
      const btn = document.createElement('button')
      btn.className = 'dialog-choice'
      btn.textContent = choice.label
      btn.onclick = (e) => {
        e.stopPropagation()
        sound.menuSelect()
        this.close()
        this.onChoice?.(choice.action)
      }
      this.choicesEl.appendChild(btn)
    }
  }

  close() {
    this.active = false
    this.dialogBox.style.display = 'none'
    this.onChoice = null
  }
}
