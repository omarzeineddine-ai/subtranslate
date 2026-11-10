/**
 * One subtitle cue: a timed block of text. The single canonical shape used by
 * the server pipeline, the client, the review editor, and the cleaner.
 * Cue numbers are not stored — they are positional, assigned at serialization
 * time by the SRT codec.
 */
export interface Cue {
  start: string;
  end: string;
  /** What the timestamp line holds after the end time, such as the
   * "X1:40 X2:600 Y1:20 Y2:50" box some files position cues with. Kept as
   * written so it survives into the output file. */
  settings?: string;
  text: string;
}
