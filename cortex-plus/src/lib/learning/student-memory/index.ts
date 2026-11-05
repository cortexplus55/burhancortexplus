/**
 * Öğrenci öğrenme hafızası (5 Kasım 2026) — tek giriş.
 *
 * - `error-kinds`: yanlış cevabın yapısal türü (modelsiz), etiket ve öğretmen talimatı.
 * - `attempt-errors`: tamamlanmış kayıttan yanlışlar.
 * - `summary`: saf özet kurucu, tip ve sınırlar.
 * - `prompt`: öğretmene giden en çok üç satır.
 * - `store`: kayıt okuma ve arka planda yenileme.
 */
export {
  classifyWrongAnswer,
  ERROR_KINDS,
  errorKindCoachLine,
  errorKindLabel,
  HURRIED_MS,
  isErrorKind,
  optionNumber,
  type ErrorKind,
  type WrongAnswerInput,
} from "./error-kinds";
export { scanAttemptErrors, type AttemptErrorScan } from "./attempt-errors";
export {
  buildStudentMemory,
  isEmptyMemory,
  MEMORY_LIMITS,
  parseStudentMemory,
  STUDENT_MEMORY_VERSION,
  WEAK_OUTCOME_MIN_N,
  type ErrorKindCount,
  type MemoryInputs,
  type MemoryPace,
  type MemoryStyle,
  type OpenMisconception,
  type RepeatedMistakeTopic,
  type StudentMemory,
  type WeakOutcome,
} from "./summary";
export { MEMORY_HEADER, MEMORY_LINE_MAX, studentMemoryBlock, studentMemoryLines } from "./prompt";
export { loadStudentMemory, MEMORY_ATTEMPT_LIMIT, MEMORY_TABLE, MEMORY_WINDOW_DAYS, refreshStudentMemory } from "./store";
