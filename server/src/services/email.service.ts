/**
 * Email service для отправки писем (коды верификации и т.д.)
 * В dev без SMTP — код выводится в консоль
 */

export async function sendVerificationCode(email: string, code: string): Promise<void> {
  const subject = 'Код подтверждения регистрации';
  const body = `Ваш код подтверждения: ${code}\n\nКод действителен 15 минут.`;

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined
    });

    if (process.env.SMTP_USER) {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject,
        text: body
      });
      return;
    }
  } catch (error) {
    console.log(`[EMAIL] Error sending verification code to ${email}: ${error as string}`);
    // nodemailer не установлен или SMTP не настроен
  }

  console.log(`[EMAIL] Код для ${email}: ${code}`);
}
