/** Dictionary API types (UC-313 Free Dictionary + UC-314 Datamuse). */

export interface DictMeaning {
  partOfSpeech: string;
  definitions: { definition: string; example?: string }[];
  synonyms: string[];
  antonyms: string[];
}

export interface DictDefineOutput {
  word: string;
  phonetic: string;
  audio: string;
  meanings: {
    part_of_speech: string;
    definitions: { definition: string; example: string }[];
    synonyms: string[];
    antonyms: string[];
  }[];
}

export interface DictWordsOutput {
  words: { word: string; score: number; tags: string[] }[];
  count: number;
}
