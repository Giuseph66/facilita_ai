import { z } from 'zod';

const uuid = z.string().uuid();

export const conversationInputSchema = z.object({
  kind: z.enum(['STUDENT_TUTOR', 'TEACHER_ASSISTANT']),
  courseId: uuid.optional(),
  documentIds: z.array(uuid).max(20).default([]),
}).strict();

export const messageInputSchema = z.object({
  content: z.string().trim().min(1).max(8_000),
  clientMessageId: z.string().trim().min(1).max(120),
}).strict();

export const studyArtifactInputSchema = z.object({
  kind: z.enum(['SUMMARY', 'EXPLANATION', 'FLASHCARDS', 'STUDY_PLAN', 'REVIEW', 'SIMILAR_EXERCISES', 'PRACTICE_TEST']),
  courseId: uuid,
  documentIds: z.array(uuid).max(20).default([]),
  configuration: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const practiceSubmissionSchema = z.object({
  answers: z.array(z.object({ questionId: uuid, optionId: z.string().min(1).max(100) }).strict()).max(50),
}).strict();

export type ConversationInput = z.infer<typeof conversationInputSchema>;
export type MessageInput = z.infer<typeof messageInputSchema>;
export type StudyArtifactInput = z.infer<typeof studyArtifactInputSchema>;
export type PracticeSubmission = z.infer<typeof practiceSubmissionSchema>;
