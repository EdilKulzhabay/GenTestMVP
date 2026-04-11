import mongoose, { Schema, Document, Model } from 'mongoose';
import { ICanonicalRoadmap, ICanonicalRoadmapNode, ICanonicalRoadmapSourceMeta } from '../types/roadmap.types';

const SourceMetaSchema = new Schema<ICanonicalRoadmapSourceMeta>(
  {
    bookId: { type: String, trim: true },
    bookTitle: { type: String, trim: true },
    bookAuthor: { type: String, trim: true },
    chapterTitle: { type: String, trim: true },
    fullBook: { type: Boolean },
    contentLanguage: { type: String, trim: true }
  },
  { _id: false }
);

const CanonicalNodeSchema = new Schema<ICanonicalRoadmapNode>(
  {
    nodeId: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 8000 },
    prerequisites: [{ type: String, trim: true }],
    metadata: { type: Schema.Types.Mixed }
  },
  { _id: false }
);

type Doc = Document & Omit<ICanonicalRoadmap, '_id'>;

const CanonicalRoadmapSchema = new Schema<Doc>(
  {
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
      index: true,
      unique: true
    },
    version: { type: Number, required: true, default: 1, min: 1 },
    description: { type: String, trim: true, maxlength: 8000 },
    nodes: { type: [CanonicalNodeSchema], required: true, default: [] },
    sourceMeta: { type: SourceMetaSchema, required: false }
  },
  { timestamps: true, collection: 'canonical_roadmaps' }
);

CanonicalRoadmapSchema.index({ subjectId: 1, version: 1 });

export const CanonicalRoadmap: Model<Doc> = mongoose.model<Doc>('CanonicalRoadmap', CanonicalRoadmapSchema);
