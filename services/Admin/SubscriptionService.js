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


module.exports = { startTrial, activateSubscription, SUBSCRIPTION_PRICE };