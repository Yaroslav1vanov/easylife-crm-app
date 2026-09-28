# Бренд-киты и черновики контент-стратегий для вкладки «Стратегия» (29.09.2026).
# Источник: последние 3–5 смонтированных роликов каждого клиента из CRM (кадры начала,
# середины и конца), профили Instagram, голос бренда из карточек и наши аудиты/заметки.
# Цвета сняты с кадров на глаз — это ориентир, а не фирменный брендбук.
# Запуск: python3 scripts/brand_kits_2026-09-29.py > MIGRATION_2026-09-29_brand_kits.sql

import json

def F(family, weight=500, case="normal"):
    return {"family": family, "source": "google", "weight": weight, "case": case}

def C(bg, bg_alt, text, text_on_light, accent, muted, card, **extra):
    d = {"bg": bg, "bg_alt": bg_alt, "text": text, "text_on_light": text_on_light,
         "accent": accent, "muted": muted, "card": card}
    d.update(extra)
    return d

META = {"filled_by": "Claude, 29.09.2026", "source": "последние ролики в CRM + Instagram + аудиты",
        "status": "черновик — проверить тимлиду"}

KITS = {}

# ── Дмитрий Иванов, падел ───────────────────────────────────────────────────
KITS[13] = {
    "identity": {"display_name": "Дмитрий Иванов", "role_line": "тренер по паделу", "niche": "sport",
                 "geo": "уточнить", "language": "ru", "address": "ты",
                 "voice_notes": "Тренер объясняет на пальцах: одна ошибка или приём за ролик, сразу показ на корте. Коротко, энергично, с долей юмора («наше детство»).",
                 "words_yes": ["упражнение", "ошибка новичков", "смотри", "на корте"],
                 "words_no": []},
    "visual": {
        "colors": C("#0E1A2B", "#F4F6F8", "#FFFFFF", "#111111", "#39FF3A", "#AEB6C2", "rgba(0,0,0,.55)",
                    court="#1E5BD8", stroke="#000000"),
        "fonts": {"display": F("Oswald", 700, "upper"), "accent": F("Oswald", 700, "upper"), "body": F("Oswald", 600, "upper")},
        "photo_style": "крытый падел-корт, синее покрытие; тренер в белой футболке с петличкой, ракетка в руках",
        "layout": ["сплит: сверху игра или профи-матч, снизу тренер в кадр по пояс",
                   "хук-заголовок узким капсом по центру верхней половины, белый или неоново-зелёный с чёрной обводкой",
                   "цифра-хук крупно неоновым («28700€»)",
                   "субтитры по одному слову по центру, белый капс с обводкой",
                   "круглый логотип клуба в углу"],
        "shape": {"radius": "0 — плашек нет, только обводка текста"}},
    "channels": {"instagram": "https://instagram.com/ivanovsport", "cta_style": "уточнить"},
    "rules": {"compliance": "standard", "never": [], "consent_required_for_faces": True},
}

# ── Иван Панченко (TikTok и Instagram — один клиент) ────────────────────────
PANCH = {
    "identity": {"display_name": "Іван Панченко", "role_line": "пластичний хірург", "niche": "medical",
                 "geo": "Україна", "language": "uk", "address": "вы",
                 "voice_notes": "Експертно, з чіпким хуком-твердженням, а не питанням. Заперечення очевидного («Ні, це не мама і донька…»), далі масштаб на глядача. Лікар іноді ВІДМОВЛЯЄ — це сильніше за рекламу.",
                 "words_yes": ["ваш випадок", "розберемо", "як лікар", "результат"],
                 "words_no": ["гарантую", "без ризиків", "назва процедури в заголовку"]},
    "visual": {
        "colors": C("#1A1A1C", "#F2F2F2", "#FFFFFF", "#111111", "#F5D90A", "#9A9A9A", "rgba(0,0,0,.6)",
                    alert="#E53935"),
        "fonts": {"display": F("Oswald", 700, "upper"), "accent": F("Oswald", 700, "upper"), "body": F("PT Serif", 400)},
        "photo_style": "темна студія, подкаст-мікрофон; лікар у тій самій формі (синій скраб або темний светр) по центру",
        "layout": ["дисклеймер зверху дрібним курсивом: «Відео має інформаційний характер. Необхідна консультація фахівця.»",
                   "обкладинка: спліт — об'єкт розмови по краях, лікар у центрі, жирний білий гротеск капсом 2–3 рядки",
                   "субтитри білою антиквою, ключові слова жовтим вузьким капсом",
                   "вставки: операційна, 3D-анатомія, до/після"],
        "shape": {"radius": "0"}},
    "channels": {"instagram": "https://instagram.com/dr.panch", "cta_style": "IG: «+» в коментарях; TikTok: у директ. «Розберемо ваш випадок»"},
    "rules": {"compliance": "medical", "never": ["гарантований результат", "назва процедури як заголовок обкладинки"],
              "consent_required_for_faces": True},
}
KITS[14] = PANCH
KITS[15] = PANCH

