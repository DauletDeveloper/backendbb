const { db } = require("../../db.js");
const { eq } = require("drizzle-orm");
const { payoutRequest, users } = require("../schema.js");
const { sendNotificationService } = require("../Other/SendNotification.js");

const createPayoutService = async (userId, amount) => {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error("Пользователь не найден");
  if (!user.payoutMethod) throw new Error("Способ выплаты не указан");
  if (user.moneyCount < amount) throw new Error("Недостаточно средств");
  if (amount <= 0) throw new Error("Сумма должна быть больше 0");

  return await db.transaction(async (tx) => {
    const [payout] = await tx.insert(payoutRequest).values({
      userId,
      amount,
      payoutMethod: user.payoutMethod,
    }).returning();

    await tx.update(users)
      .set({ moneyCount: user.moneyCount - amount })
      .where(eq(users.id, userId));

    return payout;
  });
};
const getPayoutsService = async (userId) => {
  const payouts = await db.select().from(payoutRequest).where(eq(payoutRequest.userId, userId));
  return payouts;
};

const getPendingPayoutsService = async () => {
  const payouts = await db.query.payoutRequest.findMany({
    where: eq(payoutRequest.status, "waiting"),
    with: { user: true },
  });
  return payouts;
};

const approvePayoutService = async (payoutId) => {
  const [payout] = await db.select().from(payoutRequest).where(eq(payoutRequest.id, payoutId));
  if (!payout) throw new Error("Заявка не найдена");

  const [updated] = await db
    .update(payoutRequest)
    .set({ status: "approved" })
    .where(eq(payoutRequest.id, payoutId))
    .returning();

  await db
    .update(users)
    .set({ moneyCount: db.raw(`money_count - ${payout.amount}`) })
    .where(eq(users.id, payout.userId));

  try {
    await sendNotificationService({
      to: payout.userId,
      from: process.env.EMAIL_USER,
      title: "Выплата одобрена",
      description: `Ваша заявка на выплату ${payout.amount}₸ одобрена и будет обработана в ближайшее время.`,
    });
  } catch (e) {
    console.log("Ошибка уведомления:", e.message);
  }

  return updated;
};

const rejectPayoutService = async (payoutId, reason) => {
  const [payout] = await db.select().from(payoutRequest).where(eq(payoutRequest.id, payoutId));
  if (!payout) throw new Error("Заявка не найдена");

  const [updated] = await db
    .update(payoutRequest)
    .set({ status: "rejected" })
    .where(eq(payoutRequest.id, payoutId))
    .returning();

  try {
    await sendNotificationService({
      to: payout.userId,
      from: process.env.EMAIL_USER,
      title: "Выплата отклонена",
      description: `Ваша заявка на выплату ${payout.amount}₸ отклонена. Причина: ${reason}`,
    });
  } catch (e) {
    console.log("Ошибка уведомления:", e.message);
  }

  return updated;
};

module.exports = { createPayoutService, getPayoutsService, getPendingPayoutsService, approvePayoutService, rejectPayoutService };