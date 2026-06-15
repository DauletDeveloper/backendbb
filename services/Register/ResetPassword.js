const { db } = require("../../db");
const { users } = require("../schema.js");
const { eq } = require("drizzle-orm");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const tokenService = require("./TokenService.js");
 
const SALT_ROUNDS = 10;
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_DELAY_MS = 1 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;
 
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
 
async function sendOtpEmail(to, code) {
  await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || "Support"}" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Код для сброса пароля",
    text: `Ваш код: ${code}\n\nКод действителен 10 минут.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Сброс пароля</h2>
        <p>Ваш одноразовый код:</p>
        <div style="
          font-size:36px;
          font-weight:bold;
          letter-spacing:8px;
          padding:16px 24px;
          background:#f4f4f4;
          border-radius:8px;
          display:inline-block;
        ">
          ${code}
        </div>
        <p style="color:#888;font-size:13px;margin-top:16px">
          Код действителен 10 минут.
        </p>
      </div>
    `,
  });
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
 
function parseUserCode(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
 
async function getUserByEmail(email) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
 
  return user;
}
 
async function newCodeGenerationService(email) {
  const user = await getUserByEmail(email);
  if (!user) {
    return {
      success: true,
      message: "Если аккаунт существует, OTP отправлен",
    };
  }
 
  if (user.userCode) {
    const prev = parseUserCode(user.userCode);
 
    if (prev) {
      const retryAfterMs =
        RESEND_DELAY_MS - (Date.now() - (prev.exp - OTP_TTL_MS));
 
      if (retryAfterMs > 0) {
        return {
          success: false,
          message: "Подождите перед повторным запросом",
          retryAfterMs,
        };
      }
    }
  }
 
  const code = generateOtp(); 
 
  await db
    .update(users)
    .set({
      userCode: JSON.stringify({
        code,
        exp: Date.now() + OTP_TTL_MS,
      }),
    })
    .where(eq(users.id, user.id));
 
  await sendOtpEmail(email, code);
 
  return {
    success: true,
    message: "Если аккаунт существует, OTP отправлен",
  };
}
 
async function checkCodeService(email, otp) {
  if (!otp) {
    return {
      success: false,
      message: "Введите OTP код",
    };
  }
 
  const user = await getUserByEmail(email);
 
  if (!user) {
    return {
      success: false,
      message: "Неверный или истёкший OTP код", 
    };
  }
 
  const parsed = parseUserCode(user.userCode);
 
  if (!parsed) {
    return {
      success: false,
      message: "Неверный или истёкший OTP код",
    };
  }

  if (Date.now() > parsed.exp) {
    return {
      success: false,
      message: "OTP код истек",
    };
  }

  if (!safeEqual(parsed.code, otp)) {
    return {
      success: false,
      message: "Неверный OTP код",
    };
  }
 
  return {
    success: true,
    message: "OTP подтвержден",
  };
}
 
async function resetPasswordService(email, otp, newPassword) {
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      success: false,
      message: `Пароль должен содержать минимум ${MIN_PASSWORD_LENGTH} символов`,
    };
  }
 
  const user = await getUserByEmail(email);
 
  if (!user) {
    return {
      success: false,
      message: "Неверный или истёкший OTP код", 
    };
  }
 
  const check = await checkCodeService(email, otp);
 
  if (!check.success) {
    return check;
  }
 
  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
 
  await db
    .update(users)
    .set({
      password: hashedPassword,
      userCode: null,
    })
    .where(eq(users.id, user.id));
 
  const tokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role, 
  };
 
  const { accessToken, refreshToken } =
    tokenService.generateToken(tokenPayload);
 
  await tokenService.saveToken(user.id, refreshToken);
 
  return {
    success: true,
    message: "Пароль успешно изменен",
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}
 
module.exports = {
  newCodeGenerationService,
  checkCodeService,
  resetPasswordService,
};