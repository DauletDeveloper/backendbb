const nodemailer = require("nodemailer");
const { eq } = require("drizzle-orm");
const { users, notification } = require("../schema.js");
const { db } = require("../../db.js");
 
const MAX_TITLE_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 2000;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
 
const sendNotificationService = async (data) => {
  const { to, title, description } = data;
  const from = `"BarberBase" <${process.env.EMAIL_USER}>`;
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    throw new Error("Заголовок уведомления обязателен");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`Заголовок не должен превышать ${MAX_TITLE_LENGTH} символов`);
  }
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Описание не должно превышать ${MAX_DESCRIPTION_LENGTH} символов`);
  }
 
  const [user] = await db.select().from(users).where(eq(users.id, to));
  if (!user) throw new Error("Пользователь не найден");
  const safeTitle = title.replace(/[\r\n]/g, " ").trim();
  const safeDescription = description?.replace(/[\r\n]/g, " ").trim() ?? "";
 
  await db.insert(notification).values({
    title: safeTitle,
    description: safeDescription,
    to,
  });
 
  try {
    await transporter.sendMail({
      from: from || "BarberBase",
      to: user.email,
      subject: "Вам пришло новое уведомление",
      text: `${safeTitle}\n\n${safeDescription}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="font-size:17px;font-weight:600;margin:0 0 12px;color:#111">${safeTitle}</h2>
          <p style="font-size:14px;color:#444;line-height:1.6;margin:0">${safeDescription}</p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
          <p style="font-size:12px;color:#999;margin:0">BarberBase</p>
        </div>
      `,
    });
  } catch (emailError) {
    console.error("Ошибка отправки email уведомления:", emailError);
  }
};
 
module.exports = { sendNotificationService };