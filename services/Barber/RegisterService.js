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
const normalizePhone = (phone) => {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return '+7' + digits.slice(1);
  }

  return null;
};

const RegisterShopService = async (req) => {
  const { 
    barberId, 
    date, 
    time: appointmentTime, 
    masterId, 
    service: serviceName,   
    guestPhone, 
    guestName 
  } = req.body;

  const userId = req.userId ?? null;
  const isGuest = userId === null;
  if (!barberId || !date || !appointmentTime || !serviceName)
    throw new Error('Барбершоп, дата, время записи и сервис обязательны');
  if (!masterId) throw new Error('Выберите мастера');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error('Некорректный формат даты');
  if (!/^\d{2}:\d{2}$/.test(appointmentTime))
    throw new Error('Некорректный формат времени');

  const [{ now }] = await db.execute(sql`SELECT NOW() AT TIME ZONE 'Asia/Almaty' AS now`);
  const nowKZ = new Date(now);

  const [hours, minutes] = appointmentTime.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59)
    throw new Error('Некорректное время');

  const appointmentDate = new Date(date);
  if (isNaN(appointmentDate.getTime())) throw new Error('Некорректная дата');
  appointmentDate.setHours(hours, minutes, 0, 0);

  if (appointmentDate <= nowKZ)
    throw new Error('Нельзя записаться на прошедшее время');
  if (appointmentDate <= new Date(nowKZ.getTime() + 30 * 60 * 1000))
    throw new Error('Запись возможна минимум за 30 минут до начала');

  const maxDate = new Date(nowKZ);
  maxDate.setDate(maxDate.getDate() + 3);
  maxDate.setHours(23, 59, 59, 999);
  if (appointmentDate > maxDate)
    throw new Error('Нельзя записаться более чем на 3 дня вперёд');
  const [barber] = await db.select().from(barbershop).where(eq(barbershop.id, barberId));
  if (!barber) throw new Error('Барбершоп не найден');
  if (!barber.isVerified) throw new Error('Барбершоп временно недоступен');
  let clientPhone = null;
  let clientName = 'Гость';

  if (!isGuest) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new Error('Пользователь не найден');

    clientName = user.name ?? 'Пользователь';
    clientPhone = normalizePhone(user.phone ?? user.mobileNumber);

    if (!clientPhone)
      throw new Error(
        'Добавьте корректный номер телефона в профиле (формат: +7XXXXXXXXXX или 8XXXXXXXXXX)'
      );
  } else {
    clientName = guestName?.trim() || 'Гость';
    clientPhone = normalizePhone(guestPhone);

    if (!clientPhone)
      throw new Error(
        'Укажите корректный номер телефона (формат: +7XXXXXXXXXX или 8XXXXXXXXXX)'
      );
  }

  
  const [owner] = await db.select().from(users).where(eq(users.id, barber.ownerId));
  if (!owner) throw new Error('Владелец барбершопа не найден');
  if (!owner.email) throw new Error('Email владельца барбершопа не найден');


  const masterIdNum = Number(masterId);
  if (!Number.isInteger(masterIdNum) || masterIdNum <= 0)
    throw new Error('Некорректный ID мастера');

  const [master] = await db
    .select()
    .from(barberProfile)
    .where(and(eq(barberProfile.id, masterIdNum), eq(barberProfile.barberId, barberId)));
  if (!master) throw new Error('Барбер не найден в этом магазине');

  const masterName = master.name;


  const timeValue = appointmentTime.length === 5 ? `${appointmentTime}:00` : appointmentTime;


  const [newRegister] = await db.transaction(async (tx) => {
    await tx
      .update(barbershop)
      .set({ totalClients: (barber.totalClients ?? 0) + 1 })
      .where(eq(barbershop.id, barberId));

    return tx
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
  });


  const masterLine = masterName
    ? `<tr style="border-top:1px solid #27272a;">
        <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Мастер</td>
        <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${masterName}</td>
      </tr>`
    : '';

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
            <tr style="border-top:1px solid #27272a;">
              <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Номер телефона</td>
              <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${clientPhone}</td>
            </tr>
            ${masterLine}
            <tr style="border-top:1px solid #27272a;">
              <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Дата</td>
              <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${date}</td>
            </tr>
            <tr style="border-top:1px solid #27272a;">
              <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Время</td>
              <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${appointmentTime}</td>
            </tr>
            <tr style="border-top:1px solid #27272a;">
              <td style="padding:8px 0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">Услуга</td>
              <td style="padding:8px 0;font-size:14px;color:#fafafa;font-weight:600;text-align:right;">${serviceName}</td>
            </tr>
          </table>
        </div>
      </div>
    </div>`;

  await transporter.sendMail({
    from: `"BarberBase" <${process.env.EMAIL_USER}>`,
    to: owner.email,
    subject: `Новая запись в ${barber.name} на ${appointmentTime}`,
    html: ownerHtml,
  });

  return { ...newRegister, masterName };
};

module.exports = { RegisterShopService };

module.exports = { RegisterShopService };
