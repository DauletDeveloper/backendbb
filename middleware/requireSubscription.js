const { db } = require("../db.js");
const { barbershop } = require("../services/schema.js");
const { eq } = require("drizzle-orm");

const requireActiveSubscription = async (req, res, next) => {
  try {
    const shopId =
      req.params.shopId ||
      req.params.barberId ||
      req.body.barberId;
    if (!shopId) {
      return res.status(400).json({
        status: "error",
        message: "shopId не определён для проверки подписки",
      });
    }
 
    const [shop] = await db
      .select({
        id: barbershop.id,
        ownerId: barbershop.ownerId,
        subscriptionStatus: barbershop.subscriptionStatus,
        trialEndsAt: barbershop.trialEndsAt,
        subscriptionEndsAt: barbershop.subscriptionEndsAt,
      })
      .from(barbershop)
      .where(eq(barbershop.id, shopId));
 
    if (!shop) {
      return res.status(404).json({
        status: "error",
        message: "Барбершоп не найден",
      });
    }
 
    if (shop.ownerId !== req.userId) {
      return res.status(403).json({
        status: "error",
        message: "Нет доступа к этому барбершопу",
      });
    }
 
    const now = new Date();
    const { subscriptionStatus, trialEndsAt, subscriptionEndsAt } = shop;
 
    if (subscriptionStatus === "trial") {
      if (!trialEndsAt || now > trialEndsAt) {
        return res.status(403).json({
          status: "error",
          code: "TRIAL_EXPIRED",
          message: "Пробный период истёк. Оформите подписку для продолжения.",
        });
      }
      return next();
    }
 
    if (subscriptionStatus === "active") {
      if (!subscriptionEndsAt || now > subscriptionEndsAt) {
        return res.status(403).json({
          status: "error",
          code: "SUBSCRIPTION_EXPIRED",
          message: "Подписка истекла. Продлите подписку для продолжения.",
        });
      }
      return next();
    }
 
    return res.status(403).json({
      status: "error",
      code: "NO_SUBSCRIPTION",
      message: "Требуется активная подписка.",
    });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
};
 
module.exports = { requireActiveSubscription };