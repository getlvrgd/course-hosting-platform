/**
 * The shapes the catalog hands to the components.
 *
 * Split out of src/lib/catalog.ts because that file is `server-only` — it opens the
 * database — and a client component still has to be able to name what it was given.
 */

export { formatDuration } from "./course";

export type CourseCard = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  visibility: string;
  accent: string;
  position: number;
  chapters: number;
  lessons: number;
  seconds: number;
  /** Whole percent for the person asking. Zero on the admin grid, which has no student. */
  progress: number;
  completed: number;
};

export type StudentRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  lastSeenAt: Date | null;
  lastActiveAt: Date | null;
  /** Across every published course. */
  percent: number;
  completed: number;
  lessons: number;
  /** Courses they have finished outright. */
  coursesDone: number;
};
