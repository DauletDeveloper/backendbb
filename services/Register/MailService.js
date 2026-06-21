const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",  
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});


const sendVerificationEmail = async (email, userId) => {
  const mailOptions = {
    from: `"BarberBase" <${process.env.EMAIL_USER}>`, 
    to: email,
    subject: "Подтвердите ваш email в BarberBase", 
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Geist', 'Inter', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="460" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; border:1px solid #e4e4e7; overflow:hidden;">
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #f4f4f5;">
              <table cellpadding="0" cellspacing="0">
                <tr> 
                  <td style="padding-left:8px; font-size:15px; font-weight:500; color:#09090b; vertical-align:middle; letter-spacing:-0.01em;">BarberBase</td>
                </tr>
              </table>
              <p style="margin:12px 0 0; font-size:11px; color:#a1a1aa; letter-spacing:0.06em; text-transform:uppercase;">Подтверждение почты</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 32px 32px;">
              <div style="width:48px; height:48px; border-radius:50%; border:1px solid #e4e4e7; display:inline-flex; align-items:center; justify-content:center; margin-bottom:20px; text-align:center; line-height:48px; font-size:20px;">✉</div>
              <h1 style="margin:0 0 6px; font-size:18px; font-weight:600; color:#09090b; letter-spacing:-0.02em;">Подтвердите ваш email</h1>
              <p style="margin:0 0 24px; font-size:13px; color:#71717a; line-height:1.6;">
                Нажмите кнопку ниже, чтобы подтвердить адрес электронной почты и завершить регистрацию в BarberBase.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#09090b; border-radius:8px;">
                    <a href="${process.env.CLIENT_URL}/verify/${userId}"
                       target="_blank"
                       style="display:inline-block; padding:9px 20px; color:#ffffff; font-size:13px; font-weight:500; text-decoration:none; letter-spacing:-0.01em;">
                      Подтвердить email
                    </a>
                  </td>
                </tr>
              </table>
              <div style="height:1px; background:#f4f4f5; margin:0 0 20px;"></div>
              <p style="margin:0 0 8px; font-size:12px; color:#71717a;">Ссылка действительна 5 минут</p>
              <p style="margin:0 0 20px; font-size:12px; color:#71717a;">Если вы не регистрировались, просто проигнорируйте это письмо</p>

              <p style="margin:0; font-size:11px; color:#d4d4d8;">© 2026 BarberBase · Все права защищены</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`};
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email успешно отправлен:", info.messageId);
    return info;
  } catch (error) {
    console.error("Ошибка при отправке верификационного Email:", error);
    throw error; 
  }
};
const sendVerificationCode = async (email, userCode) => {
  const mailOptions = {
    from: `"BarberBase" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Код подтверждения email — BarberBase",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Geist', 'Inter', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="460" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; border:1px solid #e4e4e7; overflow:hidden;">
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #f4f4f5;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-left:8px; font-size:15px; font-weight:500; color:#09090b; vertical-align:middle; letter-spacing:-0.01em;">BarberBase</td>
                </tr>
              </table>
              <p style="margin:12px 0 0; font-size:11px; color:#a1a1aa; letter-spacing:0.06em; text-transform:uppercase;">Подтверждение почты</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 32px 32px;">
              <div style="width:48px; height:48px; border-radius:50%; border:1px solid #e4e4e7; display:inline-flex; align-items:center; justify-content:center; margin-bottom:20px; text-align:center; line-height:48px; font-size:20px;">✉</div>
              <h1 style="margin:0 0 6px; font-size:18px; font-weight:600; color:#09090b; letter-spacing:-0.02em;">Подтвердите ваш email</h1>
              <p style="margin:0 0 24px; font-size:13px; color:#71717a; line-height:1.6;">
                Введите код ниже в приложении, чтобы подтвердить адрес электронной почты.
              </p>
              <div style="background:#f4f4f5; border-radius:8px; padding:16px 24px; margin-bottom:24px; text-align:center;">
                <span style="font-size:28px; font-weight:600; color:#09090b; letter-spacing:0.15em; font-family: monospace;">${userCode}</span>
              </div>
              <div style="height:1px; background:#f4f4f5; margin:0 0 20px;"></div>
              <p style="margin:0 0 8px; font-size:12px; color:#71717a;">Код действителен 5 минут</p>
              <p style="margin:0 0 20px; font-size:12px; color:#71717a;">Если вы не запрашивали смену email, просто проигнорируйте это письмо</p>
              <p style="margin:0; font-size:11px; color:#d4d4d8;">© 2026 BarberBase · Все права защищены</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Код отправлен:", info.messageId);
    return info;
  } catch (error) {
    console.error("Ошибка при отправке кода:", error);
    throw error;
  }
};

module.exports = { sendVerificationEmail, sendVerificationCode };

