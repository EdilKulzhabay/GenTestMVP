import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPendingRegistration {
  email: string;
  phone: string;
  fullName: string;
  userName: string;
  password: string;
  verificationCode: string;
  verificationCodeExpires: Date;
  telegramToken?: string;
  createdAt?: Date;
}

type IPendingRegistrationDocument = Document & IPendingRegistration;

const PendingRegistrationSchema = new Schema<IPendingRegistrationDocument>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    userName: { type: String, required: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    verificationCode: { type: String, required: true },
    verificationCodeExpires: { type: Date, required: true },
    telegramToken: { type: String, sparse: true }
  },
  { timestamps: true, collection: 'pending_registrations' }
);

PendingRegistrationSchema.index({ phone: 1 });
PendingRegistrationSchema.index({ email: 1 });

export const PendingRegistration: Model<IPendingRegistrationDocument> = mongoose.model<
  IPendingRegistrationDocument
>('PendingRegistration', PendingRegistrationSchema);
