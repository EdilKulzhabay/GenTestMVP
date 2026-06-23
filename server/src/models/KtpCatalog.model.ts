import mongoose, { Schema, Document, Model } from 'mongoose';
import { IKtpCatalog, IKtpTopic, IKnowledgeComponent } from '../types/roadmap.types';

/**
 * Компонент знания (подтема) — атом для тестов и mastery. _id стабилен (rename-safe):
 * на него ссылаются QuestionItem.knowledgeComponentIds и пер-KC прогресс.
 */
const KnowledgeComponentSchema = new Schema<IKnowledgeComponent>(
  {
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 2000 },
    order: { type: Number, required: true, min: 0, default: 0 },
    status: { type: String, enum: ['proposed', 'confirmed'], default: 'proposed' }
  },
  { _id: true, timestamps: false }
);

/**
 * KTP CATALOG MODEL
 * Справочник КТП (календарно-тематическое планирование) по предмету.
 *
 * КТП — канонический упорядоченный список тем предмета (задаётся центром тестирования).
 * Роудмап строится ИЗ КТП: узел роудмапа = тема КТП, которая агрегирует материал
 * из тем книг (разных классов), замапленных на неё.
 *
 * _id встроенной темы КТП — стабильный, rename-safe идентификатор: на него ссылаются
 * Subject.Topic.ktpTopicIds[] и nodeId роудмапа (`ktp:{ktpTopicId}`).
 */

const KtpTopicSchema = new Schema<IKtpTopic>(
  {
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 8000 },
    order: { type: Number, required: true, min: 0 },
    /** Код темы от центра тестирования (для отображения/импорта; НЕ стабильный id) */
    code: { type: String, trim: true, maxlength: 80 },
    /** Явные пререквизиты (задел; по умолчанию используется линейный порядок по `order`) */
    prerequisiteKtpTopicIds: [{ type: Schema.Types.ObjectId }],
    /** Компоненты знания (подтемы) — атом для тестов и mastery */
    knowledgeComponents: { type: [KnowledgeComponentSchema], default: undefined }
  },
  { _id: true, timestamps: false }
);

type Doc = Document & Omit<IKtpCatalog, '_id'>;

const KtpCatalogSchema = new Schema<Doc>(
  {
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
      index: true,
      unique: true
    },
    /** Год, на который актуален КТП (справочник ЦТ меняется ежегодно) */
    year: { type: Number, min: 2000, max: 2100 },
    version: { type: Number, required: true, default: 1, min: 1 },
    topics: { type: [KtpTopicSchema], required: true, default: [] }
  },
  { timestamps: true, collection: 'ktp_catalogs' }
);

export const KtpCatalog: Model<Doc> = mongoose.model<Doc>('KtpCatalog', KtpCatalogSchema);
