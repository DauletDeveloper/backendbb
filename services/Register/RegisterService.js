const { users } = require("../schema");
const { eq } = require("drizzle-orm");
const { db } = require("../../db.js");
const bcrypt = require("bcrypt");
const { sendVerificationEmail } = require("./MailService");
const tokenService = require("./TokenService");
 
const RegisterService = async (name, email, password) => {
  const hashedPassword = await bcrypt.hash(password, 10);
  const [existingVerified] = await db
    .select({ id: users.id, isVerified: users.isVerified })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
 
  if (existingVerified?.isVerified === true) {
    throw new Error("Пользователь с таким email уже существует");
  }
  const [newUser] = await db
    .insert(users)
    .values({
      name,
      email,
      password: hashedPassword,
      isVerified: false,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        name,
        password: hashedPassword,
        isVerified: false,
        pendingEmail: null,
        userCode: null
      },
    })
    .returning();
 
  await sendVerificationEmail(email, newUser.id);
 
  const { password: _, ...userWithoutPassword } = newUser;
  return { user: userWithoutPassword };
};
 
module.exports = { RegisterService };