import fs from 'fs/promises';
import path from 'path';
import { NextFunction, Request } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';

export const ROADMAP_CHAT_MAX_BYTES = 5 * 1024 * 1024;

export const ROADMAP_CHAT_UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'roadmap-chat');

export function assignRoadmapAttachmentId(req: Request, _res: unknown, next: NextFunction): void {
  (req as unknown as { roadmapAttachmentId?: mongoose.Types.ObjectId }).roadmapAttachmentId =
    new mongoose.Types.ObjectId();
  next();
}

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    try {
      const userId = (req as unknown as { user?: { userId?: string } }).user?.userId;
      const nodeId = req.params.nodeId;
      if (!userId || !nodeId) {
        cb(new Error('Missing user or nodeId'), '');
        return;
      }
      const dir = path.join(ROADMAP_CHAT_UPLOAD_ROOT, userId, nodeId);
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    } catch (e) {
      cb(e as Error, '');
    }
  },
  filename: (req, file, cb) => {
    const id = (req as unknown as { roadmapAttachmentId?: mongoose.Types.ObjectId }).roadmapAttachmentId;
    if (!id) {
      cb(new Error('Attachment id not assigned'), '');
      return;
    }
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${id.toString()}${ext}`);
  }
});

function roadmapChatFileFilter(
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

export const roadmapChatUpload = multer({
  storage,
  limits: { fileSize: ROADMAP_CHAT_MAX_BYTES },
  fileFilter: roadmapChatFileFilter
});
