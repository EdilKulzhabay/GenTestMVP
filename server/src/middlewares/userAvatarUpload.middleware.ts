import fs from 'fs/promises';
import path from 'path';
import { Request } from 'express';
import multer from 'multer';

/**
 * Загрузка аватарки пользователя.
 * Зеркалит roadmapChatUpload: multer diskStorage в uploads/avatars/<userId>/,
 * только изображения, лимит 5MB. Файл отдаётся статикой через app.use('/uploads', ...).
 */
export const USER_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export const USER_AVATAR_UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'avatars');

/** Публичный URL аватарки по userId и имени файла (как отдаётся express.static). */
export function buildAvatarUrl(userId: string, filename: string): string {
  return `/uploads/avatars/${userId}/${filename}`;
}

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    try {
      const userId = (req as unknown as { user?: { userId?: string } }).user?.userId;
      if (!userId) {
        cb(new Error('Missing user'), '');
        return;
      }
      const dir = path.join(USER_AVATAR_UPLOAD_ROOT, userId);
      // Аватарка одна — чистим папку, чтобы старые файлы не копились
      await fs.rm(dir, { recursive: true, force: true });
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    } catch (e) {
      cb(e as Error, '');
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `avatar${ext}`);
  }
});

function avatarFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
  if (!ok) {
    cb(new Error('Only image/jpeg, image/png, image/webp, image/gif are allowed'));
    return;
  }
  cb(null, true);
}

export const userAvatarUpload = multer({
  storage,
  limits: { fileSize: USER_AVATAR_MAX_BYTES },
  fileFilter: avatarFileFilter
});
