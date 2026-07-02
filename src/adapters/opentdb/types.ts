export interface OpenTdbQuestion {
  type: 'multiple' | 'boolean';
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

export interface OpenTdbQuestionsResponse {
  response_code: number;
  results: OpenTdbQuestion[];
}

export interface OpenTdbCategory {
  id: number;
  name: string;
}

export interface OpenTdbCategoriesResponse {
  trivia_categories: OpenTdbCategory[];
}

export interface OpenTdbCategoryCount {
  total_question_count: number;
  total_easy_question_count: number;
  total_medium_question_count: number;
  total_hard_question_count: number;
}

export interface OpenTdbCategoryCountResponse {
  category_id: number;
  category_question_count: OpenTdbCategoryCount;
}

export interface OpenTdbGlobalCategoryCount {
  total_num_of_questions: number;
  total_num_of_pending_questions: number;
  total_num_of_verified_questions: number;
  total_num_of_rejected_questions: number;
}

export interface OpenTdbGlobalCountResponse {
  overall: OpenTdbGlobalCategoryCount;
  categories: Record<string, OpenTdbGlobalCategoryCount>;
}