# ── Olena Hart ──────────────────────────────────────────────────────────────
KITS[21] = {
    "identity": {"display_name": "Olena Hart", "role_line": "коуч · трансформационные игры", "niche": "expert",
                 "geo": "Нью-Йорк, онлайн", "language": "ru", "address": "ты",
                 "voice_notes": "Тёплый, женский, поддерживающий, но уверенный. Деньги и самоценность через игру — живой опыт и инсайты, не сухие гайды и не эзотерика.",
                 "words_yes": ["самоценность", "игра", "позволь себе", "это не компромисс"],
                 "words_no": ["волшебство", "гарантирую", "кликбейт"]},
    "visual": {
        "colors": C("#4A0E1C", "#F3E9E4", "#FFFFFF", "#2A1418", "#F4EC2A", "#C9A7A7", "rgba(74,14,28,.72)",
                    accent_script="#C0213A"),
        "fonts": {"display": F("Montserrat", 900, "upper"), "accent": F("Marck Script", 400), "body": F("Montserrat", 700)},
        "photo_style": "дом (светлое кресло, растение), машина, блейзеры; тёплый естественный свет",
        "layout": ["винно-бордовый градиент сверху и снизу кадра",
                   "заголовок жирным широким капсом, ключевое слово жёлтым со свечением",
                   "акцент рукописным курсивом (красный или белый)",
                   "субтитры короткие, белые, жирные"],
        "shape": {"radius": "0", "glow": "жёлтое свечение на ключевом слове"}},
    "channels": {"instagram": "https://instagram.com/o.hart.life_coach.ny", "cta_style": "кодовое слово в комментариях → воронка → сессия"},
    "rules": {"compliance": "standard", "never": ["обещания «волшебства»", "эзотерический туман"], "consent_required_for_faces": True},
}

# ── Юлия, недвижимость Пенсильвания ─────────────────────────────────────────
KITS[24] = {
    "identity": {"display_name": "Юлия", "role_line": "риелтор · Пенсильвания", "niche": "real_estate",
                 "geo": "Пенсильвания, США", "language": "ru", "address": "вы",
                 "voice_notes": "Спокойный деловой тон: факты о рынке и районах, проверка объекта, подводные камни при покупке.",
                 "words_yes": ["а вы знали", "проверить", "история объекта", "статистика"],
                 "words_no": ["гарантированный рост цены"]},
    "visual": {
        "colors": C("#0F1B2D", "#F5F5F2", "#FFFFFF", "#111111", "#FFFFFF", "#C7CFD8", "rgba(15,27,45,.55)"),
        "fonts": {"display": F("Montserrat", 700), "accent": F("Montserrat", 800), "body": F("Montserrat", 300)},
        "photo_style": "офис у окна с фото объектов; чёрный пиджак, белая блуза; дрон над пригородами и даунтауном",
        "layout": ["субтитры тонким белым, ключевые слова жирным белым",
                   "эксперт в круглой мягкой виньетке поверх съёмки с дрона",
                   "американские пригороды, закаты, улицы — как фон мысли"],
        "shape": {"radius": "50% для виньетки эксперта"}},
    "channels": {"instagram": "https://instagram.com/julia_realtor_pennsylvania", "cta_style": "уточнить"},
    "rules": {"compliance": "standard", "never": ["обещание доходности", "дискриминирующие формулировки о районах (Fair Housing)"],
              "consent_required_for_faces": True},
}

# ── Надежда Сенева · Bastion Plus ───────────────────────────────────────────
KITS[28] = {
    "identity": {"display_name": "Надія Сенева", "role_line": "Bastion Plus · інвестиції в нерухомість Болгарії з 2011", "niche": "real_estate",
                 "geo": "Бургас, Несебр, Святий Влас, Сонячний Берег", "language": "uk", "address": "вы",
                 "voice_notes": "Герой контенту — інвестиція, а не нерухомість. Короткі речення, міфи, порівняння, прості схеми. Доступний поріг входу, переуступка, юридичний супровід, без комісій для клієнта.",
                 "words_yes": ["переуступка", "на етапі будівництва", "юридичний супровід", "прямі договори із забудовниками", "з 2011 року"],
                 "words_no": ["гарантований дохід", "нерухомість для багатих", "суми не в євро"]},
    "visual": {
        "colors": C("#1F6B6B", "#F4F8F7", "#FFFFFF", "#123E40", "#A8F0D8", "#CFE3E0", "rgba(31,107,107,.85)",
                    bg_dark="#184F52"),
        "fonts": {"display": F("Oswald", 700, "upper"), "accent": F("Great Vibes", 400), "body": F("Montserrat", 500)},
        "photo_style": "світлий офіс з вікнами, біла блуза; на столі каталог і картка Bastion; будмайданчики, євро, об'єкти",
        "layout": ["заголовок вузьким білим капсом + підрядок звичайним шрифтом",
                   "бірюзова смуга-градієнт внизу кадру",
                   "нумерація пунктів «2.» великою цифрою + бірюзова плашка з текстом",
                   "назва комплексу рукописним шрифтом + фото об'єкта",
                   "ключові слова субтитрів у бірюзових плашках"],
        "shape": {"radius": "6px для плашок"}},
    "channels": {"cta_style": "кодове слово, коментар або запит на підбір об'єкта"},
    "rules": {"compliance": "standard", "never": ["гарантована прибутковість", "цифри не в євро"], "consent_required_for_faces": True},
}

