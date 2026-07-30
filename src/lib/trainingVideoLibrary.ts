/**
 * Shared training-video library helpers.
 *
 * Videos can be linked to a User Manual chapter/section so the library can be
 * browsed by manual topic and the manual can deep-link to its own videos.
 */

import { supabase } from '@/integrations/supabase/client';
import { MANUAL } from '@/lib/userManualContent';

export interface TrainingVideoRecord {
  id: string;
  title: string;
  description: string | null;
  category: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  video_url: string;
  thumbnail_url: string | null;
  created_at: string;
  manual_chapter_id?: string | null;
  manual_section_id?: string | null;
  /** File this video pointed at before the last trim (used for undo). */
  previous_file_path?: string | null;
}

export const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  setup: 'Setup',
  messages: 'Messages',
  maintenance: 'Maintenance',
  troubleshooting: 'Troubleshooting',
};

export interface ManualTopicOption {
  chapterId: string;
  chapterTitle: string;
  sectionId: string;
  sectionTitle: string;
  value: string; // `${chapterId}::${sectionId}`
}

/** Flat list of every manual section, for topic pickers. */
export const MANUAL_TOPIC_OPTIONS: ManualTopicOption[] = MANUAL.flatMap(chapter =>
  chapter.sections.map(section => ({
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    sectionId: section.id,
    sectionTitle: section.title,
    value: `${chapter.id}::${section.id}`,
  })),
);

export const MANUAL_CHAPTER_TITLES: Record<string, string> = Object.fromEntries(
  MANUAL.map(c => [c.id, c.title]),
);

export function manualSectionTitle(chapterId?: string | null, sectionId?: string | null): string | null {
  if (!chapterId) return null;
  const chapter = MANUAL.find(c => c.id === chapterId);
  if (!chapter) return null;
  const section = sectionId ? chapter.sections.find(s => s.id === sectionId) : undefined;
  return section ? `${chapter.title} › ${section.title}` : chapter.title;
}

/** Fetch all published training videos (public read via edge function). */
export async function fetchTrainingVideos(): Promise<TrainingVideoRecord[]> {
  const { data, error } = await supabase.functions.invoke('training-videos', { method: 'GET' });
  if (error) throw error;
  return (data as TrainingVideoRecord[]) || [];
}

/** Videos attached to a given manual section (falls back to chapter-level matches). */
export function videosForSection(
  videos: TrainingVideoRecord[],
  chapterId: string,
  sectionId: string,
): TrainingVideoRecord[] {
  return videos.filter(
    v => v.manual_chapter_id === chapterId && (v.manual_section_id === sectionId || !v.manual_section_id),
  );
}

export interface VideoGroup {
  key: string;
  title: string;
  videos: TrainingVideoRecord[];
}

/** Group videos by manual chapter, keeping manual order; unlinked videos go last. */
export function groupVideosByChapter(videos: TrainingVideoRecord[]): VideoGroup[] {
  const groups: VideoGroup[] = [];
  for (const chapter of MANUAL) {
    const items = videos.filter(v => v.manual_chapter_id === chapter.id);
    if (items.length) groups.push({ key: chapter.id, title: chapter.title, videos: items });
  }
  const unlinked = videos.filter(v => !v.manual_chapter_id || !MANUAL_CHAPTER_TITLES[v.manual_chapter_id]);
  if (unlinked.length) groups.push({ key: '__other', title: 'Other / Unfiled', videos: unlinked });
  return groups;
}

export function formatVideoTime(s: number | null | undefined): string {
  if (!s) return '--:--';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
