import { API_BASE_PATH } from './constants';

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Edu AI API',
    version: '1.0.0',
    description: `API платформы для AI-генерации тестов по учебному контенту.

**Авторизация:** OTP (WhatsApp/Telegram) или Google OAuth. JWT передаётся в cookie \`token\` или в заголовке \`Authorization: Bearer <token>\`.

**Структура контента:** Subject → Book → Chapter → Topic → Paragraph.

**Базовый путь:** \`${API_BASE_PATH}\``,
    contact: { name: 'Edu AI', url: 'https://kakoi-to-do-men.ru' }
  },
  servers: [
    { url: `https://kakoi-to-do-men.ru${API_BASE_PATH}`, description: 'Production' },
    { url: `http://localhost:5111${API_BASE_PATH}`, description: 'Development (port 5111)' },
    { url: `http://localhost:5000${API_BASE_PATH}`, description: 'Development (port 5000)' }
  ],
  tags: [
    { name: 'Auth', description: 'OTP (request-otp → verify-phone), Google OAuth, login, create-admin' },
    { name: 'Subjects', description: 'Предметы, книги, главы, темы, параграфы. Публичный список, admin — создание/импорт' },
    { name: 'Tests', description: 'Генерация (auth/guest), отправка ответов, привязка гостевого теста' },
    { name: 'Users', description: 'Профиль, история тестов, статистика (требует auth)' },
    { name: 'System', description: 'Health check, отладка' }
  ],
  components: {
    securitySchemes: {
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'token', description: 'JWT в HTTP-only cookie' },
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT в заголовке Authorization: Bearer <token>' }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Validation failed' },
          errors: {
            type: 'array',
            items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } }
          }
        }
      },
      RequestOtpRequest: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string', example: '+79001234567', minLength: 10, description: 'Номер в любом формате (8/7, с пробелами)' }
        }
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: { type: 'object' }
        }
      },

      RegisterRequest: {
        type: 'object',
        required: ['fullName', 'email', 'phone', 'userName', 'password'],
        properties: {
          fullName: { type: 'string', example: 'Иван Иванов', minLength: 2, maxLength: 100 },
          email: { type: 'string', format: 'email', example: 'ivan@example.com' },
          phone: { type: 'string', example: '+79001234567', minLength: 10 },
          userName: { type: 'string', example: 'ivan_i', minLength: 3, maxLength: 50, pattern: '^[a-zA-Z0-9_]+$' },
          password: { type: 'string', minLength: 6, example: 'secret123' }
        }
      },
      VerifyPhoneRequest: {
        type: 'object',
        required: ['phone', 'code'],
        properties: {
          phone: { type: 'string', example: '+79001234567' },
          code: { type: 'string', minLength: 6, maxLength: 6, example: '123456' }
        }
      },
      CreateAdminRequest: {
        type: 'object',
        required: ['fullName', 'userName', 'password'],
        properties: {
          fullName: { type: 'string', example: 'Admin', minLength: 2, maxLength: 100 },
          userName: { type: 'string', example: 'admin', minLength: 3, maxLength: 50, pattern: '^[a-zA-Z0-9_]+$' },
          password: { type: 'string', minLength: 6, example: 'adminpass' }
        }
      },
      LoginRequest: {
        type: 'object',
        required: ['userName', 'password'],
        properties: {
          userName: { type: 'string', example: 'ivan_i' },
          password: { type: 'string', example: 'secret123' }
        }
      },
      AuthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              token: { type: 'string', description: 'JWT (устанавливается в cookie при verify-phone/login)' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  fullName: { type: 'string' },
                  userName: { type: 'string' },
                  email: { type: 'string' },
                  phone: { type: 'string', description: 'Номер телефона (при OTP-входе)' },
                  role: { type: 'string', enum: ['admin', 'user'] }
                }
              }
            }
          }
        }
      },
      RegisterResponse: {
        type: 'object',
        description: 'Ответ после отправки кода. При недоступности WhatsApp/Telegram возвращается botLink.',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Verification code sent via WhatsApp' },
          data: {
            type: 'object',
            properties: {
              channel: { type: 'string', enum: ['whatsapp', 'telegram'], description: 'Канал отправки кода' },
              botLink: { type: 'string', description: 'Ссылка на Telegram-бота для получения кода (если WhatsApp/Telegram недоступны)' }
            }
          }
        }
      },

      Metadata: {
        type: 'object',
        properties: {
          keywords: { type: 'array', items: { type: 'string' } },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          source: { type: 'string' }
        }
      },
      Content: {
        type: 'object',
        required: ['text', 'pages', 'metadata'],
        properties: {
          text: { type: 'string', description: 'Текст параграфа' },
          pages: { type: 'array', items: { type: 'number' }, description: 'Номера страниц в учебнике' },
          metadata: { $ref: '#/components/schemas/Metadata' }
        }
      },
      Paragraph: {
        type: 'object',
        required: ['order', 'content'],
        properties: {
          _id: { type: 'string' },
          order: { type: 'integer', minimum: 0 },
          content: { $ref: '#/components/schemas/Content' }
        }
      },
      Topic: {
        type: 'object',
        required: ['title'],
        properties: {
          _id: { type: 'string' },
          title: { type: 'string', maxLength: 200 },
          paragraphs: { type: 'array', items: { $ref: '#/components/schemas/Paragraph' } }
        }
      },
      Chapter: {
        type: 'object',
        required: ['title', 'order'],
        properties: {
          _id: { type: 'string' },
          title: { type: 'string', maxLength: 200 },
          order: { type: 'integer', minimum: 0 },
          topics: { type: 'array', items: { $ref: '#/components/schemas/Topic' } }
        }
      },
      Book: {
        type: 'object',
        required: ['title'],
        properties: {
          _id: { type: 'string' },
          title: { type: 'string', maxLength: 300 },
          author: { type: 'string', maxLength: 200 },
          contentLanguage: { type: 'string', maxLength: 80, description: 'Язык текста книги (для ИИ)' },
          chapters: { type: 'array', items: { $ref: '#/components/schemas/Chapter' } }
        }
      },
      Subject: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          books: { type: 'array', items: { $ref: '#/components/schemas/Book' } },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      ImportSubjectRequest: {
        type: 'object',
        required: ['title'],
        description: 'Полная структура предмета для импорта. Содержит books → chapters → topics → paragraphs.',
        properties: {
          title: { type: 'string', example: 'География' },
          description: { type: 'string', example: 'География 7 класс' },
          books: {
            type: 'array',
            items: {
              type: 'object',
              required: ['title'],
              properties: {
                title: { type: 'string', example: 'География 7 класс Колмакова 2023' },
                author: { type: 'string', example: 'Колмакова' },
                chapters: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['title', 'order'],
                    properties: {
                      title: { type: 'string' },
                      order: { type: 'integer' },
                      topics: {
                        type: 'array',
                        items: {
                          type: 'object',
                          required: ['title'],
                          properties: {
                            title: { type: 'string' },
                            paragraphs: {
                              type: 'array',
                              items: {
                                type: 'object',
                                required: ['order', 'content'],
                                properties: {
                                  order: { type: 'integer' },
                                  content: { $ref: '#/components/schemas/Content' }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      ImportSubjectResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Imported: 1 books, 3 chapters, 3 topics, 3 paragraphs' },
          data: {
            type: 'object',
            properties: {
              subject: { $ref: '#/components/schemas/Subject' },
              stats: {
                type: 'object',
                properties: {
                  books: { type: 'integer' },
                  chapters: { type: 'integer' },
                  topics: { type: 'integer' },
                  paragraphs: { type: 'integer' }
                }
              }
            }
          }
        }
      },

      GenerateTestRequest: {
        type: 'object',
        required: ['subjectId', 'bookId'],
        properties: {
          subjectId: { type: 'string', description: 'MongoDB ObjectId предмета' },
          bookId: { type: 'string', description: 'MongoDB ObjectId книги' },
          chapterId: { type: 'string', description: 'MongoDB ObjectId главы (опционально, если fullBook=false)' },
          fullBook: { type: 'boolean', default: false, description: 'true — тест по всей книге, false — по главе' }
        },
        example: { subjectId: '507f1f77bcf86cd799439011', bookId: '507f1f77bcf86cd799439012', chapterId: '507f1f77bcf86cd799439013', fullBook: false }
      },
      GeneratedTest: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          subjectId: { type: 'string' },
          bookId: { type: 'string' },
          chapterId: { type: 'string' },
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                questionText: { type: 'string' },
                options: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      SubmitTestRequest: {
        type: 'object',
        required: ['testId', 'answers'],
        properties: {
          testId: { type: 'string' },
          answers: {
            type: 'array',
            items: {
              type: 'object',
              required: ['questionText', 'selectedOption'],
              properties: {
                questionText: { type: 'string' },
                selectedOption: { type: 'string' }
              }
            }
          }
        }
      },
      SubmitTestResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              testId: { type: 'string' },
              result: {
                type: 'object',
                properties: {
                  totalQuestions: { type: 'number' },
                  correctAnswers: { type: 'number' },
                  scorePercent: { type: 'number' }
                }
              },
              aiFeedback: {
                type: 'object',
                properties: {
                  summary: { type: 'string' },
                  mistakes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        question: { type: 'string' },
                        explanation: { type: 'string' },
                        whereToRead: {
                          type: 'object',
                          properties: {
                            bookTitle: { type: 'string' },
                            chapterTitle: { type: 'string' },
                            pages: { type: 'array', items: { type: 'number' } },
                            topicTitle: { type: 'string', description: 'Название темы/параграфа' }
                          }
                        }
                      }
                    }
                  }
                }
              },
              detailedAnswers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    questionText: { type: 'string' },
                    options: { type: 'array', items: { type: 'string' } },
                    correctOption: { type: 'string' },
                    selectedOption: { type: 'string' },
                    isCorrect: { type: 'boolean' },
                    explanation: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      },
      TestHistoryResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              total: { type: 'number' },
              tests: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    _id: { type: 'string' },
                    subjectId: {
                      type: 'object',
                      properties: { _id: { type: 'string' }, title: { type: 'string' } }
                    },
                    bookId: { type: 'string' },
                    chapterId: { type: 'string' },
                    result: {
                      type: 'object',
                      properties: {
                        totalQuestions: { type: 'number' },
                        correctAnswers: { type: 'number' },
                        scorePercent: { type: 'number' }
                      }
                    },
                    aiFeedback: {
                      type: 'object',
                      properties: { summary: { type: 'string' } }
                    },
                    createdAt: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          }
        }
      },
      UserStats: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              totalTests: { type: 'number' },
              averageScore: { type: 'number' },
              bestScore: { type: 'number' },
              worstScore: { type: 'number' }
            }
          }
        }
      },
      PaginationQuery: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, default: 20, description: 'Количество записей' },
          sortBy: { type: 'string', enum: ['createdAt', 'scorePercent'] },
          order: { type: 'string', enum: ['asc', 'desc'] }
        }
      }
    }
  },

  paths: {
    // ==================== AUTH ====================
    '/auth/request-otp': {
      post: {
        tags: ['Auth'],
        summary: 'Запросить OTP на телефон',
        description: `Отправляет 6-значный код. Приоритет: **WhatsApp** (whatsapp-bot) → **Telegram** (если номер привязан через /start +номер). Если оба недоступны — возвращает \`botLink\` (ссылка на Telegram-бота).`,
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RequestOtpRequest' } } } },
        responses: {
          200: {
            description: 'Код отправлен',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RegisterResponse' },
                examples: {
                  whatsapp: { value: { success: true, message: 'Код отправлен в WhatsApp', data: { channel: 'whatsapp' } } },
                  telegram: { value: { success: true, message: 'Код отправлен в Telegram', data: { channel: 'telegram' } } },
                  botLink: { value: { success: true, message: 'Используйте ссылку на бота для получения кода', data: { botLink: 'https://t.me/bot?start=79001234567' } } }
                }
              }
            }
          },
          400: { description: 'Неверный номер (меньше 10 цифр)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/auth/verify-phone': {
      post: {
        tags: ['Auth'],
        summary: 'Подтвердить код и войти',
        description: 'Шаг 2 после request-otp. Если пользователь существует — вход. Если нет — создаётся аккаунт (userName: user_XXXXXXXX). JWT устанавливается в cookie.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyPhoneRequest' } } } },
        responses: {
          200: { description: 'Вход выполнен, cookie установлен', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          201: { description: 'Аккаунт создан и вход выполнен', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          400: { description: 'Неверный или просроченный код', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/auth/create-admin': {
      post: {
        tags: ['Auth'],
        summary: 'Создать администратора (без email-верификации)',
        description: 'Создаёт пользователя с ролью admin. Не требует email. Рекомендуется защитить через env-секрет в production.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateAdminRequest' } } } },
        responses: {
          201: { description: 'Админ создан, cookie установлен', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          400: { description: 'Username уже занят', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/auth/google': {
      get: {
        tags: ['Auth'],
        summary: 'Google OAuth — редирект на Google для входа/регистрации',
        responses: { 302: { description: 'Редирект на Google' }, 501: { description: 'Google OAuth не настроен' } }
      }
    },
    '/auth/google/callback': {
      get: {
        tags: ['Auth'],
        summary: 'Callback после Google OAuth',
        responses: { 302: { description: 'Редирект на фронтенд с установленной cookie' } }
      }
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Вход в систему',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
        responses: {
          200: { description: 'Успешный вход, cookie установлен', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          401: { description: 'Неверный логин или пароль', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Текущий пользователь',
        description: 'JWT из cookie или заголовка Authorization: Bearer',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          200: { description: 'Данные пользователя', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          401: { description: 'Не авторизован', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    // ==================== SUBJECTS ====================
    '/subjects': {
      get: {
        tags: ['Subjects'],
        summary: 'Список всех предметов',
        operationId: 'getSubjects',
        description: 'Публичный. Возвращает предметы с массивом books (для выбора в UI).',
        responses: {
          200: {
            description: 'Массив предметов',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/Subject' } } } } } }
          }
        }
      },
      post: {
        tags: ['Subjects'],
        summary: 'Создать пустой предмет (admin)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { title: { type: 'string', maxLength: 200 }, description: { type: 'string', maxLength: 1000 } } } } }
        },
        responses: {
          201: { description: 'Предмет создан', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/Subject' } } } } } },
          401: { description: 'Не авторизован' },
          403: { description: 'Нет прав (не admin)' }
        }
      }
    },
    '/subjects/import': {
      post: {
        tags: ['Subjects'],
        summary: 'Импорт предмета целиком (admin)',
        description: 'Создаёт предмет со всей вложенной структурой: книги → главы → темы → параграфы. Принимает JSON-файл (например, subject.json).',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ImportSubjectRequest' } } }
        },
        responses: {
          201: { description: 'Предмет импортирован', content: { 'application/json': { schema: { $ref: '#/components/schemas/ImportSubjectResponse' } } } },
          400: { description: 'Предмет уже существует / невалидные данные', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Не авторизован' },
          403: { description: 'Нет прав (не admin)' }
        }
      }
    },
    '/subjects/{id}': {
      get: {
        tags: ['Subjects'],
        summary: 'Предмет по ID (полная структура)',
        description: 'Публичный. Возвращает предмет с полным деревом: books → chapters → topics → paragraphs.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'MongoDB ObjectId предмета' }],
        responses: {
          200: { description: 'Предмет', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/Subject' } } } } } },
          404: { description: 'Предмет не найден' }
        }
      }
    },
    '/subjects/{id}/books': {
      post: {
        tags: ['Subjects'],
        summary: 'Добавить книгу к предмету (admin)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'ObjectId предмета' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', maxLength: 300 },
                  author: { type: 'string', maxLength: 200 },
                  contentLanguage: { type: 'string', maxLength: 80 }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Книга добавлена' },
          404: { description: 'Предмет не найден' }
        }
      }
    },
    '/subjects/books/{bookId}/chapters': {
      post: {
        tags: ['Subjects'],
        summary: 'Добавить главу к книге (admin)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'bookId', in: 'path', required: true, schema: { type: 'string' }, description: 'ObjectId книги' },
          { name: 'subjectId', in: 'query', required: true, schema: { type: 'string' }, description: 'ObjectId предмета' }
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['title', 'order'], properties: { title: { type: 'string', maxLength: 200 }, order: { type: 'integer', minimum: 0 } } } } }
        },
        responses: {
          201: { description: 'Глава добавлена' },
          404: { description: 'Предмет или книга не найдены' }
        }
      }
    },
    '/subjects/chapters/{chapterId}/topics': {
      post: {
        tags: ['Subjects'],
        summary: 'Добавить тему к главе (admin)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'chapterId', in: 'path', required: true, schema: { type: 'string' }, description: 'ObjectId главы' },
          { name: 'subjectId', in: 'query', required: true, schema: { type: 'string' }, description: 'ObjectId предмета' },
          { name: 'bookId', in: 'query', required: true, schema: { type: 'string' }, description: 'ObjectId книги' }
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { title: { type: 'string', maxLength: 200 } } } } }
        },
        responses: {
          201: { description: 'Тема добавлена' },
          404: { description: 'Предмет, книга или глава не найдены' }
        }
      }
    },
    '/subjects/topics/{topicId}/paragraphs': {
      post: {
        tags: ['Subjects'],
        summary: 'Добавить параграф к теме (admin)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'topicId', in: 'path', required: true, schema: { type: 'string' }, description: 'ObjectId темы' },
          { name: 'subjectId', in: 'query', required: true, schema: { type: 'string' }, description: 'ObjectId предмета' },
          { name: 'bookId', in: 'query', required: true, schema: { type: 'string' }, description: 'ObjectId книги' },
          { name: 'chapterId', in: 'query', required: true, schema: { type: 'string' }, description: 'ObjectId главы' }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['order', 'content'],
                properties: {
                  order: { type: 'integer', minimum: 0 },
                  content: { $ref: '#/components/schemas/Content' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Параграф добавлен' },
          404: { description: 'Предмет, книга, глава или тема не найдены' }
        }
      }
    },

    // ==================== TESTS ====================
    '/tests/generate': {
      post: {
        tags: ['Tests'],
        summary: 'Сгенерировать тест (auth)',
        operationId: 'generateTest',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/GenerateTestRequest' } } } },
        responses: {
          200: { description: 'Тест сгенерирован', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/GeneratedTest' } } } } } },
          404: { description: 'Предмет/книга/глава не найдены' }
        }
      }
    },
    '/tests/generate-guest': {
      post: {
        tags: ['Tests'],
        summary: 'Сгенерировать тест (гость)',
        operationId: 'generateTestGuest',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/GenerateTestRequest' } } } },
        responses: {
          200: { description: 'Тест сгенерирован', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/GeneratedTest' } } } } } },
          404: { description: 'Предмет/книга/глава не найдены' }
        }
      }
    },
    '/tests/submit': {
      post: {
        tags: ['Tests'],
        summary: 'Отправить ответы (auth, сохраняется в историю)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SubmitTestRequest' } } } },
        responses: {
          200: { description: 'Результат теста', content: { 'application/json': { schema: { $ref: '#/components/schemas/SubmitTestResponse' } } } }
        }
      }
    },
    '/tests/claim-guest': {
      post: {
        tags: ['Tests'],
        summary: 'Привязать гостевой тест к авторизованному пользователю',
        description: 'Вызывается автоматически после login/register, если у гостя был пройден тест. Проверяет ответы и сохраняет результат в историю пользователя.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SubmitTestRequest' } } } },
        responses: {
          200: { description: 'Тест привязан к пользователю', content: { 'application/json': { schema: { $ref: '#/components/schemas/SubmitTestResponse' } } } },
          404: { description: 'Тест не найден' }
        }
      }
    },
    '/tests/submit-guest': {
      post: {
        tags: ['Tests'],
        summary: 'Отправить ответы (гость, без сохранения в историю)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SubmitTestRequest' } } } },
        responses: {
          200: { description: 'Результат теста (не сохраняется)', content: { 'application/json': { schema: { $ref: '#/components/schemas/SubmitTestResponse' } } } }
        }
      }
    },
    '/tests/{id}': {
      get: {
        tags: ['Tests'],
        summary: 'Получить тест по ID (без правильных ответов)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'ObjectId теста' }],
        responses: {
          200: { description: 'Тест', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/GeneratedTest' } } } } } },
          404: { description: 'Тест не найден' }
        }
      }
    },

    // ==================== USERS ====================
    '/users/me': {
      get: {
        tags: ['Users'],
        summary: 'Профиль текущего пользователя',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          200: { description: 'Профиль' },
          401: { description: 'Не авторизован' }
        }
      }
    },
    '/users/me/tests': {
      get: {
        tags: ['Users'],
        summary: 'История тестов',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'subjectId', in: 'query', schema: { type: 'string' }, description: 'Фильтр по предмету' },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Количество записей' },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['createdAt', 'scorePercent'] }, description: 'Поле сортировки' },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] }, description: 'Направление сортировки' }
        ],
        responses: {
          200: { description: 'История тестов', content: { 'application/json': { schema: { $ref: '#/components/schemas/TestHistoryResponse' } } } }
        }
      }
    },
    '/users/me/stats': {
      get: {
        tags: ['Users'],
        summary: 'Статистика пользователя',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          200: { description: 'Статистика (среднее, лучший, худший, прогресс)', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserStats' } } } }
        }
      }
    },
    '/users/me/tests/{testHistoryId}': {
      get: {
        tags: ['Users'],
        summary: 'Детали конкретного теста из истории',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'testHistoryId', in: 'path', required: true, schema: { type: 'string' }, description: 'ObjectId записи из истории' }],
        responses: {
          200: { description: 'Детальная информация о тесте' },
          404: { description: 'Запись не найдена' }
        }
      }
    },

    // ==================== SYSTEM ====================
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        responses: { 200: { description: 'API работает', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { timestamp: { type: 'string', format: 'date-time' } } } } } } } } }
      }
    },
    '/debug': {
      get: {
        tags: ['System'],
        summary: 'Отладка — проверка доступности API',
        description: 'Возвращает path, originalUrl, baseUrl, method запроса. Для диагностики прокси/маршрутизации.',
        responses: {
          200: {
            description: 'Данные запроса',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: {
                      type: 'object',
                      properties: {
                        path: { type: 'string' },
                        originalUrl: { type: 'string' },
                        baseUrl: { type: 'string' },
                        method: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

export default swaggerSpec;