# ── Millionmile KR ──────────────────────────────────────────────────────────
KITS[29] = {
    "identity": {"display_name": "Million Miles", "role_line": "авто из Кореи · Андрей и Вениамин", "niche": "auto",
                 "geo": "Корея → СНГ/ОАЭ", "language": "ru", "address": "ты",
                 "voice_notes": "Познавательно, не витрина: истории марок, инженерия, споры «S-Class или 7-я». Уверенно, с лёгкой иронией.",
                 "words_yes": ["легенда", "на самом деле", "думаешь, твой…"],
                 "words_no": ["купи сейчас", "лучшая цена"]},
    "visual": {
        "colors": C("#0B0B0C", "#F4F1EA", "#F3DDB0", "#111111", "#C8102E", "#BDB3A0", "rgba(0,0,0,.5)"),
        "fonts": {"display": F("Oswald", 700, "upper"), "accent": F("Playfair Display", 700), "body": F("Montserrat", 700)},
        "photo_style": "премиальные машины, салоны, шоурум; спикер снизу кадра — голубое поло в шоуруме или белое поло в салоне авто",
        "layout": ["сплит: сверху машина, снизу спикер",
                   "субтитры в две строки тёплым кремовым: первая тоньше, вторая жирнее",
                   "название марки крупным узким капсом, иногда красным («MERCEDES»)",
                   "сравнения курсивом («S-Class or Series 7»)"],
        "shape": {"radius": "0"}},
    "channels": {"instagram": "https://instagram.com/millionmileskr", "codeword": "АВТО", "cta_style": "пиши слово АВТО в комментариях"},
    "rules": {"compliance": "standard", "never": [], "consent_required_for_faces": True},
}

# ── Ярослав · личный блог (фирменный стиль EasyLife) ────────────────────────
KITS[31] = {
    "identity": {"display_name": "Ярослав Иванов", "role_line": "контент-системы для бизнеса · EasyLife AI", "niche": "expert",
                 "geo": "СНГ + США", "language": "ru", "address": "ты",
                 "voice_notes": "Предприниматель, который построил систему и делится выводами. Уверенно, прямо, местами провокационно: ломать убеждения цифрами и кейсами. Продаём результат для бизнеса, не технологию.",
                 "words_yes": ["контент-система", "на самом деле", "проблема не в…", "выигрывают не те, кто…"],
                 "words_no": ["нейросеть/ИИ/аватар в первых 3 секундах", "на автопилоте", "мотивационные клише", "гарантирую"]},
    "visual": {
        "colors": C("#070526", "#F3F1FA", "#FFFFFF", "#070526", "#B6F500", "#A7A3C2", "rgba(7,5,38,.72)"),
        "fonts": {"display": F("Unbounded", 800), "accent": F("Unbounded", 800, "upper"), "body": F("Manrope", 600)},
        "photo_style": "студия с неоновой фиолетово-синей подсветкой, тёмный лонгслив",
        "layout": ["хук-парадокс с цифрой в первом кадре", "ключевое слово лаймом", "пруф — скрин с цифрами в кадре"],
        "shape": {"radius": "14px"}},
    "channels": {"instagram": "https://instagram.com/yaroslav.1vanov.ai", "telegram": "https://t.me/yaroslav1vanov",
                 "cta_style": "кодовое слово в комментарий (не «смотри описание»)"},
    "rules": {"compliance": "standard", "never": ["гарантии результата", "ИИ как главный герой"], "consent_required_for_faces": True},
}

