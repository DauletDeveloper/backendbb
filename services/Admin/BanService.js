const { db } = require("../../db.js");
const { eq } = require("drizzle-orm");
const { users } = require("../schema.js");
const { sendNotificationService } = require("../Other/SendNotification.js");

const banUserService = async (userId, reason, durationMinutes) => {
  const bannedUntil = durationMinutes
    ? new Date(Date.now() + durationMinutes * 60 * 1000)
    : null;

  const [current] = await db
    .select({ totalBanned: users.totalBanned })
    .from(users)
    .where(eq(users.id, userId));

  if (!current) throw new Error("Пользователь не найден");

  const [updated] = await db
    .update(users)
    .set({ isBanned: true, bannedUntil, totalBanned: current.totalBanned + 1 })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) throw new Error("Пользователь не найден");
  try {
    await sendNotificationService({
      to: updated.id,
      from: process.env.EMAIL_USER,
      title: "Ваш аккаунт заблокирован",
      description: durationMinutes
        ? `Ваш аккаунт заблокирован на ${durationMinutes} минут. Причина: ${reason}`
        : `Ваш аккаунт заблокирован навсегда. Причина: ${reason}`,
    });
  } catch (e) {
    console.log("Ошибка уведомления:", e.message);
  }

  return updated;
};

const unbanUserService = async (userId) => {
  const [updated] = await db
    .update(users)
    .set({ isBanned: false, bannedUntil: null })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) throw new Error("Пользователь не найден");

  try {
    await sendNotificationService({
      to: updated.id,
      from: process.env.EMAIL_USER,
      title: "Ваш аккаунт разблокирован",
      description: "Блокировка с вашего аккаунта была снята администратором.",
    });
  } catch (e) {
    console.log("Ошибка уведомления:", e.message);
  }

  return updated;
};

module.exports = { banUserService, unbanUserService };