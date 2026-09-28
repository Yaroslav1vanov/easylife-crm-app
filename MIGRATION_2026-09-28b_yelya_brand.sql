-- ─────────────────────────────────────────────────────────────────────────────
-- Бренд-кит Госпожи Ели — первый заполненный клиент во вкладке «Стратегия».
-- Перенесён из ~/easylife-banners/gospoja-yelya/STYLE.md, по которому собирались её баннеры.
-- Выполнять ПОСЛЕ MIGRATION_2026-09-28_client_strategy.sql.
-- Клиент ищется по имени, id вручную подставлять не нужно.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) убедиться, что клиент находится ровно один
select id, name, surname from public.clients where id = 25;

-- 2) записать бренд-кит (повторный запуск просто обновит его)
insert into public.client_brand (client_id, kit, version)
select id, '{
  "identity": {
    "display_name": "Госпожа Еля",
    "role_line": "30 лет практики",
    "niche": "expert",
    "geo": "Нью-Йорк, онлайн по США",
    "language": "ru",
    "address": "вы",
    "voice_notes": "Боль-first и эмпатия. Мягко, с заботой, без давления и без эзотерики в лоб.",
    "words_yes": [
      "помогу понять",
      "найдём решение",
      "поддержу",
      "конфиденциально",
      "с заботой"
    ],
    "words_no": [
      "верну мужа",
      "сниму порчу",
      "гарантирую",
      "магия"
    ]
  },
  "visual": {
    "colors": {
      "bg": "#1A1410",
      "bg_alt": "#F5EFE6",
      "text": "#F3ECE0",
      "text_on_light": "#2A211A",
      "accent": "#E0C16F",
      "accent_gradient": "linear-gradient(100deg,#F0D888 0%,#E0C16F 40%,#C9A24B 100%)",
      "muted": "#B8AC98",
      "card": "rgba(26,20,16,.72)"
    },
    "fonts": {
      "display": {
        "family": "Playfair Display",
        "source": "google",
        "weight": 800
      },
      "accent": {
        "family": "Montserrat",
        "source": "google",
        "weight": 900,
        "case": "upper"
      },
      "body": {
        "family": "Manrope",
        "source": "google",
        "weight": 500
      }
    },
    "logo": {
      "use": "never"
    },
    "shape": {
      "radius": "999px для пилюль, 18px для карточек",
      "divider": "тонкая линия — ♥ — тонкая линия",
      "icons": "тонкий золотой контур"
    },
    "photo_style": "тёплый полумрак, свечи, золото и шоколад, карты таро на столе, взгляд в камеру",
    "layout": [
      "пилюля-локация «5TH AVENUE, NYC»",
      "заголовок: эмоция serif + ударное слово золотом капсом",
      "разделитель — ♥ —",
      "подкопия 1–2 строки боли",
      "буллеты выгод 2–3",
      "карточка эксперта: круглый аватар, имя, стаж, гео",
      "золотая кнопка «Написать мне» + «Конфиденциально. С заботой.»"
    ]
  },
  "channels": {
    "instagram": "https://instagram.com/gospozhaelia",
    "whatsapp": "+1 347-462-5595",
    "cta_style": "Написать мне · Конфиденциально. С заботой.",
    "site": "https://gospoja-yelya.vercel.app"
  },
  "rules": {
    "compliance": "meta_sensitive",
    "never": [
      "гарантированный результат",
      "прямые утверждения о сверхспособностях"
    ],
    "consent_required_for_faces": true
  }
}'::jsonb, 1
from public.clients
where id = 25
on conflict (client_id) do update set kit = excluded.kit, version = public.client_brand.version + 1, updated_at = now();

-- 3) проверка
select c.name, b.version, b.kit -> 'identity' ->> 'display_name' as имя_в_кадре,
       b.kit -> 'visual' -> 'colors' ->> 'accent' as акцент
from public.client_brand b join public.clients c on c.id = b.client_id;
