const { db } = require("../../db");
const { barbershop } = require("../schema");
const { eq } = require("drizzle-orm");
const { sendNotificationService } = require("../Other/SendNotification");

const TRIAL_DAYS = 30;
const SUBSCRIPTION_PRICE = 5000;
const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;
const getNowAlmaty = () => {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utcMs + ALMATY_OFFSET_MS);
};

const addOneMonth = (date) => {
  const d = new Date(date);
  const originalDay = d.getDate();
  d.setMonth(d.getMonth() + 1);
  if (d.getDate() !== originalDay) d.setDate(0);
  return d;
};

const validateShopId = (shopId) => {
  const id = Number(shopId);
  if (!Number.isInteger(id) || id <= 0)
    throw new Error('Некорректный ID барбершопа');
  return id;
};


async function startTrial(shopId) {
  const id = validateShopId(shopId);

  const [shop] = await db
    .select()
    .from(barbershop)
    .where(eq(barbershop.id, id));

  if (!shop) throw new Error('Барбершоп не найден');


  if (shop.trialEndsAt !== null && shop.trialEndsAt !== undefined)
    throw new Error('Пробный период уже был использован');

  if (shop.subscriptionStatus === 'active')
    throw new Error('У барбершопа уже есть активная подписка');

  const trialEndsAt = getNowAlmaty();
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

  await db
    .update(barbershop)
    .set({ subscriptionStatus: 'trial', trialEndsAt })
    .where(eq(barbershop.id, id));
}


async function activateSubscription(shopId) {
  const id = validateShopId(shopId);
  const now = getNowAlmaty();

  let notifyOwnerId = null;
  let notifyDate = null;

  await db.transaction(async (tx) => {
    const [shop] = await tx
      .select()
      .from(barbershop)
      .where(eq(barbershop.id, id))
      .for('update'); 

    if (!shop) throw new Error('Барбершоп не найден');

    const base =
      shop.subscriptionEndsAt && new Date(shop.subscriptionEndsAt) > now
        ? new Date(shop.subscriptionEndsAt)
        : now;

    const subscriptionEndsAt = addOneMonth(base);

    await tx
      .update(barbershop)
      .set({ subscriptionStatus: 'active', subscriptionEndsAt })
      .where(eq(barbershop.id, id));
    notifyOwnerId = shop.ownerId;
    notifyDate = subscriptionEndsAt;
  });
  if (notifyOwnerId) {
    try {
      await sendNotificationService({
        to: notifyOwnerId,
        title: 'Подписка активирована',
        text: `Доступ к платформе продлён до ${notifyDate.toLocaleDateString('ru-RU')}.`,
      });
    } catch (err) {
      console.error('[activateSubscription] Ошибка отправки уведомления:', err);
    }
  }
}

module.exports = { startTrial, activateSubscription, SUBSCRIPTION_PRICE };