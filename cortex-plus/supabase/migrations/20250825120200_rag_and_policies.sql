-- Vector similarity search scoped to the requesting user's own documents.
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  p_user_id uuid,
  p_query_embedding vector(1536),
  p_match_count integer DEFAULT 5
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  file_name text,
  content text,
  similarity double precision
) AS $$
  SELECT
    dc.id,
    dc.document_id,
    d.file_name,
    dc.content,
    1 - (de.embedding <=> p_query_embedding) AS similarity
  FROM public.document_embeddings de
  JOIN public.document_chunks dc ON dc.id = de.chunk_id
  JOIN public.documents d ON d.id = dc.document_id
  WHERE d.user_id = p_user_id
    AND d.deleted_at IS NULL
  ORDER BY de.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(p_match_count, 20));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Remaining user-scoped tables need RLS as well.
ALTER TABLE public.document_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plan_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mastery_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weak_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_preps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

-- Document sub-tables inherit ownership from the parent document.
CREATE POLICY doc_pages_own ON public.document_pages FOR ALL USING (
  EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid())
);
CREATE POLICY doc_chunks_own ON public.document_chunks FOR ALL USING (
  EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid())
);
CREATE POLICY doc_embeddings_own ON public.document_embeddings FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.document_chunks dc
    JOIN public.documents d ON d.id = dc.document_id
    WHERE dc.id = chunk_id AND d.user_id = auth.uid()
  )
);
CREATE POLICY jobs_own ON public.processing_jobs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid())
);

CREATE POLICY quiz_questions_own ON public.quiz_questions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND q.user_id = auth.uid())
);
CREATE POLICY quiz_attempts_own ON public.quiz_attempts FOR ALL USING (user_id = auth.uid());
CREATE POLICY quiz_answers_own ON public.quiz_answers FOR ALL USING (
  EXISTS (SELECT 1 FROM public.quiz_attempts a WHERE a.id = attempt_id AND a.user_id = auth.uid())
);

CREATE POLICY flashcards_own ON public.flashcards FOR ALL USING (
  EXISTS (SELECT 1 FROM public.flashcard_sets s WHERE s.id = set_id AND s.user_id = auth.uid())
);
CREATE POLICY flashcard_reviews_own ON public.flashcard_reviews FOR ALL USING (user_id = auth.uid());

CREATE POLICY exam_questions_own ON public.practice_exam_questions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.practice_exams e WHERE e.id = exam_id AND e.user_id = auth.uid())
);
CREATE POLICY exam_attempts_own ON public.practice_exam_attempts FOR ALL USING (user_id = auth.uid());

CREATE POLICY plan_tasks_own ON public.study_plan_tasks FOR ALL USING (
  EXISTS (SELECT 1 FROM public.study_plans p WHERE p.id = plan_id AND p.user_id = auth.uid())
);

CREATE POLICY goals_own ON public.learning_goals FOR ALL USING (user_id = auth.uid());
CREATE POLICY progress_own ON public.user_progress FOR ALL USING (user_id = auth.uid());
CREATE POLICY mastery_own ON public.mastery_scores FOR ALL USING (user_id = auth.uid());
CREATE POLICY weak_own ON public.weak_topics FOR ALL USING (user_id = auth.uid());
CREATE POLICY exam_preps_own ON public.exam_preps FOR ALL USING (user_id = auth.uid());
CREATE POLICY consent_own ON public.consent_records FOR ALL USING (user_id = auth.uid());
CREATE POLICY deletion_own ON public.data_deletion_requests FOR ALL USING (user_id = auth.uid());
CREATE POLICY support_own ON public.support_requests FOR ALL USING (
  user_id = auth.uid() OR public.is_admin(auth.uid())
);
CREATE POLICY promo_redemptions_own ON public.promo_redemptions FOR SELECT USING (user_id = auth.uid());

CREATE POLICY attachments_own ON public.message_attachments FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.id = message_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY usage_own ON public.ai_usage_events FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin(auth.uid())
);
CREATE POLICY subs_own ON public.subscriptions FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin(auth.uid())
);
CREATE POLICY reservations_own ON public.credit_reservations FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin(auth.uid())
);
CREATE POLICY verifications_read ON public.teacher_verifications FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin(auth.uid())
);

-- Classrooms: teachers manage, students read their own membership.
CREATE POLICY classroom_members_scope ON public.classroom_members FOR ALL USING (
  student_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = classroom_id AND c.teacher_id = auth.uid())
  OR public.is_admin(auth.uid())
);
CREATE POLICY assignments_scope ON public.assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = classroom_id AND c.teacher_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.classroom_members m
    WHERE m.classroom_id = assignments.classroom_id AND m.student_id = auth.uid()
  )
);
CREATE POLICY submissions_scope ON public.assignment_submissions FOR ALL USING (
  student_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.assignments a
    JOIN public.classrooms c ON c.id = a.classroom_id
    WHERE a.id = assignment_id AND c.teacher_id = auth.uid()
  )
);

-- Reference data is world-readable; writes stay on the service role.
CREATE POLICY subjects_read ON public.subjects FOR SELECT USING (true);
CREATE POLICY topics_read ON public.topics FOR SELECT USING (true);
CREATE POLICY credit_rules_read ON public.credit_rules FOR SELECT USING (active = true);
CREATE POLICY feature_flags_read ON public.feature_flags FOR SELECT USING (true);
CREATE POLICY audit_admin_only ON public.audit_logs FOR SELECT USING (public.is_admin(auth.uid()));

-- Idempotent credit purchases: one ledger row per merchant order.
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_purchase_key
  ON public.credit_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_user_idx ON public.documents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS conversations_user_idx ON public.conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS ledger_user_idx ON public.credit_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_user_idx ON public.ai_usage_events (user_id, created_at DESC);