# ── Casyn (формат «Папка дела») ─────────────────────────────────────────────
KITS[32] = {
    "identity": {"display_name": "Casyn", "role_line": "legal help, simplified", "niche": "legal",
                 "geo": "USA", "language": "en", "address": "вы",
                 "voice_notes": "Plain-English legal explainers on everyday cases: firing, severance, insurance, rent. Calm, precise, deadline-driven.",
                 "words_yes": ["in writing", "deadline", "your rights", "send this"],
                 "words_no": ["guaranteed win", "legal advice (we are not your lawyer)"]},
    "visual": {
        "colors": C("#0E1430", "#F4F6FB", "#FFFFFF", "#0E1430", "#2C4EFC", "#8A93B2", "#F4F6FB",
                    marker="#FFE14D", alert="#E5484D"),
        "fonts": {"display": F("Inter", 800, "upper"), "accent": F("Inter", 800), "body": F("Inter", 600)},
        "photo_style": "аватар в студии; «лист дела» — бумага с жёлтым маркером",
        "layout": ["хук-заголовок обложки с 0:00, одна строка на жёлтом маркере",
                   "документ с маркером на ключевом слове, аватар в кружке",
                   "счётчик срока, чек-лист, шкала событий, экран Casyn"],
        "shape": {"radius": "12px", "documents_font": "Georgia"}},
    "channels": {"instagram": "https://instagram.com/casyn.ai", "site": "https://casyn.ai", "cta_style": "уточнить: кодовое слово или ссылка"},
    "rules": {"compliance": "standard", "never": ["обещание исхода дела", "подача как юридической консультации"],
              "consent_required_for_faces": True},
}

# ── Антон Edeal ─────────────────────────────────────────────────────────────
KITS[33] = {
    "identity": {"display_name": "Антон Чехов", "role_line": "Edeal · бизнес в США · Enrolled Agent", "niche": "finance",
                 "geo": "США", "language": "ru", "address": "вы",
                 "voice_notes": "Опытный CPA-друг: компетентный, прямой, невзволнованный. Широкая тема-открывашка (Опра, Kit Kat, Hummer) → мостик в налоги/бизнес → последствие с цифрой.",
                 "words_yes": ["легально", "списать", "мой взгляд", "обычно", "в большинстве случаев"],
                 "words_no": ["на автопилоте", "контент-завод", "гарантированная экономия", "вас посадят"]},
    "visual": {
        "colors": C("#0F1A3A", "#F5F6F8", "#FFFFFF", "#0F1A3A", "#FFD200", "#AEB5C6", "#1E3A8A",
                    card_alt="#8B1E1E"),
        "fonts": {"display": F("Oswald", 700, "upper"), "accent": F("Oswald", 700, "upper"), "body": F("Montserrat", 800)},
        "photo_style": "сюжетный б-ролл: сгенерированные сцены героя истории, кадры знаменитостей, скриншоты сайтов; Антон на улице/террасе",
        "layout": ["ключевые фразы в тёмно-синих или тёмно-красных плашках",
                   "хук-заголовок узким капсом, «лазейки» жёлтым в кавычках",
                   "документальные вставки: скрин закона/сайта с плашкой-пояснением"],
        "shape": {"radius": "4px"}},
    "channels": {"site": "https://edeal.ai", "telegram": "https://t.me/edeal_ai", "cta_style": "вопрос-подъёб в комментарии + кодовое слово для горячих"},
    "rules": {"compliance": "standard", "never": ["категоричные обещания по налогам", "драматизация страха перед IRS"],
              "consent_required_for_faces": True},
}

# ── Вениамин · Million Miles Япония (англ.) ─────────────────────────────────
KITS[34] = {
    "identity": {"display_name": "Million Miles", "role_line": "cars from Japan", "niche": "auto",
                 "geo": "Japan → worldwide", "language": "en", "address": "ты",
                 "voice_notes": "Car explainers for a broad audience: types of doors, turbo vs supercharger, badges. Friendly, fast, visual.",
                 "words_yes": ["here are all the", "this is a", "types of"], "words_no": []},
    "visual": {
        "colors": C("#0B0B0C", "#FFFFFF", "#FFFFFF", "#111111", "#F2C230", "#B9B9B9", "rgba(0,0,0,.45)"),
        "fonts": {"display": F("Oswald", 700), "accent": F("Montserrat", 900, "upper"), "body": F("Montserrat", 800)},
        "photo_style": "молодой спикер в белой футболке, салон авто или гараж; сверху машины и детали",
        "layout": ["сплит: сверху машина/деталь, снизу спикер",
                   "серийный заголовок жёлто-золотым («types of car doors») + вордмарк MILLION MILES",
                   "подписи-ярлыки курсивным капсом на белом («TURBO C», «SEDAN»)",
                   "субтитры белые жирные с тенью"],
        "shape": {"radius": "0"}},
    "channels": {"instagram": "https://instagram.com/millionmiles.jp", "cta_style": "уточнить"},
    "rules": {"compliance": "standard", "never": [], "consent_required_for_faces": True},
}

