/**
 * Judge0 CE Code Execution types (UC-238).
 * Sandboxed code execution — 71 languages.
 */

export interface Judge0Submission {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  status: {
    id: number;
    description: string;
  };
  time: string | null;
  memory: number | null;
}

export interface Judge0Language {
  id: number;
  name: string;
}

// Normalized outputs

export interface CodeExecuteOutput {
  status: string;
  stdout: string;
  stderr: string;
  compile_output: string;
  execution_time_sec: number | null;
  memory_kb: number | null;
  success: boolean;
}

export interface CodeLanguagesOutput {
  languages: Array<{
    id: number;
    name: string;
  }>;
  total: number;
}
