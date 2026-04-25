import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IRoadmapChatAttachment {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  subjectId: mongoose.Types.ObjectId;
  nodeId: string;
  mimeType: string;
  sizeBytes: number;
  /** Относительный путь от process.cwd() */
  storageRelativePath: string;
  originalName: string;
  createdAt?: Date;
}

type Doc = Document & IRoadmapChatAttachment;

const RoadmapChatAttachmentSchema = new Schema<Doc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    nodeId: { type: String, required: true, trim: true, index: true },
    mimeType: { type: String, required: true, trim: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    storageRelativePath: { type: String, required: true, trim: true },
    originalName: { type: String, required: true, trim: true, maxlength: 512 }
  },
  { timestamps: true, collection: 'roadmap_chat_attachments' }
);

RoadmapChatAttachmentSchema.index({ userId: 1, subjectId: 1, nodeId: 1 });

export const RoadmapChatAttachment: Model<Doc> = mongoose.model<Doc>(
  'RoadmapChatAttachment',
  RoadmapChatAttachmentSchema
);
