export type Lang = 'en' | 'fa'

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    title: '🌾 Till Debt Do Us Part',
    startDesc: 'You inherited a farm with 500g in debt.<br>Pay it off by day 21 or lose everything.<br><br>Chop trees 🪓 | Break stones ⛏️ | Till soil 🌱<br>Water crops daily 💧 | Ship items in bin 📦<br>Mine with shovel 🔨 | Tools wear out!',
    seedLabel: 'World Seed (leave empty for random)',
    startBtn: 'START FARMING',
    paused: '⏸ PAUSED',
    volume: '🔊 Volume',
    language: '🌐 Language',
    resume: 'RESUME',
    unstuck: '🕳️ UNSTUCK',
    unstuck_cd: 'UNSTUCK ({s}s)',
    unstuckHint: 'Stuck? Teleports you to a random spot in the yard (1 min cooldown)',
    close: 'Close',
    inventory: '📦 Inventory',
    invHint: 'Click to select · Drag to reorder · ✕ to discard',
    shopTitle: 'General Store',
    deadline: 'DEADLINE',
    debtWarning: '⚠️ The debt collector comes TOMORROW!\nSell your items and prepare {amount}g!',
    tired: 'Too tired...',
    noWater: 'No water left!',
    controls: 'WASD Move<br>SPACE Action<br>E Interact<br>ENTER Sleep<br>B Ship Items<br>I Inventory<br>ESC Pause<br>1-8 Select Slot',
    // Dialogues
    dlg_narrator: 'Narrator',
    dlg_grimes: 'Mr. Grimes',
    dlg_congrats: '🎉 Congratulations!',
    dlg_game_over: '💔 Game Over',
    dlg_notice: '⚠️ Notice',
    dlg_tool_broken: '🔧 Tool Broken!',
    dlg_empty: '💧 Empty!',
    dlg_house: '🏠 Home',
    dlg_intro_1: "You've inherited your grandpa's old farm. It's seen better days... There's a debt of 500 gold hanging over it. You have 21 days to pay it off, or the bank takes everything.",
    dlg_grimes_first: "Well well well! So YOU'RE the one who inherited this dump? I'm Mr. Grimes, from the bank. Your grandpa owed us 500 gold. You've got until day 21. I'll be checking in every 5 days. Don't disappoint me.",
    dlg_grimes_visit: "Time's ticking! How's that debt coming along? I'm here to collect what you can pay.",
    dlg_grimes_paid: "Hmph. Full payment. I suppose you're more capable than your grandpa gave you credit for. The debt is cleared. This farm is yours free and clear.",
    dlg_grimes_partial: "A partial payment? Fine, I'll take what I can get. But don't think this buys you forever. The clock is still ticking.",
    dlg_win: "You've paid off the entire debt! The farm is yours! Your grandpa would be so proud. The seasons will continue, and your legacy grows stronger each day.",
    dlg_lose: "Day 21 has passed and the debt remains unpaid. Mr. Grimes arrives with the foreclosure papers. The farm is lost... But maybe next time things will go differently.",
    dlg_spoil: "Some crops wilted overnight because they weren't watered! Remember: crops MUST be watered each day or they'll spoil by morning.",
    dlg_tool_broken_text: "This tool is worn out and can't be used anymore! Visit the shop to repair it, or buy a replacement.",
    dlg_no_water: "Your watering can is empty! Go to the well and press E to refill it.",
    dlg_sleep_confirm: "Would you like to sleep and end the day?",
    // Dialogue choices
    dlg_best: "I'll do my best!",
    dlg_wont_let_down: "I won't let you down!",
    dlg_pay_full: 'Pay Full Amount',
    dlg_pay_partial: 'Pay Partial ({amount}g)',
    dlg_more_time: "I need more time...",
    dlg_more_time_granted: "Fine... I'll give you ONE more day. But next time, there won't be any mercy.",
    dlg_more_time_denied: "No more excuses! You've had your chance. The farm is mine now.",
    dlg_not_enough_gold: "You don't have enough gold for that payment!",
    dlg_score_title: '📊 Final Score',
    dlg_score_detail: 'Gold Earned: {earned}g\nItems Sold: {sold}\nItems Mined: {mined}\nDays Without Petting Dog: {nopet}\n\nTotal Score: {score}',
    dlg_thank_goodness: 'Thank goodness!',
    dlg_keep_working: "I'll keep working.",
    dlg_keep_farming: 'Keep Farming!',
    dlg_start_over: 'Start Over',
    dlg_try_again: 'Try Again',
    dlg_remember: "I'll remember.",
    dlg_got_it: 'Got it.',
    dlg_ok: 'OK',
    dlg_sleep_yes: 'Sleep',
    dlg_sleep_no: 'Not yet',
    // Mine
    dlg_mine: '⛏️ Mine Hole',
    dlg_mine_descend: 'You found a glowing hole with a ladder leading deeper. Climb down to the next level?',
    dlg_ladder_mishap: "You grab the ladder... CRACK! The old rungs give way! You tumble and slide all the way back up to the surface. Looks like you're not going deeper today!",
    dlg_descend: 'Descend',
    dlg_stay: 'Stay here',
    dlg_ouch: 'Ouch!',
    // Farming tutorial
    dlg_grandpa: "📖 Grandpa's Diary",
    dlg_crop_ripe: "It's time!! The crops you planted have finally grown! Walk right up to a ripe plant and press E (or SPACE) to pick it — any item in hand works, just not the watering can. Pick them all before they dry out!",
    dlg_ready_to_pick: "I'm ready to pick!",
    dlg_recipe: "🌟 Grandma's Recipe Book",
    dlg_first_harvest: "THAT'S IT! You just picked your very first crop! 🎉 You're a real farmer now! Here's your mission: walk to the big wooden shipping bin (follow the golden arrow) and press E to sell your harvest. The coins get added every morning. Grandpa would be so proud!",
    dlg_to_bin: 'Off to the bin!',
    mine_hud_title: '⛏ MINE',
    mine_depth_label: 'DEPTH',
    mine_digs_label: 'DIGS',
    mine_exit_label: 'ESCAPE',
    mine_toast_energy: 'No digging energy left! Press E to leave or climb a hole.',
    mine_toast_hole: 'A hole opened up! Press E to descend deeper.',
  },
  fa: {
    title: '🌾 تا بدهکاری ما را جدا کند',
    startDesc: 'شما یک مزرعه با ۵۰۰ سکه بدهی به ارث بردید.<br>تا روز ۲۱ آن را پرداخت کنید یا همه چیز را از دست بدهید.<br><br>درخت ببرید 🪓 | سنگ بشکنید ⛏️ | خاک شخم بزنید 🌱<br>محصولات را آبیاری کنید 💧 | آیتم‌ها را در جعبه بفرستید 📦<br>معدن با بیل 🔨 | ابزارها فرسوده می‌شوند!',
    seedLabel: 'بذر دنیا (خالی برای تصادفی)',
    startBtn: 'شروع کشاورزی',
    paused: '⏸ مکث',
    volume: '🔊 صدا',
    language: '🌐 زبان',
    resume: 'ادامه',
    unstuck: '🕳️ رفع گیر',
    unstuck_cd: 'رفع گیر ({s}ث)',
    unstuckHint: 'گیر کردی؟ به یک نقطه تصادفی در حیاط منتقل میکند (۱ دقیقه زمان انتظار)',
    close: 'بستن',
    inventory: '📦 کوله‌پشتی',
    invHint: 'کلیک برای انتخاب · کشیدن برای جابجایی · ✕ برای حذف',
    shopTitle: 'فروشگاه عمومی',
    deadline: 'مهلت',
    debtWarning: '⚠️ طلبکار فردا می‌آید!\nآیتم‌هایتان را بفروشید و {amount} سکه آماده کنید!',
    tired: 'خیلی خسته...',
    noWater: 'آب تمام شد!',
    controls: 'WASD حرکت<br>SPACE عمل<br>E تعامل<br>ENTER خواب<br>B ارسال آیتم<br>I کوله‌پشتی<br>ESC مکث<br>1-8 انتخاب اسلات',
    // Dialogues
    dlg_narrator: 'راوی',
    dlg_grimes: 'آقای گرایمز',
    dlg_congrats: '🎉 تبریک!',
    dlg_game_over: '💔 باخت',
    dlg_notice: '⚠️ اطلاعیه',
    dlg_tool_broken: '🔧 ابزار شکست!',
    dlg_empty: '💧 خالی!',
    dlg_house: '🏠 خانه',
    dlg_intro_1: 'شما مزرعه قدیمی پدربزرگتان را به ارث بردید. روزهای بهتری داشت... بدهی ۵۰۰ سکه‌ای روی آن است. ۲۱ روز فرصت دارید آن را پرداخت کنید، وگرنه بانک همه چیز را می‌گیرد.',
    dlg_grimes_first: 'خب خب خب! پس تو کسی هستی که این خرابه را به ارث برده؟ من آقای گرایمز هستم، از بانک. پدربزرگت ۵۰۰ سکه به ما بدهکار بود. تا روز ۲۱ وقت داری. هر ۵ روز سر می‌زنم. ناامیدم نکن.',
    dlg_grimes_visit: 'زمان دارد می‌گذرد! بدهی چطور پیش می‌رود؟ آمده‌ام هر چه بتوانی بپردازی جمع کنم.',
    dlg_grimes_paid: 'همه‌اش پرداخت شد. فکر نمی‌کردم اینقدر توانا باشی. بدهی پاک شد. این مزرعه مال خودت است.',
    dlg_grimes_partial: 'پرداخت جزئی؟ خوب، هر چه بتوانم می‌گیرم. ولی فکر نکن این کار زمان می‌خرد. ساعت هنوز تیک‌تاک می‌کند.',
    dlg_win: 'کل بدهی پرداخت شد! مزرعه مال توست! پدربزرگت به تو افتخار می‌کند. فصل‌ها ادامه دارند و میراث تو هر روز قوی‌تر می‌شود.',
    dlg_lose: 'روز ۲۱ گذشت و بدهی پرداخت نشد. آقای گرایمز با برگه‌های مصادره آمد. مزرعه از دست رفت... شاید دفعه بعد متفاوت باشد.',
    dlg_spoil: 'برخی محصولات شب خشک شدند چون آبیاری نشدند! یادت باشد: محصولات باید هر روز آبیاری شوند وگرنه صبح خراب می‌شوند.',
    dlg_tool_broken_text: 'این ابزار فرسوده شده و دیگر قابل استفاده نیست! به فروشگاه برو تا تعمیرش کنی یا یکی جدید بخر.',
    dlg_no_water: 'آبپاش خالی است! به چاه برو و E را بزن تا پر شود.',
    dlg_sleep_confirm: 'می‌خواهی بخوابی و روز را تمام کنی؟',
    // Dialogue choices
    dlg_best: 'تمام تلاشم را می‌کنم!',
    dlg_wont_let_down: 'ناامیدتان نمی‌کنم!',
    dlg_pay_full: 'پرداخت کامل',
    dlg_pay_partial: 'پرداخت جزئی ({amount} سکه)',
    dlg_more_time: 'وقت بیشتری لازم دارم...',
    dlg_more_time_granted: 'باشه... فقط یک روز دیگه بهت میدم. ولی دفعه بعد رحم نمی‌کنم.',
    dlg_more_time_denied: 'دیگه بهانه کافی نیست! فرصتت تمام شد. مزرعه مال منه.',
    dlg_not_enough_gold: 'سکه کافی برای این پرداخت نداری!',
    dlg_score_title: '📊 امتیاز نهایی',
    dlg_score_detail: 'سکه کسب‌شده: {earned}\nآیتم فروخته: {sold}\nآیتم معدن: {mined}\nروز بدون نوازش سگ: {nopet}\n\nامتیاز کل: {score}',
    dlg_thank_goodness: 'خدایا شکرت!',
    dlg_keep_working: 'به کار ادامه می‌دهم.',
    dlg_keep_farming: 'ادامه کشاورزی!',
    dlg_start_over: 'شروع مجدد',
    dlg_try_again: 'تلاش دوباره',
    dlg_remember: 'یادم می‌ماند.',
    dlg_got_it: 'متوجه شدم.',
    dlg_ok: 'باشه',
    dlg_sleep_yes: 'بخواب',
    dlg_sleep_no: 'هنوز نه',
    // Mine
    dlg_mine: '⛏️ گودال معدن',
    dlg_mine_descend: 'یک گودال درخشان با نردبانی که به عمق می‌رود پیدا کردی. به طبقه بعد پایین می‌روی؟',
    dlg_ladder_mishap: 'نردبان را می‌گیری... ترق! چوب‌های کهنه می‌شکنند! به سمت بالا سُر می‌خوری و دوباره به سطح می‌رسی. معلومه که امروز قرار نیست عمیق‌تر بروی!',
    dlg_descend: 'پایین برو',
    dlg_stay: 'اینجا بمان',
    dlg_ouch: 'آخ!',
    // Farming tutorial
    dlg_grandpa: '📖 دفتر خاطرات پدربزرگ',
    dlg_crop_ripe: 'وقتش رسیده!! محصولاتی که کاشتی بالاخره بزرگ شدند! به گیاه رسیده نزدیک شو و E (یا Space) را بزن تا بچینیش — هر آیتمی که دستت است اشکال ندارد، فقط آبپاش نه. همه‌شان را بچین قبل از اینکه خشک شوند!',
    dlg_ready_to_pick: 'آماده‌ام بچینم!',
    dlg_recipe: '🌟 کتاب دستور پخت مادربزرگ',
    dlg_first_harvest: 'همین شد! اولین محصولت را چیدی! 🎉 حالا یک کشاورز واقعی شدی! مأموریتت: به جعبه چوبی بزرگ حمل محموله برو (فلش طلایی را دنبال کن) و E را بزن تا محصولت را بفروشی. سکه‌ها هر صبح اضافه می‌شوند. پدربزرگ به تو افتخار می‌کرد!',
    dlg_to_bin: 'به سمت جعبه!',
    mine_hud_title: '⛏ معدن',
    mine_depth_label: 'عمق',
    mine_digs_label: 'حفاری',
    mine_exit_label: 'خروج',
    mine_toast_energy: 'انرژی حفاری تمام شد! برای خروج یا رفتن به گودال E را بزن.',
    mine_toast_hole: 'گودالی باز شد! برای رفتن به عمق E را بزن.',
  },
}

