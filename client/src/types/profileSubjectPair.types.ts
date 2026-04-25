import type { Subject, SubjectKind } from './subject.types';

export interface ProfileSubjectPair {
  _id: string;
  title: string;
  subject1Id: Subject | string;
  subject2Id: Subject | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProfileSubjectRef {
  _id: string;
  title: string;
  subjectKind?: SubjectKind;
}
