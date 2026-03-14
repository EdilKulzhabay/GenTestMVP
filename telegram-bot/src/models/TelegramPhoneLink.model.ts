import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITelegramPhoneLink {
  phone: string;
  chatId: number;
  createdAt?: Date;
}

type ITelegramPhoneLinkDocument = Document & ITelegramPhoneLink;

const TelegramPhoneLinkSchema = new Schema<ITelegramPhoneLinkDocument>(
  {
    phone: { type: String, required: true, trim: true, unique: true },
    chatId: { type: Number, required: true }
  },
  { timestamps: true, collection: 'telegram_phone_links' }
);

export const TelegramPhoneLink: Model<ITelegramPhoneLinkDocument> = mongoose.model<
  ITelegramPhoneLinkDocument
>('TelegramPhoneLink', TelegramPhoneLinkSchema);
