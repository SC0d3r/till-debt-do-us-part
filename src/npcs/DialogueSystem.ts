import { sound } from '../core/SoundManager'
import { t } from '../core/i18n'

interface DialogueEntry {
  speakerKey: string
  textKey: string
  choices?: Array<{ labelKey: string; action: string }>
}

const DIALOGUES: Record<string, DialogueEntry> = {
  intro_1: {
    speakerKey: 'dlg_narrator',
    textKey: 'dlg_intro_1',
    choices: [{ labelKey: 'dlg_best', action: 'close' }],
  },
  grimes_first: {
    speakerKey: 'dlg_grimes',
    textKey: 'dlg_grimes_first',
    choices: [{ labelKey: 'dlg_wont_let_down', action: 'close' }],
  },
  grimes_visit: {
    speakerKey: 'dlg_grimes',
    textKey: 'dlg_grimes_visit',
    choices: [
      { labelKey: 'dlg_pay_full', action: 'pay_full' },
      { labelKey: 'dlg_pay_partial', action: 'pay_partial' },
      { labelKey: 'dlg_more_time', action: 'close' },
    ],
  },
  grimes_paid: {
    speakerKey: 'dlg_grimes',
    textKey: 'dlg_grimes_paid',
    choices: [{ labelKey: 'dlg_thank_goodness', action: 'close' }],
  },
  grimes_partial: {
    speakerKey: 'dlg_grimes',
    textKey: 'dlg_grimes_partial',
    choices: [{ labelKey: 'dlg_keep_working', action: 'close' }],
  },
  win: {
    speakerKey: 'dlg_congrats',
    textKey: 'dlg_win',
    choices: [{ labelKey: 'dlg_keep_farming', action: 'close' }, { labelKey: 'dlg_start_over', action: 'reset' }],
  },
  lose: {
    speakerKey: 'dlg_game_over',
    textKey: 'dlg_lose',
    choices: [{ labelKey: 'dlg_try_again', action: 'reset' }],
  },
  spoil_notice: {
    speakerKey: 'dlg_notice',
    textKey: 'dlg_spoil',
    choices: [{ labelKey: 'dlg_remember', action: 'close' }],
  },
  tool_broken: {
    speakerKey: 'dlg_tool_broken',
    textKey: 'dlg_tool_broken_text',
    choices: [{ labelKey: 'dlg_got_it', action: 'close' }],
  },
  no_water: {
    speakerKey: 'dlg_empty',
    textKey: 'dlg_no_water',
    choices: [{ labelKey: 'dlg_ok', action: 'close' }],
  },
  sleep_confirm: {
    speakerKey: 'dlg_house',
    textKey: 'dlg_sleep_confirm',
    choices: [{ labelKey: 'dlg_sleep_yes', action: 'sleep' }, { labelKey: 'dlg_sleep_no', action: 'close' }],
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

    const speakerText = t(entry.speakerKey)
    const bodyText = t(entry.textKey)

    this.speakerEl.textContent = speakerText
    this.textEl.textContent = ''
    this.choicesEl.innerHTML = ''
    this.dialogBox.style.display = 'block'

    // Typewriter effect
    let charIdx = 0
    const typeInterval = setInterval(() => {
      if (charIdx < bodyText.length) {
        this.textEl.textContent += bodyText[charIdx]
        charIdx++
      } else {
        clearInterval(typeInterval)
        this.showChoices(entry.choices)
      }
    }, 25)

    // Allow skip by clicking
    const skipHandler = () => {
      if (charIdx < bodyText.length) {
        clearInterval(typeInterval)
        this.textEl.textContent = bodyText
        this.showChoices(entry.choices)
      }
      this.dialogBox.removeEventListener('click', skipHandler)
    }
    this.dialogBox.addEventListener('click', skipHandler)
  }

  private showChoices(choices?: Array<{ labelKey: string; action: string }>) {
    this.choicesEl.innerHTML = ''
    if (!choices) {
      this.close()
      return
    }
    for (const choice of choices) {
      const btn = document.createElement('button')
      btn.className = 'dialog-choice'
      btn.textContent = t(choice.labelKey)
      btn.onclick = (e) => {
        e.stopPropagation()
        sound.menuSelect()
        this.close()
        this.onChoice?.(choice.action)
      }
      this.choicesEl.appendChild(btn)
    }
  }

  showRaw(speaker: string, text: string, onChoice?: (action: string) => void) {
    this.active = true
    this.onChoice = onChoice || null
    sound.menuOpen()
    this.speakerEl.textContent = speaker
    this.textEl.textContent = text
    this.choicesEl.innerHTML = ''
    this.dialogBox.style.display = 'block'
    this.showChoices([{ labelKey: 'dlg_ok', action: 'close' }])
  }

  close() {
    this.active = false
    this.dialogBox.style.display = 'none'
    this.onChoice = null
  }
}
