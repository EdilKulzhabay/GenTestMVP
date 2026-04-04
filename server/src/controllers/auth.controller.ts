import { Request, Response } from 'express';
import { User, PendingRegistration } from '../models';
import { IVerifyPhoneDTO, ILoginDTO, IAuthResponse, UserRole } from '../types';
import { generateToken, success, AppError } from '../utils';
import { sendVerificationCodeToPhone } from '../services/messaging.service';

class AuthController {
  private setAuthCookie(req: Request, res: Response, token: string): void {
    const origin = req.headers.origin || '';
    const host = req.get('host') || '';
    const isCrossOrigin = !!origin && !origin.includes(host);

    const secure = req.secure
      || req.headers['x-forwarded-proto'] === 'https'
      || process.env.NODE_ENV === 'production';

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: isCrossOrigin ? 'none' : 'lax',
      secure: isCrossOrigin ? true : secure,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
  }

  private buildAuthResponse(user: any): IAuthResponse {
    const token = generateToken({ userId: user._id!.toString(), role: user.role });
    return {
      token,
      user: {
        id: user._id!.toString(),
        fullName: user.fullName,
        userName: user.userName,
        email: user.email,
        role: user.role
      }
    };
  }

  /** POST /auth/request-otp — отправка кода на телефон (WhatsApp → Telegram) */
  async requestOtp(req: Request, res: Response): Promise<void> {
    const { phone } = req.body;
    const phoneTrimmed = (phone || '').replace(/\D/g, '').trim() || (phone || '').trim();

    if (!phoneTrimmed || phoneTrimmed.length < 10) {
      throw AppError.badRequest('Введите номер телефона');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await PendingRegistration.findOneAndUpdate(
      { phone: phoneTrimmed },
      { phone: phoneTrimmed, verificationCode: code, verificationCodeExpires: expires },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const result = await sendVerificationCodeToPhone(phoneTrimmed, code);
    const channelMsg = result.channel === 'telegram' ? 'Telegram' : result.channel === 'whatsapp' ? 'WhatsApp' : 'сообщение';
    const data: { channel?: string; botLink?: string } = { channel: result.channel };
    if (result.botLink) data.botLink = result.botLink;
    success(res, data, result.sent ? `Код отправлен в ${channelMsg}` : 'Используйте ссылку на бота для получения кода');
  }

  /** POST /auth/verify-phone — подтверждение кода и вход */
  async verifyPhone(req: Request, res: Response): Promise<void> {
    const { phone, code }: IVerifyPhoneDTO = req.body;
    const phoneTrimmed = phone.replace(/\D/g, '').trim() || phone.trim();

    const pending = await PendingRegistration.findOne({
      $or: [{ phone: phoneTrimmed }, { phone: phone }]
    });
    if (!pending) throw AppError.badRequest('Неверный или просроченный код');
    if (pending.verificationCode !== code.trim()) throw AppError.badRequest('Неверный код');
    if (new Date() > pending.verificationCodeExpires) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      throw AppError.badRequest('Код истёк. Запросите новый.');
    }

    let user = await User.findOne({ $or: [{ phone: phoneTrimmed }, { phone: pending.phone }] });

    if (user) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      const response = this.buildAuthResponse(user);
      this.setAuthCookie(req, res, response.token);
      success(res, response, 'Вход выполнен');
      return;
    }

    if (pending.fullName && pending.userName && pending.password) {
      const existing = await User.findOne({
        $or: [{ userName: pending.userName }, { email: pending.email || '' }, { phone: pending.phone }]
      });
      if (existing) {
        await PendingRegistration.deleteOne({ _id: pending._id });
        throw AppError.badRequest('Пользователь уже существует');
      }
      user = await User.create({
        fullName: pending.fullName,
        userName: pending.userName,
        email: pending.email || undefined,
        phone: pending.phone,
        password: pending.password,
        role: UserRole.USER,
        testHistory: []
      });
    } else {
      const baseName = `user_${phoneTrimmed.slice(-8)}`;
      let userName = baseName;
      let attempts = 0;
      while (await User.findOne({ userName }) && attempts < 10) {
        userName = `${baseName}_${Date.now().toString(36).slice(-4)}`;
        attempts++;
      }
      user = await User.create({
        fullName: 'Пользователь',
        userName,
        phone: pending.phone,
        role: UserRole.USER,
        testHistory: []
      });
    }

    await PendingRegistration.deleteOne({ _id: pending._id });
    const response = this.buildAuthResponse(user);
    this.setAuthCookie(req, res, response.token);
    success(res, response, 'Вход выполнен', 201);
  }

