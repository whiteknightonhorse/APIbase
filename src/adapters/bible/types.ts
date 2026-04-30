/** Free Use Bible API (UC-399). MIT license, no auth, public domain texts. */
export interface BibleTranslation {
  id: string;
  name: string;
  englishName: string;
  language: string;
  languageName: string;
  languageEnglishName: string;
  shortName: string;
  textDirection: 'ltr' | 'rtl';
  numberOfBooks: number;
  totalNumberOfChapters: number;
  totalNumberOfVerses: number;
  listOfBooksApiLink: string;
  completeTranslationApiLink: string;
}

export interface BibleTranslationList {
  translations: BibleTranslation[];
}

export interface BibleBook {
  id: string;
  translationId: string;
  name: string;
  commonName: string;
  title: string;
  numberOfChapters: number;
  firstChapterApiLink: string;
}

export interface BibleBooksList {
  translation: BibleTranslation;
  books: BibleBook[];
}

export interface BibleVerse {
  type: 'verse';
  number: number;
  content: Array<string | { text?: string; noteId?: number }>;
}

export interface BibleChapter {
  translation: BibleTranslation;
  book: { id: string; name: string };
  chapter: {
    number: number;
    content: Array<BibleVerse | { type: string }>;
  };
}
