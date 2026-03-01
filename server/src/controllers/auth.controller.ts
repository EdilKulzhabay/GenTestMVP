import { Request, Response } from 'express';
import { User, PendingRegistration } from '../models';
import { IRegisterDTO, IVerifyEmailDTO, ILoginDTO, IAuthResponse, UserRole } from '../types';
import { generateToken, success, AppError } from '../utils';
import { sendVerificationCode } from '../services/email.service';

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
        role: user.role
      }
    };
  }

  /** POST /auth/register — шаг 1: отправка кода на email */
  async register(req: Request, res: Response): Promise<void> {
    const { fullName, email, userName, password }: IRegisterDTO = req.body;
    const emailLower = email.toLowerCase().trim();
    const userNameLower = userName.toLowerCase().trim();

    const existing = await User.findOne({
      $or: [{ userName: userNameLower }, { email: emailLower }]
    });
    if (existing) throw AppError.badRequest('User with this email or userName already exists');

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await PendingRegistration.deleteMany({ email: emailLower });
    await PendingRegistration.create({
      email: emailLower,
      fullName,
      userName: userNameLower,
      password,
      verificationCode: code,
      verificationCodeExpires: expires
    });

    await sendVerificationCode(emailLower, code);
    success(res, undefined, 'Verification code sent to email');
  }

  /** POST /auth/verify-email — шаг 2: подтверждение кода */
  async verifyEmail(req: Request, res: Response): Promise<void> {
    const { email, code }: IVerifyEmailDTO = req.body;
    const emailLower = email.toLowerCase().trim();

    const pending = await PendingRegistration.findOne({ email: emailLower });
    if (!pending) throw AppError.badRequest('Invalid or expired verification code');
    if (pending.verificationCode !== code.trim()) throw AppError.badRequest('Invalid verification code');
    if (new Date() > pending.verificationCodeExpires) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      throw AppError.badRequest('Verification code expired. Please register again.');
    }

    const existing = await User.findOne({
      $or: [{ userName: pending.userName }, { email: pending.email }]
    });
    if (existing) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      throw AppError.badRequest('User already exists');
    }

    const user = await User.create({
      fullName: pending.fullName,
      userName: pending.userName,
      email: pending.email,
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

    const valid = await user.comparePassword(password);
    if (!valid) throw AppError.unauthorized('Invalid credentials');

    const response = this.buildAuthResponse(user);
    this.setAuthCookie(res, response.token);
    success(res, response, 'Login successful');
  }

  /** POST /auth/create-admin — создание админа напрямую (без email-верификации) */
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

    const user = await User.findById(req.user.userId).select('-password');
    if (!user) throw AppError.notFound('User not found');

    success(res, user);
  }
}

export const authController = new AuthController();
