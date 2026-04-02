import crypto from 'crypto';
import {
  IGeneratedTest,
  IQuestion,
  IAIFeedback,
  IContentForAI,
  IUserAnswer,
  IMistake
} from '../types';

/**
 * AI SERVICE (MOCK)
 * Сервис для работы с AI (сейчас mock, готов к интеграции с OpenAI/LLM)
 * 
 * Текущая реализация:
 * - Генерирует mock вопросы на основе контента
 * - Анализирует ответы и создает обратную связь
 * 
 * Для production:
 * 1. Заменить mock логику на вызовы OpenAI API
 * 2. Использовать промпты для генерации качественных вопросов
 * 3. Добавить обработку rate limits и ошибок API
 * 4. Кешировать результаты где возможно
 */

class AIService {
  /**
   * Генерация теста на основе контента
   * 
   * @param content - текстовый контент для генерации вопросов
   * @param metadata - метаданные о контенте (книга, глава и т.д.)
   * @param previousQuestions - хеши ранее сгенерированных вопросов для избежания повторений
   * @returns Сгенерированный тест с 10 вопросами
   * 
   * TODO: Интегрировать с OpenAI API
   * Пример промпта:
   * "Generate 10 multiple-choice questions based on the following text.
   *  Each question should have 4 options with only one correct answer.
   *  Avoid these previously used questions: [previousQuestions]
   *  Format: JSON with questionText, options[], correctOption, explanation"
   */
  async generateTest(
    content: IContentForAI,
    _previousQuestions: string[] = []
  ): Promise<IGeneratedTest> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined. Set it to enable real test generation.');
    }

    const sourceContentHash = this.hashContent(content.text);
    const topicsList = content.metadata.topics?.length
      ? `- relatedContent.topicTitle — точное название темы из списка: [${content.metadata.topics.join(', ')}]. Если вопрос не привязан к конкретной теме, опусти topicTitle.`
      : '';

    const languageRule = content.metadata.contentLanguage?.trim()
      ? `- Язык полей questionText, options, correctOption, aiExplanation и topicTitle: ${content.metadata.contentLanguage.trim()}. Не смешивай с другим языком.`
      : '- Язык вопросов, вариантов ответов и пояснений должен совпадать с языком приведённого учебного текста (например текст на казахском — весь вывод на казахском; на русском — на русском; на английском — на английском).';

    const prompt = [
      'Ты — ассистент преподавателя. Сгенерируй ровно 10 вопросов для теста.',
      'Формат ответа: строгий JSON без Markdown.',
      'Структура:',
      '{ "questions": [',
      '  { "questionText": "...", "options": ["...","...","...","..."], "correctOption": "...", "aiExplanation": "...", "relatedContent": { "pages": [1,2], "topicTitle": "..." } }',
      '] }',
      'Требования:',
      languageRule,
      '- 4 варианта ответа.',
      '- correctOption должен быть одним из options.',
      '- aiExplanation краткое (1-2 предложения).',
      '- relatedContent.pages — массив номеров страниц (можно приблизительно).',
      topicsList,
      '- Если в контенте есть формулы LaTeX ($...$ или $$...$$), сохраняй их в questionText, options и aiExplanation.',
      _previousQuestions.length > 0 ? `- Избегай этих вопросов: ${_previousQuestions.join(' | ')}` : '',
      'Контент:',
      content.text
    ]
      .filter(Boolean)
      .join('\n');

    const contentPreview = content.text.length > 800
      ? `${content.text.slice(0, 800)}...`
      : content.text;

    console.log('🤖 [AI] generateTest:start', {
      model: 'gpt-4o-mini',
      subject: content.metadata.subjectTitle,
      book: content.metadata.bookTitle,
      chapter: content.metadata.chapterTitle ?? 'Вся книга',
      topicsCount: content.metadata.topics.length,
      contentChars: content.text.length,
      contentHash: sourceContentHash,
      previousQuestionsCount: _previousQuestions.length
    });
    console.log('🤖 [AI] prompt:begin');
    console.log(prompt);
    console.log('🤖 [AI] prompt:end');
    console.log('🤖 [AI] contentPreview', contentPreview);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        messages: [
          { role: 'system', content: 'Ты генерируешь тесты по учебному контенту.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🤖 [AI] response:error', { status: response.status, errorText });
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const raw = data.choices?.[0]?.message?.content ?? '';
    console.log('🤖 [AI] response:raw', raw);
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      console.error('🤖 [AI] response:parse-error', { raw });
      throw new Error('OpenAI response does not contain JSON payload.');
    }

    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as { questions: IQuestion[] };
    const questions = parsed.questions;

    if (!Array.isArray(questions) || questions.length !== 10) {
      console.error('🤖 [AI] response:invalid-questions', { count: questions?.length });
      throw new Error('OpenAI response must contain exactly 10 questions.');
    }

    for (const question of questions) {
      if (!question.options || question.options.length !== 4) {
        console.error('🤖 [AI] response:invalid-options', { questionText: question.questionText });
        throw new Error('Each question must contain exactly 4 options.');
      }
      if (!question.options.includes(question.correctOption)) {
        console.error('🤖 [AI] response:invalid-correct-option', { questionText: question.questionText });
        throw new Error('correctOption must be one of options.');
      }
      if (!question.relatedContent?.pages?.length) {
        question.relatedContent = { pages: [1] };
      }
    }

    console.log('🤖 [AI] generateTest:done', { questionsCount: questions.length });
    return { questions, sourceContentHash };
  }

  /**
   * Анализ ответов пользователя и генерация обратной связи
   * 
   * @param test - тест с правильными ответами
   * @param userAnswers - ответы пользователя
   * @param content - контент для ссылок на материал
   * @returns AI обратная связь с анализом ошибок
   * 
   * TODO: Интегрировать с OpenAI для персонализированной обратной связи
   * Пример промпта:
   * "Analyze the student's answers and provide personalized feedback.
   *  Identify weak areas and suggest specific sections to review.
   *  Be encouraging but point out areas for improvement."
   */
  async analyzeAnswers(
    correctAnswers: Array<{
      question: string;
      correctOption: string;
      explanation: string;
      relatedContent?: { pages?: number[]; topicTitle?: string };
    }>,
    userAnswers: IUserAnswer[],
    contentMetadata: IContentForAI['metadata']
  ): Promise<IAIFeedback> {
    // Симуляция задержки API
    await this.delay(800);

    // Подсчитываем правильные ответы
    const correctCount = userAnswers.filter(a => a.isCorrect).length;
    const totalCount = userAnswers.length;
    const scorePercent = Math.round((correctCount / totalCount) * 100);

    // Анализируем ошибки
    const mistakes: IMistake[] = [];

    for (let i = 0; i < userAnswers.length; i++) {
      const userAnswer = userAnswers[i];
      const correctAnswer = correctAnswers[i];

      if (!userAnswer.isCorrect) {
        const mistake: IMistake = {
          question: userAnswer.question,
          explanation: `Вы выбрали "${userAnswer.selectedOption}", но правильный ответ: "${correctAnswer.correctOption}". ${correctAnswer.explanation}`
        };
        if (contentMetadata.bookTitle?.trim()) {
          const rcPages = correctAnswer.relatedContent?.pages;
          const pages = rcPages && rcPages.length > 0 ? rcPages : [1];
          mistake.whereToRead = {
            bookTitle: contentMetadata.bookTitle,
            chapterTitle: contentMetadata.chapterTitle || 'Вся книга',
            pages,
            topicTitle: correctAnswer.relatedContent?.topicTitle
          };
        }
        mistakes.push(mistake);
      }
    }

    // Генерируем общий вывод
    let summary = '';
    
    if (scorePercent >= 90) {
      summary = `Отличная работа! Вы ответили правильно на ${correctCount} из ${totalCount} вопросов (${scorePercent}%). Вы демонстрируете отличное понимание материала по теме "${contentMetadata.bookTitle}".`;
    } else if (scorePercent >= 70) {
      summary = `Хороший результат! Вы ответили правильно на ${correctCount} из ${totalCount} вопросов (${scorePercent}%). Рекомендуем повторить материал по темам, где были допущены ошибки.`;
    } else if (scorePercent >= 50) {
      summary = `Вы ответили правильно на ${correctCount} из ${totalCount} вопросов (${scorePercent}%). Необходимо более внимательно изучить материал. Обратите особое внимание на разделы, указанные в ошибках ниже.`;
    } else {
      summary = `Вы ответили правильно на ${correctCount} из ${totalCount} вопросов (${scorePercent}%). Рекомендуем полностью перечитать главу "${contentMetadata.chapterTitle || contentMetadata.bookTitle}" и попробовать пройти тест снова.`;
    }

    if (mistakes.length > 0) {
      summary += ` Всего допущено ошибок: ${mistakes.length}. Подробный разбор ошибок представлен ниже.`;
    }

    return {
      summary,
      mistakes
    };
  }

  /**
   * Перефразирование вопроса для избежания повторений
   * Используется когда вопрос уже задавался ранее
   * 
   * TODO: Интегрировать с OpenAI
   */
  async rephraseQuestion(originalQuestion: string): Promise<string> {
    await this.delay(300);
    
    // Mock перефразирование
    return `[Перефразировано] ${originalQuestion}`;
  }

  /**
   * Вспомогательные методы
   */

  /**
   * Создание хеша контента для кеширования тестов
   */
  private hashContent(content: string): string {
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');
  }

  /**
   * Симуляция задержки API
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Проверка, не повторяется ли вопрос
   * Сравнивает хеш нового вопроса с предыдущими
   */
  isQuestionDuplicate(questionText: string, previousHashes: string[]): boolean {
    const questionHash = Buffer.from(questionText).toString('base64');
    return previousHashes.includes(questionHash);
  }

  /**
   * Создание хеша вопроса
   */
  hashQuestion(questionText: string): string {
    return Buffer.from(questionText).toString('base64');
  }
}

// Singleton паттерн для AI сервиса
export const aiService = new AIService();

/**
 * INTEGRATION GUIDE для замены на реальный AI:
 * 
 * 1. Установить OpenAI SDK:
 *    npm install openai
 * 
 * 2. Добавить в .env:
 *    OPENAI_API_KEY=your_api_key
 * 
 * 3. Заменить методы generateTest и analyzeAnswers:
 * 
 * import { Configuration, OpenAIApi } from 'openai';
 * 
 * const configuration = new Configuration({
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 * const openai = new OpenAIApi(configuration);
 * 
 * async generateTest(content, previousQuestions) {
 *   const response = await openai.createChatCompletion({
 *     model: "gpt-4",
 *     messages: [{
 *       role: "system",
 *       content: "You are an educational test generator..."
 *     }, {
 *       role: "user",
 *       content: `Generate 10 questions based on: ${content.text}...`
 *     }],
 *     temperature: 0.7,
 *   });
 *   
 *   return JSON.parse(response.data.choices[0].message.content);
 * }
 */
