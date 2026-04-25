import type { User } from '../types/auth.types';
import type { Subject } from '../types/subject.types';

/** У обычного пользователя выбрана пара профильных предметов (нужен доступ к main + эти два profile). */
export function learnerHasProfilePair(user: User | null | undefined): boolean {
  if (!user) return true;
  if (user.role === 'admin') return true;
  const p = user.profileSubjectPairId;
  if (p == null) return false;
  if (typeof p === 'string') return p.length > 0;
  if (typeof p === 'object' && p !== null && '_id' in p) return true;
  return false;
}

function profileIdsFromUser(user: User | null | undefined): Set<string> | null {
  if (!user) return null;
  const p = user.profileSubjectPairId;
  if (!p || typeof p === 'string') return null;
  const s1 = p.subject1Id;
  const s2 = p.subject2Id;
  const id1 =
    typeof s1 === 'object' && s1 && '_id' in s1 ? String(s1._id) : String(s1 ?? '');
  const id2 =
    typeof s2 === 'object' && s2 && '_id' in s2 ? String(s2._id) : String(s2 ?? '');
  if (!id1 || !id2 || id1 === 'undefined' || id2 === 'undefined') return null;
  return new Set([id1, id2]);
}

/**
 * Для учащегося: все основные предметы + два профильных из выбранной пары.
 * Гостя и админа — не трогать (передавайте user === null и не используйте для админа-роутов).
 */
export function filterSubjectsForLearner(subjects: Subject[], user: User | null | undefined): Subject[] {
  if (!user || user.role === 'admin') return subjects;
  if (!learnerHasProfilePair(user)) return [];
  const allowedProfile = profileIdsFromUser(user);
  if (!allowedProfile) return [];
  return subjects.filter((sub) => {
    const id = sub._id ? String(sub._id) : '';
    const kind = sub.subjectKind ?? 'main';
    if (kind === 'main') return true;
    if (kind === 'profile') return id && allowedProfile.has(id);
    return false;
  });
}

export function isSubjectAllowedForLearner(
  user: User | null | undefined,
  subject: Pick<Subject, '_id' | 'subjectKind'> | null
): boolean {
  if (!user) return true;
  if (user.role === 'admin') return true;
  if (!subject?._id) return false;
  if (!learnerHasProfilePair(user)) return false;
  const kind = subject.subjectKind ?? 'main';
  if (kind === 'main') return true;
  const allowed = profileIdsFromUser(user);
  return allowed ? allowed.has(String(subject._id)) : false;
}
