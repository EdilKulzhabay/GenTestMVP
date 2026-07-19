import fs from 'fs/promises';
import path from 'path';
import { NextFunction, Request } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';

export const ASSET_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export const ASSET_UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'subject-assets');

/** Директория загрузок предмета (для очистки при удалении предмета). */
export function assetSubjectDir(subjectId: string): string {
  return path.join(ASSET_UPLOAD_ROOT, subjectId);
}

/** Диск-путь локального аплоада из URL ассета; null для внешних/некорректных URL. */
export function localDiskPathFromUrl(url: string): string | null {
  const marker = '/uploads/subject-assets/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const rel = url.slice(idx + marker.length);
  if (!rel || rel.includes('..') || rel.includes('\0')) return null;
  return path.join(ASSET_UPLOAD_ROOT, rel);
}

/** Пре-минтит ObjectId для имени файла (стабильное имя, не зависит от originalname). */
export function assignAssetFileId(req: Request, _res: unknown, next: NextFunction): void {
  (req as unknown as { assetFileId?: mongoose.Types.ObjectId }).assetFileId =
    new mongoose.Types.ObjectId();
  next();
}

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    try {
      const subjectId = req.params.subjectId;
      if (!subjectId) {
        cb(new Error('Missing subjectId'), '');
        return;
      }
      const dir = path.join(ASSET_UPLOAD_ROOT, subjectId);
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    } catch (e) {
      cb(e as Error, '');
    }
  },
  filename: (req, file, cb) => {
    const id = (req as unknown as { assetFileId?: mongoose.Types.ObjectId }).assetFileId;
    if (!id) {
      cb(new Error('Asset file id not assigned'), '');
      return;
    }
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${id.toString()}${ext}`);
  },
});

function assetFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'].includes(
    file.mimetype
  );
  if (!ok) {
    cb(new Error('Only image/jpeg, image/png, image/webp, image/gif, image/svg+xml are allowed'));
    return;
  }
  cb(null, true);
}

export const assetUpload = multer({
  storage,
  limits: { fileSize: ASSET_UPLOAD_MAX_BYTES },
  fileFilter: assetFileFilter,
});
