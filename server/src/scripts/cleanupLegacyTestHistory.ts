import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { User } from '../models';

/**
 * Скрипт: удаление «старых» записей истории тестов без testId.
 *
 * До декомпозиции результата теста записи testHistory не хранили ссылку на тест (testId),
 * поэтому для них недоступны эндпойнты /users/me/tests/:id/breakdown и /ai-explanation
 * (они отдают 400). Скрипт вычищает такие легаси-записи из всех пользователей.
 *
 * Использование (из папки server/):
 *   npx ts-node src/scripts/cleanupLegacyTestHistory.ts
 * или:
 *   npm run cleanup:legacy-history
 */
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main(): Promise<void> {
  await connectDB();

  const res = await User.updateMany(
    {},
    { $pull: { testHistory: { testId: { $exists: false } } } }
  );

  console.log(
    `✅ Очистка завершена. Пользователей затронуто: ${res.modifiedCount} (из ${res.matchedCount}).`
  );

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