# ── Dr. Marina Gafanovich ───────────────────────────────────────────────────
KITS[35] = {
    "identity": {"display_name": "Dr. Marina Gafanovich", "role_line": "Internist · Concierge Privilege", "niche": "medical",
                 "geo": "Sunny Isles Beach, FL · New York", "language": "en", "address": "вы",
                 "voice_notes": "Calm, warm authority of a 20+ year internist. Explains the healthcare system and bills in plain words; honest about what's not needed.",
                 "words_yes": ["documented", "practicing internist", "FDA-approved", "your case"],
                 "words_no": ["compounded as a recommendation", "cure", "guaranteed"]},
    "visual": {
        "colors": C("#2A1D16", "#F7F3EE", "#FFFFFF", "#1E1E1E", "#D9B84A", "#BFB2A3", "rgba(42,29,22,.6)",
                    coat_blue="#1F4FD1"),
        "fonts": {"display": F("Cormorant Garamond", 500), "accent": F("Poppins", 600), "body": F("Poppins", 500)},
        "photo_style": "тёплый кабинет: кирпичная стена, лампа, тёмное платье — или белый халат с синим верхом",
        "layout": ["заголовок тонкой элегантной антиквой в 2–3 строки",
                   "субтитры мелкие строчные белые, ключевое слово горчичным",
                   "крупные полупрозрачные цифры для пунктов («2», «5»)",
                   "бытовой б-ролл: счёт за лечение, витамины, капельница"],
        "shape": {"radius": "12px"}},
    "channels": {"instagram": "https://instagram.com/mymiamidoctor", "site": "https://mymiadoctor.com", "cta_style": "уточнить через агентство"},
    "rules": {"compliance": "medical_us", "never": ["рекомендация compounded-препаратов", "обещания результата лечения", "данные пациентов"],
              "consent_required_for_faces": True},
}

# ── Игорь FinDoctor, стоматолог ─────────────────────────────────────────────
KITS[36] = {
    "identity": {"display_name": "Ігор", "role_line": "стоматолог · імплантація і протезування", "niche": "medical",
                 "geo": "Україна", "language": "uk", "address": "вы",
                 "voice_notes": "Лікар спокійно знімає страх: чи боляче, скільки триває, знімне чи на імплантах. Кейси пацієнтів і прості 3D-пояснення.",
                 "words_yes": ["без болю", "на імплантах", "підкажу", "ваш випадок"],
                 "words_no": ["гарантую", "назавжди"]},
    "visual": {
        "colors": C("#1D2B44", "#F5F7FB", "#FFFFFF", "#1D2B44", "#E0A23A", "#B7C0D0", "#FFFFFF",
                    sub_text="#3B7BD8", sub_text_alt="#8E44D9"),
        "fonts": {"display": F("Nunito", 900), "accent": F("Nunito", 900), "body": F("Nunito", 800)},
        "photo_style": "кабінет з КТ-моніторами; темний скраб або синя футболка з принтом зуба",
        "layout": ["хук «драбинкою» зі слів різного розміру на грудях: білий + гірчичний",
                   "субтитри в білих заокруглених плашках синім або фіолетовим текстом",
                   "3D-моделі щелеп і імплантів, числа «3 → 0» поруч із моделями"],
        "shape": {"radius": "14px для плашок субтитрів"}},
    "channels": {"instagram": "https://instagram.com/3dstomatolog", "cta_style": "Напишіть кодове слово («ПРОТЕЗ», «КОРОНКА») — підкажу"},
    "rules": {"compliance": "medical", "never": ["гарантія результату", "фото пацієнтів без згоди"], "consent_required_for_faces": True},
}

# ── Albena Ivanova · Foreign Affair (travel) ────────────────────────────────
KITS[37] = {
    "identity": {"display_name": "Albena Ivanova", "role_line": "travel advisor · Foreign Affair", "niche": "travel",
                 "geo": "Charlotte, NC", "language": "en", "address": "ты",
                 "voice_notes": "Insider travel tips from an advisor: myths, secrets, money-savers. Warm, energetic, personal («I'll answer you personally»).",
                 "words_yes": ["secrets", "never", "lock the price", "message me"],
                 "words_no": []},
    "visual": {
        "colors": C("#141414", "#F2EFEA", "#FFFFFF", "#111111", "#F7D117", "#BDBDBD", "rgba(0,0,0,.5)",
                    alert="#E0192B"),
        "fonts": {"display": F("Montserrat", 900, "upper"), "accent": F("Montserrat", 900, "upper"), "body": F("Montserrat", 700)},
        "photo_style": "она в белой куртке в студии или в ярком платье на природе; круизы, аэропорты, города с дрона",
        "layout": ["заголовок жирным капсом жёлтым + подзаголовок белым", "запрет/опасность красным («NEVER»)",
                   "текстура мятой бумаги для списков и приложений", "субтитры белые, ключевые слова жёлтым"],
        "shape": {"radius": "0"}},
    "channels": {"instagram": "https://instagram.com/foreignaffair2026", "cta_style": "Message me · Tell me in the comments — I'll answer personally"},
    "rules": {"compliance": "standard", "never": [], "consent_required_for_faces": True},
}

