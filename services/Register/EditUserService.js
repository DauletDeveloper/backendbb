const { db } = require('../../db');
const { users } = require('../schema');
const { eq } = require('drizzle-orm');
const bcrypt = require('bcrypt');
const { sendVerificationEmail } = require('./MailService');

const MIN_PASSWORD_LENGTH = 8;
 
const EditUserService = async (req) => {
  const userId = req.userId;
  const { name, mobileNumber, password, newPassword } = req.body;
 
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error('Пользователь не найден');
 
  const updateData = {};
 
  if (name !== undefined) {
    if (name.trim().length < 2) throw new Error('Имя слишком короткое');
    updateData.name = name.trim();
  }
 
  if (mobileNumber !== undefined) {
    updateData.mobileNumber = mobileNumber;
  }
 
  if (newPassword !== undefined) {
    if (!password) throw new Error('Введите текущий пароль');
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error('Неверный текущий пароль');
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Минимум ${MIN_PASSWORD_LENGTH} символов`);
    }
    if (/\s/.test(newPassword)) throw new Error('Пробелы запрещены');
    if (/[^\x00-\x7F]/.test(newPassword)) throw new Error('Только латиница');
 
    updateData.password = await bcrypt.hash(newPassword, 10);
  }
 
  if (Object.keys(updateData).length === 0) throw new Error('Нечего обновлять');
 
  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning();
 
  return updated;
};
 
const EditEmailService = async (req) => {
  const userId = req.userId;
  const { email } = req.body;
 
  if (!email) throw new Error('Email обязателен');
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  if (!emailValid) throw new Error('Невалидный email');
 
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim()));
  if (existing) throw new Error('Email уже занят');
 
  await db
    .update(users)
    .set({ email: email.trim(), isVerified: false })
    .where(eq(users.id, userId));
  await sendVerificationEmail(email.trim(), userId);
};
 
const EditPayoutMethodService = async (req) => {
  const userId = req.userId;
  const { payoutMethod } = req.body;
 
  if (!payoutMethod || !payoutMethod.trim()) throw new Error('Способ выплаты обязателен');
 
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error('Пользователь не найден');
 
  const [updated] = await db
    .update(users)
    .set({ payoutMethod: payoutMethod.trim() })
    .where(eq(users.id, userId))
    .returning();
 
  return updated;
};
 
module.exports = { EditUserService, EditEmailService, EditPayoutMethodService };