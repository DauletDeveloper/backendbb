const { db } = require('../../db');
const { users } = require('../schema');
const { eq } = require('drizzle-orm');
const bcrypt = require('bcrypt');
const tokenService = require('./TokenService');
 
const LoginService = async (email, password) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email));
  const DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012';
  const isPasswordValid = await bcrypt.compare(
    password,
    user?.password ?? DUMMY_HASH
  );
 
  if (!user || !isPasswordValid) {
    throw new Error('Неверный email или пароль');
  }
 
  if (!user.isVerified) {
    throw new Error('Аккаунт не активирован');
  }

  const tokens = tokenService.generateToken({
    id: user.id,
    email: user.email,
    role: user.role,
  });
  await tokenService.saveToken(user.id, tokens.refreshToken);
 
  const { password: _, ...userWithoutPassword } = user;
  return { user: userWithoutPassword, ...tokens };
};
 
module.exports = { LoginService };