# ── SVEKA Design ────────────────────────────────────────────────────────────
KITS[38] = {
    "identity": {"display_name": "SVEKA Design", "role_line": "архитектура и интерьеры с 2012 · Дубай, Киев", "niche": "design",
                 "geo": "Дубай · Киев · Европа", "language": "ru", "address": "вы",
                 "voice_notes": "Студия с 13 годами и 500+ проектами, которая первой поставила ИИ на поток. Красивое видео о дизайне без лишнего; аватар — ведущая рубрики, мысль несёт текст.",
                 "words_yes": ["completed project", "500 проектов", "с 2012 года"],
                 "words_no": ["рисуем нейросетью", "дёшево"]},
    "visual": {
        "colors": C("#0B0B0B", "#EDE9E3", "#FFFFFF", "#1A1A1A", "#C8B79E", "#9D978E", "rgba(11,11,11,.6)"),
        "fonts": {"display": F("Montserrat", 600, "upper"), "accent": F("Cormorant Garamond", 500), "body": F("Montserrat", 400)},
        "photo_style": "премиальные интерьеры в нейтральной бежево-графитовой гамме; Светлана в чёрном костюме, мягкий свет",
        "layout": ["крупный титр сверху тонким разреженным капсом («COMPLETED PROJECT / TARYAN TOWERS»)",
                   "подпись DESIGN BY SVEKA", "минимум текста, никаких цветных плашек",
                   "аватар: одна мизансцена (кресло, тёмный интерьер), 6–9 секунд, говорит текст"],
        "shape": {"radius": "0", "tracking": "широкая разрядка у капса"}},
    "channels": {"instagram": "https://instagram.com/sveka_design", "site": "https://www.svekadesign.com.ua", "cta_style": "уточнить"},
    "rules": {"compliance": "standard", "never": ["виллы, сгенерированные с нуля, выдаваемые за проекты"], "consent_required_for_faces": True},
}

# ── Lash Couture ────────────────────────────────────────────────────────────
KITS[39] = {
    "identity": {"display_name": "Lash Couture", "role_line": "eyelash extension studio · Brooklyn", "niche": "beauty",
                 "geo": "130 Brighton Beach Ave, Brooklyn, NY", "language": "en", "address": "ты",
                 "voice_notes": "Уточнить — роликов в CRM пока нет. По профилю: люксовая студия, акцент на мастерах и крупных планах ресниц.",
                 "words_yes": ["book now", "lash lift", "our artistry"], "words_no": []},
    "visual": {
        "colors": C("#111111", "#FFFFFF", "#FFFFFF", "#111111", "#C9A45C", "#B8B0A2", "rgba(255,255,255,.85)"),
        "fonts": {"display": F("Playfair Display", 700), "accent": F("Great Vibes", 400), "body": F("Montserrat", 500)},
        "photo_style": "макро ресниц, золотой декор, белый мрамор; мастера в чёрном",
        "layout": ["логотип золотым рукописным на белом", "минимум текста, макро-кадры", "имена мастеров в хайлайтах"],
        "shape": {"radius": "999px для хайлайтов"}},
    "channels": {"instagram": "https://instagram.com/lash_couture_corp", "site": "https://linktr.ee/lashcouture",
                 "whatsapp": "+1 917-720-8555", "cta_style": "Book now · $30 deposit required"},
    "rules": {"compliance": "standard", "never": [], "consent_required_for_faces": True},
}

# ── LACCURA (две карточки — одна клиника) ───────────────────────────────────
LACCURA_RULES = {"compliance": "medical_us",
                 "never": ["обещание результата", "до/после без подписи протокола", "прямые формулировки об интимном здоровье (Meta банит — история блокировок)"],
                 "consent_required_for_faces": True}
