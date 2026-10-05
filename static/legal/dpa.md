<!-- version: 1.0; effective_from: 2026-10-05; status: draft accepted by operator without legal review -->
# Data Processing Addendum v1.0

> Draft text. Not a legal opinion.

## 1. Roles

For personal data in orders (delivery address, passport data, contact data of the payer), the merchant is the controller and APIbase is the processor.

## 2. Instructions

APIbase processes this data only to store it temporarily and to pass it to the merchant, following the merchant's documented instructions and this Addendum.

## 3. Encryption

Fields marked as personal data are encrypted by the buyer's agent under the merchant's public key before they reach APIbase. APIbase stores only the ciphertext and its sha256. It does not write envelopes or field hashes to logs; metrics are counters only.

## 4. Retention

- Delivery address: deleted when the order is CLOSED plus 30 days (dispute window), or earlier on the merchant's request.
- Passport data: deleted at the first of: 7 days after delivery to the merchant; DELIVERED; CANCELLED or REFUNDED. Maximum 30 days from creation.
- Storage at APIbase is temporary; the merchant must keep its own copy.

## 5. Sub-processors

Hetzner (hosting) and Resend (email delivery).

## 6. Incidents

APIbase notifies the merchant of a personal data incident within 72 hours of becoming aware of it.

## 7. Data subject rights

Requests from data subjects go through the merchant as controller; APIbase helps on the merchant's request.

APIbase is a technology intermediary; buyer funds do not pass through APIbase; the fee is charged to the merchant; the legal entity and jurisdiction will be announced.

---

# Соглашение об обработке данных v1.0 (RU)

> Черновик. Не юридическое заключение.

## 1. Роли

Для персональных данных в заказах (адрес доставки, паспортные данные, контакт плательщика) продавец — оператор (controller), APIbase — обработчик (processor).

## 2. Инструкции

APIbase обрабатывает эти данные только для временного хранения и передачи продавцу, по документированным инструкциям продавца и этому Соглашению.

## 3. Шифрование

Поля с персональными данными шифруются агентом покупателя под открытый ключ продавца до попадания к APIbase. APIbase хранит только шифротекст и его sha256. Конверты и хэши полей в логи не пишутся; метрики — только счётчики.

## 4. Сроки хранения

- Адрес доставки: удаляется при CLOSED + 30 дней (окно споров), либо по запросу продавца раньше.
- Паспорт: удаляется при первом из событий — 7 дней после передачи продавцу; DELIVERED; CANCELLED или REFUNDED. Максимум 30 дней от создания.
- Хранение у APIbase временное; продавец обязан сохранить свою копию.

## 5. Субобработчики

Hetzner (хостинг) и Resend (доставка почты).

## 6. Инциденты

APIbase уведомляет продавца об инциденте с персональными данными в течение 72 часов с момента, как о нём стало известно.

## 7. Права субъектов данных

Запросы субъектов данных идут через продавца как оператора; APIbase помогает по его запросу.

APIbase — технологический посредник; средства покупателя не проходят через APIbase; комиссия взимается с продавца; юридическое лицо и юрисдикция — будут объявлены.
