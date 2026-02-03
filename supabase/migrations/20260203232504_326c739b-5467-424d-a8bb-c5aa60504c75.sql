-- Add unique constraint on ml_question_id for upsert to work
ALTER TABLE public.qa_questions ADD CONSTRAINT qa_questions_ml_question_id_key UNIQUE (ml_question_id);