KITS[40] = {
    "identity": {"display_name": "Laccura Medical", "role_line": "functional medicine · Lincolnwood, IL", "niche": "medical",
                 "geo": "7350 N. Cicero Ave, Lincolnwood, IL", "language": "en", "address": "вы",
                 "voice_notes": "Inna Hoffman (APRN) и Oksana Krysko (RN): гормоны, анализы крови, вес, энергия. Спокойная экспертиза, «разберём ВАШ случай» — формат по мотивам dr.panch.",
                 "words_yes": ["your blood test", "hormones", "root cause", "your case"],
                 "words_no": ["cure", "guaranteed"]},
    "visual": {
        "colors": C("#1E2233", "#F6F3EE", "#FFFFFF", "#1E2233", "#D8B25A", "#B9B3A8", "rgba(30,34,51,.55)",
                    scrubs="#2B2F5C", sage="#A7B79E"),
        "fonts": {"display": F("Montserrat", 300, "upper"), "accent": F("Great Vibes", 400), "body": F("Montserrat", 500)},
        "photo_style": "клиника: тёплое дерево, золотые полки; врачи в тёмно-синих скрабах; лаборатория, пробирки",
        "layout": ["заголовок тонким белым капсом + «PART 2»", "акцент золотым рукописным («What labs»)",
                   "субтитры мелкие белые", "3D-анатомия и лабораторный б-ролл"],
        "shape": {"radius": "0"}},
    "channels": {"instagram": "https://instagram.com/laccuramedical", "site": "https://laccura.com/?utm_campaign=lincolnwood", "cta_style": "DM-кодовое слово («DM WELLNESS»)"},
    "rules": LACCURA_RULES,
}
KITS[41] = {
    "identity": {"display_name": "Laccura MedSpa", "role_line": "aesthetics · Highland Park, IL", "niche": "medical",
                 "geo": "1729 Green Bay Rd, Highland Park, IL", "language": "en", "address": "вы",
                 "voice_notes": "Эстетика: Botox, филлеры, Morpheus8, лазеры. Лёгкий тон, разборы звёзд («What does Hailey Bieber love?»), протокол всегда подписан.",
                 "words_yes": ["your glow", "protocol", "first sign of aging"],
                 "words_no": ["guaranteed", "no downtime (если это не так)"]},
    "visual": {
        "colors": C("#1E1A18", "#F4EEE6", "#FFFFFF", "#2A211C", "#7A1F1F", "#BDB2A5", "rgba(30,26,24,.55)",
                    gold="#C9A45C", sage="#A7B79E"),
        "fonts": {"display": F("Montserrat", 800, "upper"), "accent": F("Great Vibes", 400), "body": F("Montserrat", 500)},
        "photo_style": "кабинет с золотыми полками, процедуры крупно; врачи в тёмно-синих скрабах",
        "layout": ["заголовок белым жирным курсивным капсом с тенью", "рукописные белые акценты поверх кадра",
                   "хайлайты — бордо с кремовой антиквой (LAB TESTS, MENU)", "до/после с подписью протокола («3 Morpheus8 + 3 Lumecca»)"],
        "shape": {"radius": "0"}},
    "channels": {"instagram": "https://instagram.com/laccuramedspa", "site": "https://laccura.com/?utm_campaign=highlandpark", "cta_style": "DM-кодовое слово"},
    "rules": LACCURA_RULES,
}

