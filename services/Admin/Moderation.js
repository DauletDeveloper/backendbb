const { db } = require("../../db.js");
const { eq, sql } = require("drizzle-orm"); 
const { barbershop, users } = require("../schema.js");
const { sendNotificationService } = require("../Other/SendNotification.js");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const WHATSAPP_NUMBER = "877080122012";
const TRIAL_DAYS = 30;

const approveShopService = async (shopId) => {
  const [shop] = await db.select().from(barbershop).where(eq(barbershop.id, shopId));
  if (!shop) throw new Error("Барбершоп не найден");
  if (!shop.ownerId) throw new Error("Айди пользователя нет");

  const [owner] = await db.select().from(users).where(eq(users.id, shop.ownerId));
  if (!owner) throw new Error("Владелец не найден");

  const result = await db.execute(sql`SELECT NOW() AT TIME ZONE 'Asia/Almaty' AS now`);
  const nowKZ = new Date(result[0].now);

  if (owner.triedTrial) {
    const [updated] = await db
      .update(barbershop)
      .set({ isVerified: false, subscriptionStatus: "awaiting" })
      .where(eq(barbershop.id, shopId))
      .returning();

    await sendNotificationService({
      to: updated.ownerId,
      title: `Оплатите подписку за ваш барбершоп ${updated.name}. Цена 5000 тенге в месяц. Для оплаты свяжитесь с администратором через WhatsApp +77080122012`,
    });

    return updated;
  }
  const trialEndsAt = new Date(nowKZ);
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

  await db.update(users).set({ triedTrial: true }).where(eq(users.id, shop.ownerId));

  const [updated] = await db
    .update(barbershop)
    .set({ isVerified: true, subscriptionStatus: "trial", trialEndsAt })
    .where(eq(barbershop.id, shopId))
    .returning();

  const endsStr = trialEndsAt.toLocaleDateString("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
  });

  await sendNotificationService({
    to: updated.ownerId,
    title: "Ваш барбершоп одобрен",
    description: `Барбершоп "${updated.name}" успешно прошёл модерацию. Пробный период: ${TRIAL_DAYS} дней.`,
  });

  await transporter.sendMail({
    from: `"BarberBase" <${process.env.EMAIL_USER}>`,
    to: owner.email,
    subject: `Барбершоп "${shop.name}" одобрен — пробный период активен`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#fafafa;border-radius:12px;overflow:hidden;">
        <div style="background:#18181b;padding:28px 32px;border-bottom:1px solid #27272a;">
          <h1 style="margin:0;font-size:20px;color:#fafafa;">BarberBase</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#71717a;">Барбершоп одобрен</p>
        </div>
        <div style="padding:28px 32px;">
          <p style="font-size:15px;color:#a1a1aa;margin:0 0 20px;">
            Барбершоп <strong style="color:#fafafa;">${shop.name}</strong> успешно прошёл модерацию 🎉
          </p>
          <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:20px;margin-bottom:24px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Статус</td>
                <td style="padding:8px 0;font-size:14px;color:#86efac;font-weight:600;text-align:right;">Пробный период</td>
              </tr>
              <tr style="border-top:1px solid #27272a;">
                <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Действует до</td>
                <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${endsStr}</td>
              </tr>
              <tr style="border-top:1px solid #27272a;">
                <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Осталось дней</td>
                <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${TRIAL_DAYS}</td>
              </tr>
            </table>
          </div>
          <p style="font-size:13px;color:#71717a;line-height:1.6;margin:0;">
            Пробная подписка окончится через <strong style="color:#fafafa;">${TRIAL_DAYS} дней</strong>. 
            Свяжитесь с нами заранее: <strong style="color:#fafafa;">+7 708 012 2012</strong>
          </p>
        </div>
      </div>`,
  });

  return updated;
};
const getPendingShopsService = async () => {
  const shops = await db.query.barbershop.findMany({
    where: eq(barbershop.isVerified, false),
    with: {
      owner: {
        columns: {
          name: true,
          email: true,
        },
      },
      barbers: true,
      services: true,
      photos: true,
    },
  });

  return shops;
};



const rejectShopService = async (shopId) => {
  const [shop] = await db
    .select()
    .from(barbershop)
    .where(eq(barbershop.id, shopId));

  if (!shop) throw new Error("Барбершоп не найден");
  if (shop.isVerified) throw new Error("Нельзя отклонить уже одобренный барбершоп");

  const [owner] = await db
    .select()
    .from(users)
    .where(eq(users.id, shop.ownerId));

  if (!owner) throw new Error("Владелец не найден");


  await db
    .delete(barbershop)
    .where(eq(barbershop.id, shopId));


  try {
    await sendNotificationService({
      to: owner.id,
      from: process.env.EMAIL_USER,
      title: "Барбершоп отклонён",
      description: `Барбершоп "${shop.name}" не прошёл модерацию. Свяжитесь с поддержкой для уточнения причин.`,
    });
  } catch (err) {
    console.error("rejectShop: notification failed:", err);
  }


  try {
    await transporter.sendMail({
      from: `"BarberBase" <${process.env.EMAIL_USER}>`,
      to: owner.email,
      subject: `Барбершоп "${shop.name}" не прошёл модерацию`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#fafafa;border-radius:12px;overflow:hidden;">
          <div style="background:#18181b;padding:28px 32px;border-bottom:1px solid #27272a;">
            <h1 style="margin:0;font-size:20px;color:#fafafa;">BarberBase</h1>
            <p style="margin:6px 0 0;font-size:13px;color:#71717a;">Результат модерации</p>
          </div>
          <div style="padding:28px 32px;">
            <p style="font-size:15px;color:#a1a1aa;margin:0 0 20px;">
              К сожалению, барбершоп <strong style="color:#fafafa;">${shop.name}</strong> не прошёл модерацию.
            </p>
            <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:20px;margin-bottom:24px;">
              <p style="font-size:14px;color:#fafafa;margin:0 0 8px;font-weight:600;">Что делать дальше?</p>
              <p style="font-size:13px;color:#a1a1aa;margin:0;line-height:1.6;">
                Свяжитесь с поддержкой через WhatsApp для уточнения причин и повторной подачи заявки.
              </p>
              <a href="https://wa.me/77080122012"
                style="display:inline-flex;align-items:center;gap:8px;background:#1c0a0a;border:1px solid #7f1d1d;border-radius:10px;padding:12px 20px;text-decoration:none;margin-top:16px;">
                <span style="font-size:14px;font-weight:600;color:#fca5a5;">WhatsApp: +7 708 012 2012</span>
              </a>
            </div>
            <p style="font-size:12px;color:#52525b;text-align:center;margin:0;">BarberBase — управление барбершопом</p>
          </div>
        </div>`,
    });
  } catch (err) {
    console.error("rejectShop: email failed:", err);
  }

  return { message: `Барбершоп "${shop.name}" отклонён и удалён` };
};

