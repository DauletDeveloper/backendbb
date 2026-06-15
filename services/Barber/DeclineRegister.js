const { db } = require('../../db');
const { register: registerTable, barbershop } = require('../schema');
const { eq, sql } = require('drizzle-orm');
const { sendNotificationService } = require('../Other/SendNotification');

const TWO_HOURS = sql`interval '2 hours'`;

const getRegisterAndValidate = async (registerId) => {
  const [registerData] = await db
    .select()
    .from(registerTable)
    .where(eq(registerTable.id, registerId));

  if (!registerData) throw new Error("Запись не найдена");
  if (registerData.status === "declined") throw new Error("Запись уже отменена");
  if (registerData.status !== "active") throw new Error("Запись нельзя отменить");

  const dateStr = new Date(registerData.date).toISOString().slice(0, 10);
  const timeStr = String(registerData.time).slice(0, 5);

  const [{ allowed }] = await db.execute(
    sql`
      SELECT (
        (${dateStr}::date + ${timeStr}::time)
        - NOW() AT TIME ZONE 'Asia/Almaty'
      ) > interval '2 hours' AS allowed
    `
  );

  if (!allowed) {
    throw new Error("Отменить запись можно не позднее чем за 2 часа до её начала");
  }

  return registerData;
};

const declineUserService = async (registerId, userId) => {
  const registerData = await getRegisterAndValidate(registerId);

  if (registerData.userId !== userId) throw new Error("Нет доступа");

  const [updated] = await db
    .update(registerTable)
    .set({ status: "declined" })
    .where(eq(registerTable.id, registerId))
    .returning();

  const dateStr = new Date(registerData.date).toLocaleDateString("ru-RU");
  const timeStr = String(registerData.time).slice(0, 5);

  try {
    const [shop] = await db
      .select()
      .from(barbershop)
      .where(eq(barbershop.id, registerData.barberId));

    if (shop?.ownerId) {
      await sendNotificationService({
        to: shop.ownerId,
        title: "Клиент отменил запись",
        description: `Клиент отменил запись на ${dateStr} в ${timeStr}.`,
      });
    }
  } catch (err) {
    console.error("declineUser: owner notification failed:", err);
  }

  try {
    await sendNotificationService({
      to: userId,
      title: "Запись отменена",
      description: `Ваша запись на ${dateStr} в ${timeStr} успешно отменена.`,
    });
  } catch (err) {
    console.error("declineUser: user notification failed:", err);
  }

  return updated;
};

const declineBarberService = async (registerId, ownerId) => {
  const registerData = await getRegisterAndValidate(registerId);

  const [shop] = await db
    .select()
    .from(barbershop)
    .where(eq(barbershop.id, registerData.barberId));

  if (!shop) throw new Error("Барбершоп не найден");
  if (shop.ownerId !== ownerId) throw new Error("Нет доступа");

  const [updated] = await db
    .update(registerTable)
    .set({ status: "declined" })
    .where(eq(registerTable.id, registerId))
    .returning();

  const dateStr = new Date(registerData.date).toLocaleDateString("ru-RU");
  const timeStr = String(registerData.time).slice(0, 5);

  try {
    await sendNotificationService({
      to: registerData.userId,
      title: "Запись отменена барбершопом",
      description: `Барбершоп «${shop.name}» отменил вашу запись на ${dateStr} в ${timeStr}.`,
    });
  } catch (err) {
    console.error("declineBarber: client notification failed:", err);
  }

  try {
    await sendNotificationService({
      to: ownerId,
      title: "Запись отменена",
      description: `Вы отменили запись клиента на ${dateStr} в ${timeStr}.`,
    });
  } catch (err) {
    console.error("declineBarber: owner notification failed:", err);
  }

  return updated;
};

module.exports = { declineUserService, declineBarberService };