# ── Черновики контент-стратегий: только там, где есть проработанный материал ──
STRATEGY = {
14: """ФОРМАТ (разобран по 39 роликам, 05.09.2026)
• TikTok у хирурга в 3,4 раза сильнее Instagram — ведём обе сети.
• Обложка: сплит — объект разговора по краям, врач в центре в одной и той же одежде; жирный белый гротеск капсом 2–3 строки. Заголовок — вопрос или утверждение, никогда не название процедуры.
• Хук — заявление, а не вопрос (×4,6 против ×0,3), с отрицанием очевидного, дальше масштаб на зрителя.
• 5 архетипов: A «посмотрите на это — а теперь на это» ×4,6 · B селебрити + врач ОТКАЗЫВАЕТ ×4,3 · C эволюция лица звезды ×2,3 · D «как врач не советую своим близким» · E классификация ЗРИТЕЛЯ («ваш тип старения»).
• Проваливается: справочники форм, ярлыки-тренды, туториалы, ролики короче 25 секунд.
• CTA: не «запишитесь», а «разберём ВАШ случай»: в IG «+» в комментариях, в TikTok — в директ.""",
21: """ПОЗИЦИЯ: продукт — ТРАНСФОРМАЦИОННАЯ ИГРА, а не гайды (пивот).
• Сегмент: деньги + самоценность у женщин.
• Контент: живой опыт и инсайты из игр, книги и сцены из жизни как повод, «я тоже так делала».
• Конкурент для ориентира — «Игры ЛиЛу».
• CTA: кодовое слово в комментариях → воронка → продажа сессии голосом.""",
31: """ЦЕЛЬ: лиды в EasyLife ($1,5–5,4k), не личный бренд ради бренда.
• 100% ИИ-аватар — это одновременно доказательство продукта.
• Фильтр платёжеспособности стоит в ХУКЕ: без слов «нейросеть/ИИ/аватар» в первых 3 секундах.
• 5 рубрик: сериал «НАС НЕТ» (флагман) · диагноз чужого аккаунта (главный генератор входящих) · пруф цифрами со скрина · anti-hype · механика конвейера.
• Ритм: 6 Reels + 1 карусель в неделю, 3–5 сторис в день (живой слой).
• Правило: 5 роликов одного типа с удержанием 3 сек < 40% → тип закрываем.
• CTA — кодовое слово в комментарий, не «смотри описание».""",
32: """ФОРМАТ «ПАПКА ДЕЛА» (разбор 12 роликов @casyn.ai, 28.09.2026)
• Было: 60–589 просмотров; заголовок только на обложке, мелкие субтитры, 5 разных шаблонов и 5 разных призывов.
• Стало: хук-заголовок обложки с 0:00 + приближение аватара → документ с жёлтым маркером на ключевом слове → счётчик срока / чек-лист / шкала событий → экран Casyn → один призыв.
• Темы: everyday legal — увольнение, severance, страховая, иммиграция, аренда, развод. НЕ personal injury.
• Решить: CTA — кодовое слово или ссылка.""",
33: """ПОЗИЦИЯ: опытный CPA-друг. Лицо — Антон Чехов (Enrolled Agent), Edeal с 2019, 1700+ клиентов.
• ДИРЕКТИВА КЛИЕНТА (21.08): очень широкие темы, интересные всем (звёзды, бренды, курьёзы) → мостик в бизнес и налоги США. Узкие темы про LLC/налоги «соберут 20 просмотров».
• Каркас (85–95 сек): хук-факт → фактура → механика → последствие с цифрой → мостик → CTA. Именованный персонаж с нелепой деталью доживает до финала.
• CTA двухуровневый: вопрос-подъёб в комментарии + кодовое слово для горячих.
• Запрет: упаковка «контент-завод на автопилоте» — Антона на этом чуть не развели, он публично это разоблачал.
• Все цифры и нормы подтверждает Антон до съёмки.""",
35: """ПОЗИЦИЯ: Concierge Privilege — терапевт 20+ лет (Weill Cornell / NY-Presbyterian), Майами и Нью-Йорк. Работаем через агентство.
• Вывод исследования (12.08): concierge / pre-op / I-693 — потолок 27–87 тыс. просмотров. Главная вирусная вена — «система здравоохранения США»: счета, страховки, что врач не скажет.
• Weight management — только FDA-одобренные GLP-1, принципиально НЕ compounded.
• Контент-банк: подкаст SUPERHUMANS (сторителлинг «я ждала тебя четыре года», иммигрантская история).""",
38: """ПОЗИЦИЯ: не «рисуем нейросетью», а «студия с 13 годами и 500+ проектами, которая первой поставила ИИ на поток».
• Контент-модель по 4 эталонам: @yodezeen_architects и @trush.design — красивое видео о дизайне (~55%); @victoria.stekl и @aleksandrabos.studio — под ИИ-аватар и подачу (~35%).
• Разница YODEZEEN (медиана 43,8 тыс.) и TRUSH (7,7 тыс.) при одинаковом визуале — ПОВОД: необычный носитель, премьера, награда, цифра.
• Аватар: одна мизансцена, крупный титр сверху, мысль несёт текст, 6–9 секунд.
• Сейчас: 29,3 тыс. подписчиков, медиана Reels 2 200. Цель по KPI — 12 000.""",
40: """ПОЗИЦИЯ: смена подрядчика, а не холодный старт. Разделение Medical/MedSpa осознанное.
• Факт из их кабинета (август): Medical — лид на 8 250 просмотров, MedSpa — на 45 167. Medical в 5,5 раза эффективнее → перевес в гормоны, вес, анализы.
• Формат — по мотивам dr.panch: «разбор звезды», два врача-женщины (можно диалог), обещание «разберём ваш случай».
• Референсы клиента: @thenovuscenter_ (темы + DM WELLNESS), @lifesculpt_naperville (протокол под до/после).
• КОМПЛАЕНС: Medical банили 13.05.2026 — интимное здоровье, GLP-1, пептиды подаём максимально аккуратно.
• Боли клиента: результат 65% от ожиданий, ошибки в английском, неточный монтаж, задержки.""",
}
STRATEGY[15] = STRATEGY[14]
STRATEGY[41] = STRATEGY[40]

def q(s):  # SQL dollar-quoting
    return f"$q${s}$q$"

print("-- Бренд-киты и черновики контент-стратегий, 29.09.2026 (сгенерировано scripts/brand_kits_2026-09-29.py)")
print("-- Бренд: перезаписывается только у карточек, где бренда ещё нет (Госпожу Елю и Марию не трогаем).")
print("-- Стратегия: добавляется только там, где текущей стратегии ещё нет.\n")
for cid, kit in KITS.items():
    kit = dict(kit); kit["meta"] = META
    print(f"insert into public.client_brand (client_id, kit, version) values ({cid}, {q(json.dumps(kit, ensure_ascii=False))}::jsonb, 1)\n"
          f"on conflict (client_id) do nothing;\n")
for cid, body in STRATEGY.items():
    print("insert into public.client_documents (client_id, kind, title, body, version, is_current, note, author_name)\n"
          f"select {cid}, 'strategy', 'Контент-стратегия', {q(body)}, 1, true, "
          f"{q('Черновик собран Claude 29.09 по нашим аудитам и разборам — проверить и дополнить')}, 'Claude'\n"
          f"where not exists (select 1 from public.client_documents where client_id = {cid} and kind = 'strategy' and is_current);\n")
print("""-- Проверка
select c.id, c.name, (b.client_id is not null) as "бренд",
       exists (select 1 from public.client_documents d where d.client_id = c.id and d.kind = 'strategy' and d.is_current) as "стратегия"
from public.clients c left join public.client_brand b on b.client_id = c.id
where c.stage = 'active' order by c.id;""")
