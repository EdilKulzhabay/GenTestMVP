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
    { name: 'Subjects', description: 'Предметы, книги, главы, темы, параграфы. CRUD (admin), публичный список' },
    {
      name: 'Tests',
      description:
        'Генерация (auth/guest) с `questionCount`, отправка ответов (`forTrial` для расчёта тем пробника), Solo (daily pack / practice), привязка гостевого теста'
    },
    {
      name: 'Trial',
      description:
        'Пробное тестирование (ВНО): конфиг, план из 5 блоков, перенос результатов ≥ 80% по теме на personal roadmap (POST apply-results)'
    },
    { name: 'Roadmaps', description: 'Canonical roadmap (карта знаний), Personal roadmap (прогресс), рекомендации, урок, «освоил», чат' },
    {
      name: 'Users',
      description: 'Профиль, пара профильных предметов (PATCH profile-subject-pair), история тестов, статистика'
    },
    {
      name: 'Profile subject pairs',
      description: 'Каталог разрешённых пар профильных предметов (для выбора учеником). CRUD — admin, GET — auth'
    },
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
          subjectKind: { type: 'string', enum: ['main', 'profile'], description: 'Основной (ВНО) или профильный' },
          books: { type: 'array', items: { $ref: '#/components/schemas/Book' } },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      ImportSubjectRequest: {
        type: 'object',
        required: ['title'],
        description:
          'Полная структура предмета для импорта. Содержит books → chapters → topics → paragraphs. `updateIfExists: true` — обновить существующий предмет с тем же title (тип, описание, книги).',
        properties: {
          title: { type: 'string', example: 'География' },
          description: { type: 'string', example: 'География 7 класс' },
          subjectKind: { type: 'string', enum: ['main', 'profile'], description: 'По умолчанию main' },
          updateIfExists: { type: 'boolean', description: 'Если true и предмет с таким title есть — перезаписать' },
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
      ProfileSubjectPair: {
        type: 'object',
        description: 'После populate subject*Id — объекты с title и subjectKind',
        properties: {
          _id: { type: 'string' },
          title: { type: 'string' },
          pairKey: { type: 'string' },
          subject1Id: { type: 'object' },
          subject2Id: { type: 'object' }
        }
      },
      PatchProfileSubjectPairIdRequest: {
        type: 'object',
        required: ['profileSubjectPairId'],
        description: 'null или "" — сброс; иначе id пары из GET /profile-subject-pairs',
        properties: {
          profileSubjectPairId: { nullable: true, type: 'string', description: 'Mongo id пары или null' }
        }
      },
      RebuildCanonicalFromTopicsRequest: {
        type: 'object',
        required: ['subjectId'],
        properties: { subjectId: { type: 'string', description: 'Mongo id предмета' } }
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

      TestGenerationProfile: {
        type: 'string',
        enum: ['regular', 'ent'],
        description:
          'regular — классика (1–50 вопросов, одна правильная из 4); ent — смешанные форматы ЕНТ (10–120, кратно 10, батчами по 10)'
      },
      GenerateTestRequest: {
        type: 'object',
        required: ['subjectId', 'bookId'],
        properties: {
          subjectId: { type: 'string', description: 'MongoDB ObjectId предмета' },
          bookId: { type: 'string', description: 'MongoDB ObjectId книги' },
          chapterId: { type: 'string', description: 'MongoDB ObjectId главы (опционально, если fullBook=false)' },
          fullBook: { type: 'boolean', default: false, description: 'true — тест по всей книге, false — по главе' },
          testProfile: { $ref: '#/components/schemas/TestGenerationProfile' },
          questionCount: {
            type: 'integer',
            minimum: 1,
            description:
              'Число вопросов: regular — 1..50, ent — 10..120 (кратно 10) или краткие батчи; по умолчанию сервер задаёт 10'
          },
          topicFocus: {
            type: 'string',
            description: 'Сфокусировать генерацию на теме (текст из карты/роадмап-узла)'
          },
          roadmapNodeId: {
            type: 'string',
            description: 'Узел карты знаний: проверка лимита неудачных попыток и фокус'
          }
        },
        example: {
          subjectId: '507f1f77bcf86cd799439011',
          bookId: '507f1f77bcf86cd799439012',
          chapterId: '507f1f77bcf86cd799439013',
          fullBook: false,
          testProfile: 'regular',
          questionCount: 10
        }
      },
      TrialTopicMasteryRow: {
        type: 'object',
        required: ['subjectId', 'nodeId', 'scorePercent'],
        description: 'Тема (узел bookId:chapterId:topicId) с долей верных ≥ порога пробника (80%) в рамках одного теста',
        properties: {
          subjectId: { type: 'string' },
          nodeId: { type: 'string', description: 'Идентификатор темы в canonical roadmap' },
          scorePercent: { type: 'number', minimum: 0, maximum: 100, description: 'Процент верных по вопросам этой темы' }
        }
      },
      TrialApplyResultsRequest: {
        type: 'object',
        required: ['results'],
        properties: {
          results: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['subjectId', 'nodeId', 'scorePercent'],
              properties: {
                subjectId: { type: 'string' },
                nodeId: { type: 'string' },
                scorePercent: { type: 'number', minimum: 0, maximum: 100, description: 'Порог «освоено» пробника: ≥ 80' }
              }
            }
          }
        }
      },
      TrialApplyResultsResponse: {
        type: 'object',
        properties: {
          updatedNodeIds: { type: 'array', items: { type: 'string' }, description: 'Узлы, у которых обновлён прогресс' }
        }
      },
      TrialConfigResponse: {
        type: 'object',
        description: 'GET /trial/config (optional auth — для pairedProfileIds)',
        properties: {
          mainSubjects: { type: 'array', items: { type: 'object', properties: { _id: { type: 'string' }, title: { type: 'string' } } } },
          profileSubjects: { type: 'array', items: { type: 'object', properties: { _id: { type: 'string' }, title: { type: 'string' } } } },
          pairedProfileIds: { type: 'array', items: { type: 'string' }, nullable: true },
          trialMainsOk: { type: 'boolean', description: 'В БД заведены три main-предмета ВНО' },
          entTrialInfo: {
            type: 'object',
            properties: {
              mainBlocks: {
                type: 'array',
                items: { type: 'object', properties: { questionCount: { type: 'integer' }, blockLabel: { type: 'string' } } }
              },
              profileBlockPoints: { type: 'number' },
              profileBlockQuestions: { type: 'number' }
            }
          }
        }
      },
      TrialPlanResponse: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                subjectId: { type: 'string' },
                subjectTitle: { type: 'string' },
                bookId: { type: 'string' },
                chapterId: { type: 'string' },
                nodeId: { type: 'string' },
                chapterTitle: { type: 'string' },
                topicTitle: { type: 'string' },
                questionCount: { type: 'integer' },
                trialBlockLabel: { type: 'string' },
                useFullBook: { type: 'boolean' }
              }
            }
          }
        }
      },
      EntQuestionType: {
        type: 'string',
        enum: [
          'single_choice',
          'multiple_choice',
          'matching_single',
          'matching_multiple',
          'short_answer',
          'text_input'
        ],
        description: 'Форматы заданий в духе ЕНТ (Казахстан)'
      },
      MatchingItem: {
        type: 'object',
        required: ['id', 'text'],
        properties: {
          id: { type: 'string' },
          text: { type: 'string' }
        }
      },
      GeneratedTestQuestion: {
        type: 'object',
        description: 'Вопрос без правильных ответов (как отдаёт API после генерации)',
        properties: {
          questionType: { $ref: '#/components/schemas/EntQuestionType' },
          questionText: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          matchingLeft: { type: 'array', items: { $ref: '#/components/schemas/MatchingItem' } },
          matchingRight: { type: 'array', items: { $ref: '#/components/schemas/MatchingItem' } },
          relatedContent: {
            type: 'object',
            properties: {
              pages: { type: 'array', items: { type: 'number' } },
              chapterId: { type: 'string' },
              topicId: { type: 'string' }
            }
          }
        }
      },
      GeneratedTest: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          subjectId: { type: 'string' },
          bookId: { type: 'string' },
          chapterId: { type: 'string' },
          testProfile: { $ref: '#/components/schemas/TestGenerationProfile' },
          questions: {
            type: 'array',
            items: { $ref: '#/components/schemas/GeneratedTestQuestion' }
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
                selectedOption: {
                  type: 'string',
                  description:
                    'Ответ: для single/short/text — строка; для multiple_choice — JSON-массив строк; для matching — JSON-объект с id'
                }
              }
            }
          },
          roadmapNodeId: { type: 'string', description: 'ID узла roadmap (если тест запущен из карты знаний)' },
          roadmapSessionId: { type: 'string', description: 'Уникальный ID roadmap-сессии (для идемпотентности)' },
          forTrial: {
            type: 'boolean',
            description:
              'Пробник: в `data` добавляется `trialTopicMastery` — темы с ≥ 80% верных по вопросам с привязкой к теме учебника (для POST /trial/apply-results)'
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
                    questionType: { $ref: '#/components/schemas/EntQuestionType' },
                    questionText: { type: 'string' },
                    options: { type: 'array', items: { type: 'string' } },
                    correctOption: {
                      type: 'string',
                      description: 'Текстовая сводка правильного ответа (все типы)'
                    },
                    selectedOption: { type: 'string' },
                    isCorrect: { type: 'boolean' },
                    explanation: { type: 'string' },
                    matchingLeft: { type: 'array', items: { $ref: '#/components/schemas/MatchingItem' } },
                    matchingRight: { type: 'array', items: { $ref: '#/components/schemas/MatchingItem' } }
                  }
                }
              },
              trialTopicMastery: {
                type: 'array',
                items: { $ref: '#/components/schemas/TrialTopicMasteryRow' },
                description: 'Только при `forTrial: true` в запросе — темы, по которым в этом тесте ≥ 80% верных (агрегат по вопросам с topicId)'
              },
              roadmap: { $ref: '#/components/schemas/TestSubmittedResponse' }
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
      },

      CanonicalRoadmapNode: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', example: 'geo-intro' },
          title: { type: 'string', example: 'Географическая оболочка и её границы' },
          prerequisites: { type: 'array', items: { type: 'string' }, example: [] },
          metadata: { type: 'object', description: 'Произвольные метаданные (chapterId, topicId и т.д.)' }
        }
      },
      CanonicalRoadmapResponse: {
        type: 'object',
        properties: {
          subjectId: { type: 'string' },
          version: { type: 'integer', example: 1 },
          nodes: { type: 'array', items: { $ref: '#/components/schemas/CanonicalRoadmapNode' } },
          sourceMeta: {
            type: 'object',
            properties: {
              bookId: { type: 'string' },
              bookTitle: { type: 'string' },
              bookAuthor: { type: 'string' },
              chapterTitle: { type: 'string' },
              fullBook: { type: 'boolean' },
              contentLanguage: { type: 'string' }
            }
          }
        }
      },
      PersonalRoadmapNode: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          title: { type: 'string' },
          prerequisites: { type: 'array', items: { type: 'string' } },
          metadata: { type: 'object' },
          availability: { type: 'string', enum: ['locked', 'available'] },
          mastered: { type: 'boolean', description: 'Освоено (порог обычного теста или пробника)' },
          chapterUrl: { type: 'string', description: 'Относительный путь к странице главы' },
          bookId: { type: 'string' },
          chapterId: { type: 'string' },
          testId: { type: 'string', description: 'Id сохранённого теста по главе, если есть' },
          isRecommended: { type: 'boolean' },
          recommendedPriority: { type: 'integer' },
          recommendedReason: { type: 'string', enum: ['CONTINUE_IN_PROGRESS', 'UNLOCKS_NEXT_TOPICS', 'LOW_MASTERY', 'PART_OF_MAIN_PATH', 'NOT_STARTED', ''] },
          aiHint: { type: 'string', description: 'ИИ-подсказка (при ?ai=1)' }
        }
      },
      NextRecommended: {
        type: 'object',
        nullable: true,
        properties: {
          nodeId: { type: 'string' },
          reason: { type: 'string' },
          priority: { type: 'integer' }
        }
      },
      PersonalRoadmapResponse: {
        type: 'object',
        properties: {
          version: { type: 'integer' },
          subjectId: { type: 'string' },
          nodes: { type: 'array', items: { $ref: '#/components/schemas/PersonalRoadmapNode' } },
          nextRecommended: { $ref: '#/components/schemas/NextRecommended' },
          topRecommendations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nodeId: { type: 'string' },
                title: { type: 'string' },
                reason: { type: 'string' },
                priority: { type: 'integer' }
              }
            }
          },
          ai: {
            type: 'object',
            description: 'ИИ-слой (при ?ai=1)',
            properties: {
              coachSummary: { type: 'string' },
              nextStepExplanation: { type: 'string' }
            }
          }
        }
      },
      TestSubmittedRequest: {
        type: 'object',
        required: ['subjectId', 'nodeId', 'score', 'sessionId'],
        properties: {
          subjectId: { type: 'string', description: 'MongoDB ObjectId предмета' },
          nodeId: { type: 'string', description: 'ID узла canonical roadmap' },
          score: { type: 'number', minimum: 0, maximum: 100, description: 'Процент правильных ответов' },
          sessionId: { type: 'string', description: 'Уникальный ID сессии (для идемпотентности)' },
          submittedAt: { type: 'string', format: 'date-time', description: 'Время сдачи (опционально, по умолчанию now)' }
        }
      },
      TestSubmittedResponse: {
        type: 'object',
        properties: {
          idempotent: { type: 'boolean', description: 'true если повторный submit с тем же sessionId' },
          updatedNodesDelta: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nodeId: { type: 'string' },
                mastered: { type: 'boolean' }
              }
            }
          },
          nextRecommended: { $ref: '#/components/schemas/NextRecommended' },
          topRecommendations: { type: 'array', items: { type: 'object' } }
        }
      },
      UpsertCanonicalRequest: {
        type: 'object',
        required: ['subjectId', 'nodes'],
        properties: {
          subjectId: { type: 'string' },
          version: { type: 'integer', minimum: 1, description: 'Версия (авто-инкремент если не указана)' },
          nodes: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['nodeId', 'title'],
              properties: {
                nodeId: { type: 'string' },
                title: { type: 'string' },
                prerequisites: { type: 'array', items: { type: 'string' } },
                metadata: { type: 'object' }
              }
            }
          }
        }
      },
      GenerateCanonicalRequest: {
        type: 'object',
        required: ['subjectId', 'bookId'],
        properties: {
          subjectId: { type: 'string' },
          bookId: { type: 'string' },
          chapterId: { type: 'string' },
          fullBook: { type: 'boolean', default: false }
        }
      },
      RoadmapLessonVideo: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          durationSec: { type: 'number' },
          posterUrl: { type: 'string' }
        }
      },
      RoadmapLessonResponse: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          lessonId: { type: 'string', description: 'Внутренний id контента (или совпадает с nodeId)' },
          title: { type: 'string' },
          summary: { type: 'string', description: 'Краткая выжимка (Markdown), кэшируется после ИИ' },
          content: { type: 'string', description: 'Основной текст; HTML при хранении приводится к тексту для единого формата' },
          textFormat: { type: 'string', enum: ['markdown'], description: 'Договорённость API: markdown' },
          video: { oneOf: [{ type: 'null' }, { $ref: '#/components/schemas/RoadmapLessonVideo' }] },
          readCompletedAt: { type: 'string', format: 'date-time', nullable: true }
        }
      },
      RoadmapLessonReadResponse: {
        type: 'object',
        properties: {
          readCompletedAt: { type: 'string', format: 'date-time' }
        }
      },
      RoadmapNodeChatRequest: {
        type: 'object',
        required: ['subjectId', 'text'],
        properties: {
          subjectId: { type: 'string' },
          text: { type: 'string' },
          attachmentIds: { type: 'array', items: { type: 'string' }, description: 'ID вложений из POST …/chat/attachments' }
        }
      },
      RoadmapNodeChatReply: {
        type: 'object',
        properties: {
          reply: { type: 'string' }
        }
      },
      RoadmapChatAttachmentUploadResponse: {
        type: 'object',
        properties: {
          attachmentId: { type: 'string' }
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
    '/auth/login/admin': {
      post: {
        tags: ['Auth'],
        summary: 'Вход в админ-панель (только role=admin)',
        description: 'Принимает тот же JSON, что и `POST /auth/login`, но отклоняет не-админов (403), чтобы отделить публичную и админскую форму входа.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
        responses: {
          200: { description: 'Вход администратора, cookie установлена', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          401: { description: 'Неверные данные или учётка без пароля', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          403: { description: 'Пользователь не администратор', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
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
        parameters: [
          {
            name: 'subjectKind',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['main', 'profile'] },
            description: 'Фильтр: только основные или только профильные'
          }
        ],
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
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', maxLength: 200 },
                  description: { type: 'string', maxLength: 1000 },
                  subjectKind: { type: 'string', enum: ['main', 'profile'] }
                }
              }
            }
          }
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
        description:
          'Создаёт предмет со всей вложенной структурой. При `updateIfExists: true` и совпадении `title` — обновляет описание, subjectKind и дерево книг (ответ 200).',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ImportSubjectRequest' } } }
        },
        responses: {
          201: { description: 'Создан новый предмет', content: { 'application/json': { schema: { $ref: '#/components/schemas/ImportSubjectResponse' } } } },
          200: { description: 'Существующий предмет обновлён (updateIfExists: true)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ImportSubjectResponse' } } } },
          400: { description: 'Предмет уже существует без updateIfExists / невалидные данные', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Не авторизован' },
          403: { description: 'Нет прав (не admin)' }
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

    // ==================== SUBJECTS: UPDATE (PATCH) ====================
    '/subjects/{id}': {
      get: {
        tags: ['Subjects'],
        summary: 'Предмет по ID (полная структура)',
        description: 'Публичный. Возвращает предмет с полным деревом: books → chapters → topics → paragraphs.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Предмет', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/Subject' } } } } } },
          404: { description: 'Предмет не найден' }
        }
      },
      patch: {
        tags: ['Subjects'],
        summary: 'Обновить предмет (admin)',
        description: 'Частичное обновление: title, description, subjectKind (main | profile).',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  subjectKind: { type: 'string', enum: ['main', 'profile'] }
                }
              }
            }
          }
        },
        responses: { 200: { description: 'Обновлено' }, 404: { description: 'Не найден' } }
      },
      delete: {
        tags: ['Subjects'],
        summary: 'Удалить предмет (admin)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Удалено' }, 404: { description: 'Не найден' } }
      }
    },
    '/subjects/{subjectId}/books/{bookId}': {
      patch: {
        tags: ['Subjects'],
        summary: 'Обновить книгу (admin)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'subjectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'bookId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, author: { type: 'string' }, contentLanguage: { type: 'string' } } } } } },
        responses: { 200: { description: 'Обновлено' }, 404: { description: 'Не найдено' } }
      },
      delete: {
        tags: ['Subjects'],
        summary: 'Удалить книгу (admin)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'subjectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'bookId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Удалено' }, 404: { description: 'Не найдено' } }
      }
    },
    '/subjects/{subjectId}/books/{bookId}/chapters/{chapterId}': {
      patch: {
        tags: ['Subjects'],
        summary: 'Обновить главу (admin)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'subjectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'bookId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'chapterId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, order: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Обновлено' }, 404: { description: 'Не найдено' } }
      },
      delete: {
        tags: ['Subjects'],
        summary: 'Удалить главу (admin)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'subjectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'bookId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'chapterId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Удалено' }, 404: { description: 'Не найдено' } }
      }
    },
    '/subjects/{subjectId}/books/{bookId}/chapters/{chapterId}/topics/{topicId}': {
      patch: {
        tags: ['Subjects'],
        summary: 'Обновить тему (admin)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'subjectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'bookId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'chapterId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'topicId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' } } } } } },
        responses: { 200: { description: 'Обновлено' }, 404: { description: 'Не найдено' } }
      },
      delete: {
        tags: ['Subjects'],
        summary: 'Удалить тему (admin)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'subjectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'bookId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'chapterId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'topicId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Удалено' }, 404: { description: 'Не найдено' } }
      }
    },
    '/subjects/{subjectId}/books/{bookId}/chapters/{chapterId}/topics/{topicId}/paragraphs/{paragraphId}': {
      delete: {
        tags: ['Subjects'],
        summary: 'Удалить параграф (admin)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'subjectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'bookId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'chapterId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'topicId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'paragraphId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Удалено' }, 404: { description: 'Не найдено' } }
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
        description:
          'С `forTrial: true` в теле (режим пробника) в `data` возвращается `trialTopicMastery` — темы с ≥ 80% за этот тест. С `roadmapNodeId` + `roadmapSessionId` — также `roadmap` (дельта узлов, рекомендации).',
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
        description: 'С `forTrial: true` — в ответе `data.trialTopicMastery` для накопления и POST /trial/apply-results после регистрации.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SubmitTestRequest' } } } },
        responses: {
          200: { description: 'Результат теста (не сохраняется)', content: { 'application/json': { schema: { $ref: '#/components/schemas/SubmitTestResponse' } } } }
        }
      }
    },
    '/tests/solo/start': {
      post: {
        tags: ['Tests'],
        summary: 'Старт Solo-теста (daily pack / practice, WebSocket)',
        description: 'Тело как у генерации теста плюс обязательное поле `mode`. Далее сокет: solo:join / solo:answer / solo:finish.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['subjectId', 'bookId', 'mode'],
                properties: {
                  subjectId: { type: 'string' },
                  bookId: { type: 'string' },
                  chapterId: { type: 'string' },
                  fullBook: { type: 'boolean' },
                  testProfile: { $ref: '#/components/schemas/TestGenerationProfile' },
                  questionCount: { type: 'integer' },
                  mode: { type: 'string', enum: ['daily_pack', 'practice'] }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Сессия Solo, таймер и т.д.',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/GeneratedTest' } } } } }
          }
        }
      }
    },
    '/tests/solo/answer': {
      post: {
        tags: ['Tests'],
        summary: 'Отправить ответ в Solo-сессии (без тела submit как в обычном тесте)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['soloSessionId', 'questionIndex'],
                properties: {
                  soloSessionId: { type: 'string' },
                  questionIndex: { type: 'integer', minimum: 0 },
                  selectedOption: { type: 'string' }
                }
              }
            }
          }
        },
        responses: { 200: { description: 'ACK ответа' } }
      }
    },
    '/tests/solo/finish': {
      post: {
        tags: ['Tests'],
        summary: 'Завершить Solo-сессию (итог, рейтинг)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['soloSessionId'], properties: { soloSessionId: { type: 'string' } } } } } },
        responses: { 200: { description: 'Результат и solo-мета', content: { 'application/json': { schema: { $ref: '#/components/schemas/SubmitTestResponse' } } } } }
      }
    },
    '/tests/solo/leaderboard': {
      get: {
        tags: ['Tests'],
        summary: 'Таблица лидеров Solo (daily pack)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'dailyPackId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['today', 'week'] } }
        ],
        responses: { 200: { description: 'Топ и позиция пользователя' } }
      }
    },

    // ==================== TRIAL (пробник ВНО) ====================
    '/trial/config': {
      get: {
        tags: ['Trial'],
        summary: 'Конфиг пробника: main/profile предметы, entTrialInfo',
        description: 'Без auth — общий список. С JWT (cookie или Bearer) в ответе может быть `pairedProfileIds` из пары предметов пользователя.',
        security: [],
        responses: {
          200: {
            description: 'Конфиг',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/TrialConfigResponse' } } } } }
          }
        }
      }
    },
    '/trial/plan': {
      post: {
        tags: ['Trial'],
        summary: 'Построить план из 5 блоков (2 профильных id)',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { type: 'object', required: ['profileSubjectIds'], properties: { profileSubjectIds: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 } } } }
          }
        },
        responses: {
          200: { description: 'План', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/TrialPlanResponse' } } } } } },
          400: { description: 'Нужны 2 разных profile subject id' }
        }
      }
    },
    '/trial/apply-results': {
      post: {
        tags: ['Trial'],
        summary: 'Перенести результаты пробника на personal roadmap (освоенные темы)',
        description:
          'Принимает строки `subjectId`, `nodeId` (тема), `scorePercent` ≥ 80. Обычно наполняется из агрегатов `trialTopicMastery` с шагов пробника. Требуется auth.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TrialApplyResultsRequest' } } } },
        responses: {
          200: {
            description: 'Прогресс обновлён',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/TrialApplyResultsResponse' } } } } }
          },
          400: { description: 'Пустой или невалидный `results`' }
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

    // ==================== ROADMAPS ====================
    '/roadmaps/canonical': {
      get: {
        tags: ['Roadmaps'],
        summary: 'Canonical roadmap (карта знаний по предмету)',
        description: 'Статичная структура тем по предмету (одинакова для всех). Кэшируема.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'subjectId', in: 'query', required: true, schema: { type: 'string' }, description: 'MongoDB ObjectId предмета' }],
        responses: {
          200: { description: 'Canonical roadmap', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/CanonicalRoadmapResponse' } } } } } },
          404: { description: 'Roadmap не настроен для предмета' }
        }
      }
    },
    '/roadmaps/personal': {
      get: {
        tags: ['Roadmaps'],
        summary: 'Personal roadmap (прогресс пользователя)',
        description: 'Персональная проекция canonical roadmap: узлы с состояниями (locked/available, not_started/in_progress/mastered), метриками и рекомендациями. При ?ai=1 — ИИ-подсказки.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'subjectId', in: 'query', required: true, schema: { type: 'string' }, description: 'MongoDB ObjectId предмета' },
          { name: 'ai', in: 'query', schema: { type: 'string', enum: ['0', '1'] }, description: '1 — включить ИИ-слой (coachSummary, aiHint)' }
        ],
        responses: {
          200: { description: 'Personal roadmap', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/PersonalRoadmapResponse' } } } } } },
          404: { description: 'Canonical roadmap не найден' }
        }
      }
    },
    '/roadmaps/next': {
      get: {
        tags: ['Roadmaps'],
        summary: 'Следующий рекомендуемый узел',
        description: 'Возвращает top-1 рекомендацию и альтернативы. При ?ai=1 — ИИ-пояснение.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'subjectId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'ai', in: 'query', schema: { type: 'string', enum: ['0', '1'] } }
        ],
        responses: {
          200: {
            description: 'Рекомендация',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        nextRecommended: { $ref: '#/components/schemas/NextRecommended' },
                        alternatives: { type: 'array', items: { type: 'object', properties: { nodeId: { type: 'string' }, title: { type: 'string' }, reason: { type: 'string' }, priority: { type: 'integer' } } } },
                        ai: { type: 'object', properties: { coachSummary: { type: 'string' }, nextStepExplanation: { type: 'string' } } }
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
    '/roadmaps/picker-subjects': {
      get: {
        tags: ['Roadmaps'],
        summary: 'Предметы для bottom sheet (пара профиля + агрегат прогресса)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { 200: { description: 'Список предметов' } }
      }
    },
    '/roadmaps/nodes/{nodeId}/acknowledge-material': {
      post: {
        tags: ['Roadmaps'],
        summary: '«Освоил» материал: сброс неудачных попыток теста по узлу',
        description:
          'Снимает блокировку повторного теста (lowScoreFailCount) при серии низких оценок по узлу карты. Тело: `subjectId`.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'nodeId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['subjectId'], properties: { subjectId: { type: 'string' } } } } }
        },
        responses: { 200: { description: 'Счётчик сброшен' }, 400: { description: 'Невалидные данные' } }
      }
    },
    '/roadmaps/nodes/{nodeId}/lesson': {
      get: {
        tags: ['Roadmaps'],
        summary: 'Урок по узлу roadmap',
        description:
          'Контент из canonical-узла: `metadata.lesson` или `description`. Выжимка summary генерируется ИИ и кэшируется в `metadata.lesson.summary`. Базовый путь API: `/api/v1/roadmaps/...`.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: 'nodeId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'subjectId', in: 'query', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Урок',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/RoadmapLessonResponse' }
                  }
                }
              }
            }
          },
          404: { description: 'Предмет или узел не найдены' }
        }
      }
    },
    '/roadmaps/nodes/{nodeId}/lesson/read': {
      post: {
        tags: ['Roadmaps'],
        summary: 'Отметить урок прочитанным',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'nodeId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['subjectId'],
                properties: { subjectId: { type: 'string' } }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Отметка сохранена',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/RoadmapLessonReadResponse' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/roadmaps/nodes/{nodeId}/chat/messages': {
      post: {
        tags: ['Roadmaps'],
        summary: 'Чат с ИИ по теме узла',
        description: 'Контекст на сервере: урок и предмет; без «интернет-режима». Можно прикрепить ранее загруженные изображения по attachmentIds.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'nodeId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RoadmapNodeChatRequest' } } }
        },
        responses: {
          200: {
            description: 'Ответ ассистента',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/RoadmapNodeChatReply' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/roadmaps/nodes/{nodeId}/chat/attachments': {
      post: {
        tags: ['Roadmaps'],
        summary: 'Загрузить изображение для чата узла',
        description: 'multipart/form-data: поле `file` + опционально поле `subjectId` (если указано — должно быть валидным Mongo id). Рекомендуется всегда передавать subjectId.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'nodeId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  subjectId: { type: 'string', description: 'MongoDB ObjectId предмета' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Файл сохранён',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/RoadmapChatAttachmentUploadResponse' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/roadmaps/events/test-submitted': {
      post: {
        tags: ['Roadmaps'],
        summary: 'Обработать завершение теста (обновить прогресс)',
        description: 'Идемпотентно по sessionId. Записывает attempt, пересчитывает mastery, разблокирует узлы, обновляет рекомендации. Также вызывается автоматически через POST /tests/submit при наличии roadmapNodeId.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TestSubmittedRequest' } } } },
        responses: {
          200: { description: 'Прогресс обновлён', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/TestSubmittedResponse' } } } } } },
          400: { description: 'Невалидные данные (nodeId, subjectId)' },
          404: { description: 'Canonical roadmap не найден' }
        }
      }
    },
    '/roadmaps/admin/canonical': {
      post: {
        tags: ['Roadmaps'],
        summary: 'Создать/обновить canonical roadmap вручную (admin)',
        description: 'Принимает JSON с узлами. Валидирует: уникальные nodeId, существующие prerequisites, отсутствие циклов.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpsertCanonicalRequest' } } } },
        responses: {
          201: { description: 'Canonical roadmap сохранён', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/CanonicalRoadmapResponse' } } } } } },
          400: { description: 'Невалидные данные (циклы, дубликаты nodeId и т.д.)' }
        }
      }
    },
    '/roadmaps/admin/generate-canonical': {
      post: {
        tags: ['Roadmaps'],
        summary: 'Сгенерировать canonical roadmap по книге через ИИ (admin)',
        description: 'Берёт текст книги/главы, через ИИ генерирует граф узлов и сохраняет. Аналогично генерации теста.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/GenerateCanonicalRequest' } } } },
        responses: {
          201: { description: 'Canonical roadmap сгенерирован ИИ', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/CanonicalRoadmapResponse' } } } } } },
          404: { description: 'Предмет или книга не найдены' }
        }
      }
    },
    '/roadmaps/admin/rebuild-from-topics': {
      post: {
        tags: ['Roadmaps'],
        summary: 'Пересобрать canonical из тем учебника (admin)',
        description:
          'Детерминированно строит узлы 1:1 с темами книг предмета (линейные prerequisites), обновляет CanonicalRoadmap в БД.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RebuildCanonicalFromTopicsRequest' } } }
        },
        responses: {
          200: {
            description: 'subjectId, version, nodesCount',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object' } } } } }
          },
          400: { description: 'Нет subjectId' }
        }
      }
    },

    // ==================== PROFILE SUBJECT PAIRS (каталог пар) ====================
    '/profile-subject-pairs': {
      get: {
        tags: ['Profile subject pairs'],
        summary: 'Список разрешённых пар профильных предметов',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          200: { description: 'Массив пар (populate title, subjectKind)', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/ProfileSubjectPair' } } } } } } }
        }
      },
      post: {
        tags: ['Profile subject pairs'],
        summary: 'Создать пару (admin)',
        description: 'Оба subjectId — предметы с subjectKind: profile, пара не дублирует существующую',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['subject1Id', 'subject2Id'],
                properties: { subject1Id: { type: 'string' }, subject2Id: { type: 'string' } }
              }
            }
          }
        },
        responses: {
          201: { description: 'Создано', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/ProfileSubjectPair' } } } } } }
        }
      }
    },
    '/profile-subject-pairs/{id}': {
      patch: {
        tags: ['Profile subject pairs'],
        summary: 'Обновить пару (admin)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { subject1Id: { type: 'string' }, subject2Id: { type: 'string' } } } } }
        },
        responses: { 200: { description: 'Обновлено' } }
      },
      delete: {
        tags: ['Profile subject pairs'],
        summary: 'Удалить пару (admin)',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Удалено' } }
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
    '/users/me/profile-subject-pair': {
      patch: {
        tags: ['Users'],
        summary: 'Привязать пару по id каталога или сбросить',
        description: 'Тело: profileSubjectPairId — Mongo id из GET /profile-subject-pairs, либо null или ""',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PatchProfileSubjectPairIdRequest' } } } },
        responses: { 200: { description: 'Пользователь обновлён' } }
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
