const { db } = require('../../db');
const { register, barber: barberProfile } = require('../schema');
const nodemailer = require('nodemailer');
const { eq, sql, and } = require('drizzle-orm');
const { users, barbershop } = require('../schema');

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const RegisterShopService = async (req) => {
  const { 
    barberId, 
    date, 
    time: appointmentTime, 
    masterId, 
    service: serviceName,   
    guestEmail, 
    guestName 
  } = req.body;

  const userId = req.userId;
  const isGuest = userId === null;

  if (!barberId || !date || !appointmentTime || !serviceName)
    throw new Error('барберщоп, дата, время записи, сервис обязательны');
  if (!masterId) throw new Error("Выберите мастера");

  const [{ now }] = await db.execute(sql`SELECT NOW() AT TIME ZONE 'Asia/Almaty' AS now`);
  const nowKZ = new Date(now);
  const [hours, minutes] = appointmentTime.split(':').map(Number);
  const appointmentDate = new Date(date);
  appointmentDate.setHours(hours, minutes, 0, 0);
  const minBookingTime = new Date(nowKZ.getTime() + 30 * 60 * 1000);
  if (appointmentDate <= nowKZ) throw new Error('Нельзя записаться на прошедшее время');
  if (appointmentDate <= minBookingTime) throw new Error('Запись возможна минимум за 30 минут до начала');
  const maxDate = new Date(nowKZ);
  maxDate.setDate(maxDate.getDate() + 3);
  maxDate.setHours(23, 59, 59, 999);
  if (appointmentDate > maxDate) throw new Error('Нельзя записаться более чем на 3 дня вперёд');

  const [barber] = await db.select().from(barbershop).where(eq(barbershop.id, barberId));
  if (!barber) throw new Error('Барбершоп не найден');
  if (!barber.isVerified) throw new Error('Барбершоп временно недоступен');

  const [user] = isGuest
    ? [null]
    : await db.select().from(users).where(eq(users.id, userId));

  const clientEmail = user?.email ?? guestEmail;
  const clientName = user?.name ?? guestName ?? "Гость";

  if (!clientEmail) throw new Error('Укажите email для подтверждения');

  const [owner] = await db.select().from(users).where(eq(users.id, barber.ownerId));
  if (!owner) throw new Error('Владелец барбершопа не найден');

  const masterIdNum = Number(masterId);
  if (!masterIdNum) throw new Error("Некорректный ID мастера");

  const [master] = await db
    .select()
    .from(barberProfile)
    .where(and(eq(barberProfile.id, masterIdNum), eq(barberProfile.barberId, barberId)));
  if (!master) throw new Error('Барбер не найден в этом магазине');
  const masterName = master.name;

  await db.update(barbershop)
    .set({ totalClients: (barber.totalClients ?? 0) + 1 })
    .where(eq(barbershop.id, barberId));

  const timeValue = appointmentTime.length === 5 ? `${appointmentTime}:00` : appointmentTime;

  const [newRegister] = await db
    .insert(register)
    .values({ 
      userId: isGuest ? null : userId, 
      barberId, 
      date: new Date(date), 
      time: timeValue,        
      registerTo: masterIdNum, 
      service: serviceName,   
    })
    .returning();
  const barberPhone = barber.phone;
  const masterLine = masterName ? `<tr style="border-top:1px solid #27272a;">
    <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Мастер</td>
    <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${masterName}</td>
  </tr>` : '';

  const mapBlock = barber.lat && barber.lng ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding-right:6px;width:50%;">
          <a href="https://maps.google.com/maps?q=${barber.lat},${barber.lng}" target="_blank"
            style="display:block;background:#ffffff;border-radius:10px;padding:14px 12px;text-decoration:none;text-align:center;">
            <span style="font-size:13px;font-weight:600;color:#09090b;">Google Maps</span>
          </a>
        </td>
        <td style="padding-left:6px;width:50%;">
          <a href="https://2gis.ru/geo/${barber.lng},${barber.lat}" target="_blank"
            style="display:block;background:#16a34a;border-radius:10px;padding:14px 12px;text-decoration:none;text-align:center;">
            <span style="font-size:13px;font-weight:600;color:#ffffff;">2ГИС</span>
          </a>
        </td>
      </tr>
    </table>` : '';

  const clientHtml = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#fafafa;border-radius:12px;overflow:hidden;">
      <div style="background:#18181b;padding:28px 32px;border-bottom:1px solid #27272a;">
        <h1 style="margin:0;font-size:20px;color:#fafafa;">BarberBase</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#71717a;">Подтверждение записи</p>
      </div>
      <div style="padding:28px 32px;">
        <p style="font-size:15px;color:#a1a1aa;margin:0 0 24px;">Вы успешно записаны! Ждём вас 🎉</p>
        <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:20px;margin-bottom:20px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Барбершоп</td>
              <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${barber.name}</td>
            </tr>
            ${masterLine}
            <tr style="border-top:1px solid #27272a;">
              <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Дата</td>
              <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${date}</td>
            </tr>
               <tr style="border-top:1px solid #27272a;">
              <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Номер телефона</td>
              <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${barberphone ? barberphone : "Отсуствует"}</td>
            </tr>
            <tr style="border-top:1px solid #27272a;">
              <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Время</td>
              <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${appointmentTime}</td>
            </tr>
            <tr style="border-top:1px solid #27272a;">
              <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Адрес</td>
              <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${barber.location ?? '—'}</td>
            </tr>
          </table>
        </div>
        ${mapBlock}
        <p style="font-size:12px;color:#52525b;margin:24px 0 0;text-align:center;">Если вы не записывались проигнорируйте это письмо.</p>
      </div>
    </div>`;

  const ownerHtml = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#fafafa;border-radius:12px;overflow:hidden;">
      <div style="background:#18181b;padding:28px 32px;border-bottom:1px solid #27272a;">
        <h1 style="margin:0;font-size:20px;color:#fafafa;">BarberBase</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#71717a;">Новая запись к вам</p>
      </div>
      <div style="padding:28px 32px;">
        <p style="font-size:15px;color:#a1a1aa;margin:0 0 24px;">К вам записался новый клиент 💈</p>
        <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:20px;margin-bottom:12px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Клиент</td>
              <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${clientName}</td>
            </tr>
            ${masterLine}
            <tr style="border-top:1px solid #27272a;">
              <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Дата</td>
              <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${date}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Номер телефона</td>
              <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${user?.mobileNumber ?? 'Не указано'}</td>
            </tr>
            <tr style="border-top:1px solid #27272a;">
              <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Время</td>
              <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${appointmentTime}</td>
            </tr>
          </table>
        </div>
      </div>
    </div>`;
  await Promise.all([
    transporter.sendMail({
      from: `"BarberBase" <${process.env.EMAIL_USER}>`,
      to: clientEmail,
      subject: `Запись в ${barber.name} на ${appointmentTime}`,
      html: clientHtml,
    }),
    transporter.sendMail({
      from: `"BarberBase" <${process.env.EMAIL_USER}>`,
      to: owner.email,
      subject: `Новая запись в ${barber.name} на ${appointmentTime}`,
      html: ownerHtml,
    }),
  ]);

  return { ...newRegister, masterName };
};

module.exports = { RegisterShopService };
