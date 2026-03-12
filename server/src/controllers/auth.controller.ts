import { Request, Response } from 'express';
import { User, PendingRegistration } from '../models';
import { IRegisterDTO, IVerifyPhoneDTO, ILoginDTO, IAuthResponse, UserRole } from '../types';
import { generateToken, success, AppError } from '../utils';
import { sendVerificationCodeToPhone } from '../services/messaging.service';

class AuthController {
  private setAuthCookie(res: Response, token: string): void {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
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

  /** POST /auth/register — шаг 1: отправка кода на телефон (WhatsApp → Telegram) */
  async register(req: Request, res: Response): Promise<void> {
    const { fullName, email, userName, password, phone }: IRegisterDTO = req.body;
    const emailLower = email.toLowerCase().trim();
    const userNameLower = userName.toLowerCase().trim();
    const phoneTrimmed = phone.replace(/\D/g, '').trim() || phone.trim();

    if (!phoneTrimmed) throw AppError.badRequest('Phone number is required');

    const existing = await User.findOne({
      $or: [{ userName: userNameLower }, { email: emailLower }, { phone: phoneTrimmed }]
    });
    if (existing) throw AppError.badRequest('User with this email, userName or phone already exists');

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await PendingRegistration.deleteMany({ $or: [{ email: emailLower }, { phone: phoneTrimmed }] });
    await PendingRegistration.create({
      email: emailLower,
      phone: phoneTrimmed,
      fullName,
      userName: userNameLower,
      password,
      verificationCode: code,
      verificationCodeExpires: expires
    });

    const result = await sendVerificationCodeToPhone(phoneTrimmed, code);
    const channelMsg = result.channel === 'telegram' ? 'Telegram' : result.channel === 'whatsapp' ? 'WhatsApp' : 'сообщение';
    const data: { channel?: string; botLink?: string } = { channel: result.channel };
    if (result.botLink) data.botLink = result.botLink;
    success(res, data, result.sent ? `Verification code sent via ${channelMsg}` : 'Use the bot link to get your code');
  }

  /** POST /auth/verify-phone — шаг 2: подтверждение кода */
  async verifyPhone(req: Request, res: Response): Promise<void> {
    const { phone, code }: IVerifyPhoneDTO = req.body;
    const phoneTrimmed = phone.replace(/\D/g, '').trim() || phone.trim();

    const pending = await PendingRegistration.findOne({
      $or: [{ phone: phoneTrimmed }, { phone: phone }]
    });
    if (!pending) throw AppError.badRequest('Invalid or expired verification code');
    if (pending.verificationCode !== code.trim()) throw AppError.badRequest('Invalid verification code');
    if (new Date() > pending.verificationCodeExpires) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      throw AppError.badRequest('Verification code expired. Please register again.');
    }

    const existing = await User.findOne({
      $or: [{ userName: pending.userName }, { email: pending.email }, { phone: pending.phone }]
    });
    if (existing) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      throw AppError.badRequest('User already exists');
    }

    const user = await User.create({
      fullName: pending.fullName,
      userName: pending.userName,
      email: pending.email,
      phone: pending.phone,
      password: pending.password as string,
      role: UserRole.USER,
      testHistory: []
    });
    await PendingRegistration.deleteOne({ _id: pending._id });

    const response = this.buildAuthResponse(user);
    this.setAuthCookie(res, response.token);
    success(res, response, 'User registered successfully', 201);
  }

  /** POST /auth/login */
  async login(req: Request, res: Response): Promise<void> {
    const { userName, password }: ILoginDTO = req.body;

    const user = await User.findOne({ userName: userName.toLowerCase() }).select('+password');
    if (!user) throw AppError.unauthorized('Invalid credentials');
    if (!user.password) throw AppError.unauthorized('Please use Google to sign in');

    const valid = await user.comparePassword(password);
    if (!valid) throw AppError.unauthorized('Invalid credentials');

    const response = this.buildAuthResponse(user);
    this.setAuthCookie(res, response.token);
    success(res, response, 'Login successful');
  }

  /** GET /auth/google/callback — callback после Google OAuth */
  async googleCallback(req: Request, res: Response): Promise<void> {
    const user = req.user as any;
    if (!user) throw AppError.unauthorized('Google authentication failed');

    const response = this.buildAuthResponse(user);
    this.setAuthCookie(res, response.token);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectUrl = `${frontendUrl}/user`;
    if (user.role === UserRole.ADMIN) {
      res.redirect(`${frontendUrl}/admin`);
    } else {
      res.redirect(redirectUrl);
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
    this.setAuthCookie(res, response.token);
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