  /** POST /auth/login — оставлен для совместимости (create-admin) */
  async login(req: Request, res: Response): Promise<void> {
    const { userName, password }: ILoginDTO = req.body;

    const user = await User.findOne({ userName: userName.toLowerCase() }).select('+password');
    if (!user) throw AppError.unauthorized('Invalid credentials');
    if (!user.password) throw AppError.unauthorized('Please use Google to sign in');

    const valid = await user.comparePassword(password);
    if (!valid) throw AppError.unauthorized('Invalid credentials');

    const response = this.buildAuthResponse(user);
    this.setAuthCookie(req, res, response.token);
    success(res, response, 'Login successful');
  }

  /** POST /auth/login/admin — только для роли admin (отдельная форма входа) */
  async loginAdmin(req: Request, res: Response): Promise<void> {
    const { userName, password }: ILoginDTO = req.body;

    const user = await User.findOne({ userName: userName.toLowerCase() }).select('+password');
    if (!user) throw AppError.unauthorized('Неверный логин или пароль');
    if (user.role !== UserRole.ADMIN) {
      throw AppError.forbidden('Доступ только для администраторов');
    }
    if (!user.password) throw AppError.unauthorized('Учётная запись без пароля. Создайте администратора через create-admin.');

    const valid = await user.comparePassword(password);
    if (!valid) throw AppError.unauthorized('Неверный логин или пароль');

    const response = this.buildAuthResponse(user);
    this.setAuthCookie(req, res, response.token);
    success(res, response, 'Вход выполнен');
  }

  /** GET /auth/google/callback — callback после Google OAuth */
  async googleCallback(req: Request, res: Response): Promise<void> {
    const user = req.user as any;
    if (!user) throw AppError.unauthorized('Google authentication failed');

    const response = this.buildAuthResponse(user);
    this.setAuthCookie(req, res, response.token);

    const frontendUrl = (req as any)._oauthFrontendOrigin
      || process.env.FRONTEND_URL
      || 'http://localhost:5173';

    if (user.role === UserRole.ADMIN) {
      res.redirect(`${frontendUrl}/admin`);
    } else {
      res.redirect(`${frontendUrl}/user`);
    }
  }

  /** POST /auth/create-admin */
  async createAdmin(req: Request, res: Response): Promise<void> {
    const { fullName, userName, password } = req.body;
    const userNameLower = userName.toLowerCase().trim();

    const existing = await User.findOne({ userName: userNameLower });
    if (existing) throw AppError.badRequest('User with this userName already exists');

    const user = await User.create({
      fullName,
      userName: userNameLower,
      password,
      role: UserRole.ADMIN,
      testHistory: []
    });

    const response = this.buildAuthResponse(user);
    this.setAuthCookie(req, res, response.token);
    success(res, response, 'Admin created successfully', 201);
  }

  /** GET /auth/me */
  async getMe(req: Request, res: Response): Promise<void> {
    if (!req.user) throw AppError.unauthorized('Not authenticated');

    const userId = (req as any).user?.userId;
    const user = await User.findById(userId).select('-password');
    if (!user) throw AppError.notFound('User not found');

    success(res, user);
  }
}

export const authController = new AuthController();