const revokeShopService = async (shopId) => {
  const [shop] = await db
    .select()
    .from(barbershop)
    .where(eq(barbershop.id, shopId));

  if (!shop) throw new Error("Барбершоп не найден");
  if (!shop.isVerified) throw new Error("Барбершоп и так не верифицирован");

  const [owner] = await db
    .select()
    .from(users)
    .where(eq(users.id, shop.ownerId));

  if (!owner) throw new Error("Владелец не найден");

  const [updated] = await db
    .update(barbershop)
    .set({
      isVerified: false,
      subscriptionStatus: "awaiting",
      trialEndsAt: null,
      subscriptionEndsAt: null,
    })
    .where(eq(barbershop.id, shopId))
    .returning();

  try {
    await sendNotificationService({
      to: owner.id,
      from: process.env.EMAIL_USER,
      title: "Верификация отозвана",
      description: `Верификация барбершопа "${shop.name}" отозвана администратором. Барбершоп скрыт из каталога. Возможная причина: Срок подписки истек или некорректная информация`,
    });
  } catch (err) {
    console.error("revokeShop: notification failed:", err);
  }
  try {
    await transporter.sendMail({
      from: `"BarberBase" <${process.env.EMAIL_USER}>`,
      to: owner.email,
      subject: `Верификация "${shop.name}" отозвана`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#fafafa;border-radius:12px;overflow:hidden;">
          <div style="background:#18181b;padding:28px 32px;border-bottom:1px solid #27272a;">
            <h1 style="margin:0;font-size:20px;color:#fafafa;">BarberBase</h1>
            <p style="margin:6px 0 0;font-size:13px;color:#71717a;">Статус верификации изменён</p>
          </div>
          <div style="padding:28px 32px;">
            <p style="font-size:15px;color:#a1a1aa;margin:0 0 20px;">
              Верификация барбершопа <strong style="color:#fafafa;">${shop.name}</strong> была отозвана администратором.
              Барбершоп временно скрыт из каталога.
            </p>
            <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:20px;margin-bottom:24px;">
              <p style="font-size:14px;color:#fafafa;margin:0 0 8px;font-weight:600;">Для восстановления доступа</p>
              <p style="font-size:13px;color:#a1a1aa;margin:0 0 16px;line-height:1.6;">
                Свяжитесь с модератором через WhatsApp для уточнения причин и решения вопроса.
              </p>
              <a href="https://wa.me/77080122012"
                style="display:inline-flex;align-items:center;gap:8px;background:#052e16;border:1px solid #14532d;border-radius:10px;padding:12px 20px;text-decoration:none;">
                <span style="font-size:14px;font-weight:600;color:#86efac;">WhatsApp: +7 708 012 2012</span>
              </a>
            </div>
            <p style="font-size:12px;color:#52525b;text-align:center;margin:0;">BarberBase — управление барбершопом</p>
          </div>
        </div>`,
    });
  } catch (err) {
    console.error("revokeShop: email failed:", err);
  }

  return updated;
};


module.exports = { approveShopService, revokeShopService, rejectShopService, getPendingShopsService };