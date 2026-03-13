import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Связь номера телефона с Telegram chat_id.
 * Пользователь пишет боту /start +79001234567, мы сохраняем chat_id.
 * При отправке кода — fallback на Telegram, если WhatsApp не сработал.
 */
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
// phone уже имеет unique: true — индекс создаётся автоматически

export const TelegramPhoneLink: Model<ITelegramPhoneLinkDocument> = mongoose.model<
  ITelegramPhoneLinkDocument
>('TelegramPhoneLink', TelegramPhoneLinkSchema);
