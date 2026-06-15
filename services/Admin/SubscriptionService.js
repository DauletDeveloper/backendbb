const cron = require("node-cron");
const { db } = require("../../db");
const { barbershop } = require("../schema");
const { eq, and, lte, gt } = require("drizzle-orm");
const { sendNotificationService } = require("../Other/SendNotification");

const TRIAL_DAYS = 30;
const SUBSCRIPTION_PRICE = 5000;
const ALMATY_TZ = "Asia/Almaty";

const getNowAlmaty = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: ALMATY_TZ }));

async function startTrial(shopId) {
  const trialEndsAt = getNowAlmaty();
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

  await db
    .update(barbershop)
    .set({ subscriptionStatus: "trial", trialEndsAt })
    .where(eq(barbershop.id, shopId));
}

async function activateSubscription(shopId) {
  const now = getNowAlmaty();

  const [shop] = await db
    .select()
    .from(barbershop)
    .where(eq(barbershop.id, shopId));

  if (!shop) throw new Error("Барбершоп не найден");

  const base =
    shop.subscriptionEndsAt && new Date(shop.subscriptionEndsAt) > now
      ? new Date(shop.subscriptionEndsAt)
      : now;

  const subscriptionEndsAt = new Date(base);
  subscriptionEndsAt.setMonth(subscriptionEndsAt.getMonth() + 1);

  await db
    .update(barbershop)
    .set({ subscriptionStatus: "active", subscriptionEndsAt })
    .where(eq(barbershop.id, shopId));

  if (shop.ownerId) {
    await sendNotificationService({
      to: shop.ownerId,
      title: "Подписка активирована",
      text: `Доступ к платформе продлён до ${subscriptionEndsAt.toLocaleDateString("ru-RU")}.`,
    });
  }
}

function startSubscriptionCron() {
  cron.schedule("0 9 * * *", async () => {
    console.log("[SubscriptionCron] Проверка подписок...");
    const now = getNowAlmaty();

    try {
      const expiredTrials = await db
        .select()
        .from(barbershop)
        .where(
          and(
            eq(barbershop.subscriptionStatus, "trial"),
            lte(barbershop.trialEndsAt, now)
          )
        );

      for (const shop of expiredTrials) {
        await db
          .update(barbershop)
          .set({ subscriptionStatus: "suspended" })
          .where(eq(barbershop.id, shop.id));

        if (shop.ownerId) {
          await sendNotificationService({
            to: shop.ownerId, 
            title: "Пробный период завершён",
            text: `Бесплатный период истёк. Оплатите подписку (${SUBSCRIPTION_PRICE} ₸/мес) для продолжения работы. Для оплаты свяжитесь с модератором +77080122012 через WhatsApp`,
          });
        }
      }
      const expiredSubs = await db
        .select()
        .from(barbershop)
        .where(
          and(
            eq(barbershop.subscriptionStatus, "active"),
            lte(barbershop.subscriptionEndsAt, now)
          )
        );

      for (const shop of expiredSubs) {
        await db
          .update(barbershop)
          .set({ subscriptionStatus: "suspended" })
          .where(eq(barbershop.id, shop.id));

        if (shop.ownerId) {
          await sendNotificationService({
            to: shop.ownerId,
            title: "Подписка истекла",
            text: `Действие подписки истекло. Оплатите подписку (${SUBSCRIPTION_PRICE} ₸/мес) для продолжения работы. Для оплаты свяжитесь с модератором +77080122012 через WhatsApp`,
          });
        }
      }
      const warningFrom = new Date(now);
      warningFrom.setDate(warningFrom.getDate() + 2);
      const warningTo = new Date(now);
      warningTo.setDate(warningTo.getDate() + 3);

      const soonExpiring = await db
        .select()
        .from(barbershop)
        .where(
          and(
            eq(barbershop.subscriptionStatus, "active"),
            gt(barbershop.subscriptionEndsAt, warningFrom),
            lte(barbershop.subscriptionEndsAt, warningTo)
          )
        );

      for (const shop of soonExpiring) {
        if (shop.ownerId) {
          await sendNotificationService({
            to: shop.ownerId,
            title: "Подписка заканчивается через 3 дня",
            text: `Продлите подписку заранее, чтобы не потерять доступ к платформе. Для продления свяжитесь через WhatsApp с модератором +77080122012`,
          });
        }
      }
    } catch (err) {
      console.error("[SubscriptionCron] Ошибка:", err);
    }
  }, {
    timezone: ALMATY_TZ, 
  });
}

module.exports = { startTrial, activateSubscription, startSubscriptionCron, SUBSCRIPTION_PRICE };