let currentLang: Lang = 'en'

export function setLang(lang: Lang) {
  currentLang = lang
  localStorage.setItem('till_debt_lang', lang)
  applyLangToDOM()
}

export function getLang(): Lang {
  return currentLang
}

export function t(key: string): string {
  return STRINGS[currentLang]?.[key] || STRINGS.en[key] || key
}

export function initLang() {
  const saved = localStorage.getItem('till_debt_lang') as Lang | null
  if (saved && STRINGS[saved]) currentLang = saved
  applyLangToDOM()
}

function applyLangToDOM() {
  const isFa = currentLang === 'fa'
  document.documentElement.lang = currentLang
  document.documentElement.dir = isFa ? 'rtl' : 'ltr'

  const el = (id: string) => document.getElementById(id)
  const setText = (id: string, key: string) => { const e = el(id); if (e) e.textContent = t(key) }
  const setHtml = (id: string, key: string) => { const e = el(id); if (e) e.innerHTML = t(key) }

  // Start screen
  const titleEl = document.querySelector('#start-overlay h1')
  if (titleEl) titleEl.textContent = t('title')
  setHtml('start-desc', 'startDesc')
  setText('seed-label', 'seedLabel')
  setText('start-btn', 'startBtn')

  // Pause menu
  setText('pause-title', 'paused')
  setText('lbl-volume', 'volume')
  setText('lbl-lang', 'language')
  setText('resume-btn', 'resume')
  setText('unstuck-btn', 'unstuck')
  setText('unstuck-hint', 'unstuckHint')

  // Inventory panel
  const invH2 = document.querySelector('#inventory-panel h2')
  if (invH2) invH2.textContent = t('inventory')
  const invP = document.querySelector('#inventory-panel p')
  if (invP) invP.textContent = t('invHint')
  const invClose = el('inv-close')
  if (invClose) invClose.textContent = '✕'

  // Shop
  const shopH2 = document.querySelector('#shop-panel h2')
  if (shopH2) shopH2.textContent = t('shopTitle')
  const shopClose = el('shop-close')
  if (shopClose) shopClose.textContent = '✕'

  // Controls hint
  setHtml('controls-hint', 'controls')

  // Mine HUD
  setText('mine-hud-title', 'mine_hud_title')
  setText('mine-depth-label', 'mine_depth_label')
  setText('mine-digs-label', 'mine_digs_label')
  setText('mine-exit-label', 'mine_exit_label')

  // Update lang button active states
  document.querySelectorAll('.lang-btn[data-lang]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === currentLang)
  })
  document.querySelectorAll('.lang-btn[data-pause-lang]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-pause-lang') === currentLang)
  })
}
