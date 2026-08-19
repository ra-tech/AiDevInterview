import { z } from 'zod';

export const TargetRoleValues = [
  'FRONTEND_DEVELOPER',
  'BACKEND_DEVELOPER',
  'FULL_STACK_DEVELOPER',
  'SOFTWARE_DEVELOPMENT_ENGINEER',
  'DATA_ENGINEER',
  'EMBEDDED_SOFTWARE_ENGINEER'
];

export const ExperienceLevelValues = ['INTERN', 'ENTRY_LEVEL', 'ONE_TO_THREE_YEARS', 'THREE_TO_FIVE_YEARS'];

export const DurationValues = [15, 30, 45, 60];

export const CreateInterviewSchema = z.object({
  targetRole: z.enum(TargetRoleValues),
  experienceLevel: z.enum(ExperienceLevelValues),
  skills: z.array(z.string().min(1)).min(1, 'Select at least one skill'),
  durationMinutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
  jobDescriptionText: z.string().max(20000).optional(), // hard cap protects prompt size + cost
  resumeText: z.string().max(20000).optional()
});

export const SubmitAnswerSchema = z.object({
  content: z.string().min(1, 'Answer cannot be empty').max(8000)
});
