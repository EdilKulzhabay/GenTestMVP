import { Request, Response } from 'express';
import { ProfileSubjectPair, Subject, buildPairKey } from '../models';
import { success, AppError } from '../utils';

class ProfileSubjectPairController {
  private buildTitle(t1: string, t2: string): string {
    return `${t1.trim()} - ${t2.trim()}`;
  }

  /** GET /profile-subject-pairs */
  async list(_req: Request, res: Response): Promise<void> {
    const list = await ProfileSubjectPair.find()
      .sort({ title: 1 })
      .populate('subject1Id', 'title subjectKind')
      .populate('subject2Id', 'title subjectKind');
    success(res, list);
  }

  /** POST /profile-subject-pairs (admin) */
  async create(req: Request, res: Response): Promise<void> {
    const { subject1Id, subject2Id } = req.body as { subject1Id: string; subject2Id: string };
    if (!subject1Id || !subject2Id) throw AppError.badRequest('subject1Id and subject2Id are required');
    if (subject1Id === subject2Id) throw AppError.badRequest('Предметы должны различаться');

    const [s1, s2] = await Promise.all([Subject.findById(subject1Id), Subject.findById(subject2Id)]);
    if (!s1 || !s2) throw AppError.notFound('Subject not found');

    if (s1.subjectKind !== 'profile' || s2.subjectKind !== 'profile') {
      throw AppError.badRequest('Оба предмета должны быть с типом «профильный» (subjectKind: profile)');
    }

    const pairKey = buildPairKey(subject1Id, subject2Id);
    const exists = await ProfileSubjectPair.exists({ pairKey });
    if (exists) throw AppError.badRequest('Такая пара предметов уже существует');

    const title = this.buildTitle(s1.title, s2.title);
    const doc = await ProfileSubjectPair.create({
      title,
      subject1Id,
      subject2Id,
      pairKey
    });
    const populated = await ProfileSubjectPair.findById(doc._id)
      .populate('subject1Id', 'title subjectKind')
      .populate('subject2Id', 'title subjectKind');
    success(res, populated, 'Profile subject pair created', 201);
  }

  /** PATCH /profile-subject-pairs/:id (admin) */
  async update(req: Request, res: Response): Promise<void> {
    const { subject1Id, subject2Id } = req.body as { subject1Id?: string; subject2Id?: string };
    const doc = await ProfileSubjectPair.findById(req.params.id);
    if (!doc) throw AppError.notFound('Profile subject pair not found');

    const next1 = subject1Id ?? doc.subject1Id.toString();
    const next2 = subject2Id ?? doc.subject2Id.toString();
    if (next1 === next2) throw AppError.badRequest('Предметы должны различаться');

    const [s1, s2] = await Promise.all([Subject.findById(next1), Subject.findById(next2)]);
    if (!s1 || !s2) throw AppError.notFound('Subject not found');
    if (s1.subjectKind !== 'profile' || s2.subjectKind !== 'profile') {
      throw AppError.badRequest('Оба предмета должны быть профильными (subjectKind: profile)');
    }

    const pairKey = buildPairKey(next1, next2);
    const clash = await ProfileSubjectPair.findOne({ pairKey, _id: { $ne: doc._id } });
    if (clash) throw AppError.badRequest('Такая пара предметов уже существует');

    doc.subject1Id = next1 as any;
    doc.subject2Id = next2 as any;
    doc.pairKey = pairKey;
    doc.title = this.buildTitle(s1.title, s2.title);
    await doc.save();

    const populated = await ProfileSubjectPair.findById(doc._id)
      .populate('subject1Id', 'title subjectKind')
      .populate('subject2Id', 'title subjectKind');
    success(res, populated, 'Profile subject pair updated');
  }

  /** DELETE /profile-subject-pairs/:id (admin) */
  async remove(req: Request, res: Response): Promise<void> {
    const doc = await ProfileSubjectPair.findByIdAndDelete(req.params.id);
    if (!doc) throw AppError.notFound('Profile subject pair not found');
    success(res, { deleted: true });
  }
}

export const profileSubjectPairController = new ProfileSubjectPairController();
