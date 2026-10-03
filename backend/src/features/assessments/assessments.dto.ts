import { z } from 'zod';

const uuid = z.string().uuid();
const questionOptionSchema = z.object({ id: z.string().trim().min(1).max(80), text: z.string().trim().min(1).max(1_000) }).strict();
const questionAnswerSchema = z.object({
  correctOptionId: z.string().trim().min(1).max(80).optional(),
  expectedAnswer: z.string().trim().min(1).max(4_000).optional(),
  rubric: z.union([z.string().trim().min(1).max(4_000), z.record(z.string(), z.unknown())]).optional(),
}).strict();

export const assessmentInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  kind: z.enum(['QUIZ', 'EXAM', 'ASSIGNMENT']),
  classId: uuid.optional(),
}).strict();

export const assessmentPatchSchema = z.object({
  revision: z.number().int().positive(),
  title: z.string().trim().min(1).max(160).optional(),
  state: z.enum(['DRAFT', 'READY', 'PUBLISHED', 'ARCHIVED']).optional(),
}).strict().refine(value => value.title !== undefined || value.state !== undefined);

const assessmentQuestionSchema = z.object({
  type: z.enum(['MULTIPLE_CHOICE', 'SHORT_ANSWER', 'ESSAY']),
  statement: z.string().trim().min(1).max(4_000),
  options: z.array(questionOptionSchema).max(8).default([]),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  points: z.number().finite().positive().max(1_000),
  answer: questionAnswerSchema,
}).strict().superRefine((question, context) => {
  const optionIds = question.options.map(option => option.id);
  if (new Set(optionIds).size !== optionIds.length) context.addIssue({ code: 'custom', path: ['options'], message: 'Opções duplicadas.' });
  if (question.type === 'MULTIPLE_CHOICE') {
    if (question.options.length < 2 || !question.answer.correctOptionId || !optionIds.includes(question.answer.correctOptionId)) {
      context.addIssue({ code: 'custom', path: ['answer'], message: 'O gabarito precisa apontar para uma opção válida.' });
    }
  } else {
    if (question.options.length !== 0) context.addIssue({ code: 'custom', path: ['options'], message: 'Este tipo não aceita alternativas.' });
    if (!question.answer.expectedAnswer && question.answer.rubric === undefined) {
      context.addIssue({ code: 'custom', path: ['answer'], message: 'Informe uma resposta esperada ou rubrica.' });
    }
  }
});

export const assessmentQuestionsInputSchema = z.object({
  revision: z.number().int().positive(),
  questions: z.array(assessmentQuestionSchema).min(1).max(100),
}).strict();

export const assessmentGenerationInputSchema = z.object({
  revision: z.number().int().positive(),
  totalQuestions: z.number().int().min(1).max(50),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'MIXED']),
  distribution: z.object({
    MULTIPLE_CHOICE: z.number().int().min(0).max(50),
    SHORT_ANSWER: z.number().int().min(0).max(50),
    ESSAY: z.number().int().min(0).max(50),
  }).strict(),
  documentIds: z.array(uuid).min(1).max(20),
  instructions: z.string().trim().max(1_500).optional(),
}).strict().superRefine((input, context) => {
  const total = Object.values(input.distribution).reduce((sum, count) => sum + count, 0);
  if (total !== input.totalQuestions) context.addIssue({ code: 'custom', path: ['distribution'], message: 'A distribuição precisa somar a quantidade total.' });
  if (new Set(input.documentIds).size !== input.documentIds.length) context.addIssue({ code: 'custom', path: ['documentIds'], message: 'Selecione cada documento uma única vez.' });
});

export const assessmentCopyInputSchema = z.object({
  revision: z.number().int().positive(),
  title: z.string().trim().min(1).max(160),
  variantLabel: z.string().trim().min(1).max(80).optional(),
}).strict();

export const blueprintInputSchema = z.object({
  revision: z.number().int().positive().optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'MIXED']),
  topics: z.array(z.object({ courseTopicId: uuid, competencyCode: z.string().trim().max(100).default('') }).strict()).min(1).max(100),
}).strict().superRefine((input, context) => {
  const topicIds = input.topics.map(topic => topic.courseTopicId);
  if (new Set(topicIds).size !== topicIds.length) context.addIssue({ code: 'custom', path: ['topics'], message: 'Selecione cada assunto uma única vez.' });
});

export const blueprintPublicationSchema = z.object({ revision: z.number().int().positive() }).strict();

export type AssessmentInput = z.infer<typeof assessmentInputSchema>;
export type AssessmentPatch = z.infer<typeof assessmentPatchSchema>;
export type AssessmentQuestionInput = z.infer<typeof assessmentQuestionSchema>;
export type AssessmentQuestionsInput = z.infer<typeof assessmentQuestionsInputSchema>;
export type AssessmentGenerationInput = z.infer<typeof assessmentGenerationInputSchema>;
export type AssessmentCopyInput = z.infer<typeof assessmentCopyInputSchema>;
export type BlueprintInput = z.infer<typeof blueprintInputSchema>;
