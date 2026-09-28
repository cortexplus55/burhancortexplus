import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "sk-test-secret-key-do-not-leak";

describe("Jev client official request shape", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function loadWithEnv(envPatch: Record<string, unknown>) {
    vi.doMock("@/lib/env", () => ({
      env: {
        TYPESAFE_API_KEY: SECRET,
        AI_GATEWAY_API_KEY: undefined,
        JEV_ACCESS: "typesafe",
        JEV_BASE_URL: undefined,
        JEV_MODEL: undefined,
        JEV_TIMEOUT_MS: 2000,
        JEV_ENABLED: true,
        JEV_SHADOW_MODE: false,
        JEV_MIN_CONFIDENCE: 0.45,
        DECISION_PROVIDER: "auto",
        ...envPatch,
      },
      parseJevAccess: (v: string | undefined) => {
        const x = (v ?? "auto").toLowerCase();
        return x === "typesafe" || x === "gateway" ? x : "auto";
      },
    }));
    return import("@/lib/adaptive/jev/client");
  }

  const officialAnswers = {
    model: "jev-1.13.0",
    answers: {
      next_action: {
        type: "choice",
        choice: "practice",
        probabilities: { practice: 0.7, reteach: 0.3 },
        confidence: 0.55,
      },
      teaching_mode: {
        type: "choice",
        choice: "step_by_step",
        probabilities: { step_by_step: 1 },
        confidence: 0.9,
      },
      difficulty: {
        type: "choice",
        choice: "medium",
        probabilities: { medium: 1 },
        confidence: 0.8,
      },
      misconception_severity: {
        type: "score",
        score: 1.05,
        legend: {
          "0": "None",
          "1": "Minor slip",
          "2": "Clear",
          "3": "Deep",
        },
        probabilities: { "0": 0, "1": 0.95, "2": 0.05, "3": 0 },
        confidence: 0.92,
      },
      needs_prerequisite_review: { type: "noul", noul: 0.2 },
      ready_to_advance: { type: "noul", noul: 0.6 },
      needs_gpt4o: { type: "noul", noul: 0.1 },
      needs_daily_replan: { type: "noul", noul: 0.05 },
    },
    usage: { input_tokens: 400, output_tokens: 30 },
  };

  it("sends questions as a map with instructions and criteria", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => officialAnswers,
    });
    vi.stubGlobal("fetch", fetchMock);

    const { callJevSystemOne, defaultJevQuestions } = await loadWithEnv({});
    const allowed = ["practice", "reteach", "teach"] as const;
    const r = await callJevSystemOne({
      state: {
        student: {
          exam_days_remaining: 10,
          session_minutes_remaining: 20,
          fatigue_signal: 0.1,
        },
        objective: {
          topic_id: "t",
          mastery: 0.4,
          mastery_confidence: 0.5,
          recent_accuracy: 0.5,
          attempt_count: 2,
        },
        evidence: {
          last_answer_correct: false,
          hint_count: 0,
          repeated_misconception: false,
        },
        plan: { today_target: "x", behind_schedule: false },
        allowed_actions: [...allowed],
      },
      questions: defaultJevQuestions([...allowed]),
    });

    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${SECRET}`,
    );
    const body = JSON.parse(String(init.body)) as {
      model: string;
      questions: Record<string, { type: string; instructions?: string; criteria?: unknown }>;
      providerOptions?: unknown;
    };
    expect(body.model).toBe("jev-1.13.0");
    expect(Array.isArray(body.questions)).toBe(false);
    expect(body.questions.next_action.type).toBe("choice");
    expect(typeof body.questions.next_action.instructions).toBe("string");
    expect(body.questions.next_action.criteria).toMatchObject({
      practice: expect.any(String),
    });
    expect(body.questions.misconception_severity.type).toBe("score");
    expect(Array.isArray(body.questions.misconception_severity.criteria)).toBe(
      true,
    );
    expect(body.providerOptions).toBeUndefined();
    if (r.ok) {
      expect(r.usage.inputTokens).toBe(400);
      expect(r.model).toBe("jev-1.13.0");
      expect(r.access).toBe("typesafe");
    }
  });

  it("uses gateway URL, model, and zeroDataRetention", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({
        ...officialAnswers,
        model: "typesafe-ai/jev",
        provider_metadata: { gateway: { cost: "0.00002" } },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { callJevSystemOne, defaultJevQuestions } = await loadWithEnv({
      TYPESAFE_API_KEY: undefined,
      AI_GATEWAY_API_KEY: SECRET,
      JEV_ACCESS: "gateway",
    });
    const allowed = ["practice", "reteach"] as const;
    const r = await callJevSystemOne({
      state: {
        student: {
          exam_days_remaining: 1,
          session_minutes_remaining: 5,
          fatigue_signal: 0,
        },
        objective: {
          topic_id: "t",
          mastery: 0.2,
          mastery_confidence: 0.2,
          recent_accuracy: null,
          attempt_count: 1,
        },
        evidence: {
          last_answer_correct: null,
          hint_count: 0,
          repeated_misconception: false,
        },
        plan: { today_target: "y", behind_schedule: false },
        allowed_actions: [...allowed],
      },
      questions: defaultJevQuestions([...allowed]),
    });
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
    );
    const body = JSON.parse(String(init.body)) as {
      model: string;
      providerOptions: { gateway: { zeroDataRetention: boolean } };
    };
    expect(body.model).toBe("typesafe-ai/jev");
    expect(body.providerOptions.gateway.zeroDataRetention).toBe(true);
    if (r.ok) expect(r.gatewayCostUsd).toBeCloseTo(0.00002);
  });

  it("does not retry 422 and never leaks the API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      headers: new Headers(),
      json: async () => ({
        message: `bad request for key ${SECRET}`,
        error_type: "invalid_request",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { callJevSystemOne, defaultJevQuestions } = await loadWithEnv({});
    const r = await callJevSystemOne({
      state: {
        student: {
          exam_days_remaining: 1,
          session_minutes_remaining: 5,
          fatigue_signal: 0,
        },
        objective: {
          topic_id: "t",
          mastery: 0,
          mastery_confidence: 0,
          recent_accuracy: null,
          attempt_count: 0,
        },
        evidence: {
          last_answer_correct: null,
          hint_count: 0,
          repeated_misconception: false,
        },
        plan: { today_target: "z", behind_schedule: false },
        allowed_actions: ["practice", "teach"],
      },
      questions: defaultJevQuestions(["practice", "teach"]),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("invalid_request");
      expect(r.attempts).toBe(1);
      expect(r.retryable).toBe(false);
      expect(JSON.stringify(r)).not.toContain(SECRET);
      expect(r.message).not.toContain(SECRET);
      expect("apiKey" in r).toBe(false);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on 429 within budget", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ "retry-after": "0" }),
        json: async () => ({ message: "slow down" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => officialAnswers,
      });
    vi.stubGlobal("fetch", fetchMock);
    const { callJevSystemOne, defaultJevQuestions } = await loadWithEnv({
      JEV_TIMEOUT_MS: 5000,
    });
    const r = await callJevSystemOne({
      state: {
        student: {
          exam_days_remaining: 1,
          session_minutes_remaining: 5,
          fatigue_signal: 0,
        },
        objective: {
          topic_id: "t",
          mastery: 0.3,
          mastery_confidence: 0.3,
          recent_accuracy: 0.3,
          attempt_count: 1,
        },
        evidence: {
          last_answer_correct: false,
          hint_count: 0,
          repeated_misconception: false,
        },
        plan: { today_target: "a", behind_schedule: false },
        allowed_actions: ["practice", "reteach"],
      },
      questions: defaultJevQuestions(["practice", "reteach"]),
      timeoutMs: 5000,
    });
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    if (r.ok) expect(r.attempts).toBe(2);
  });

  it("maps missing answer to invalid_response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({
        model: "jev-1.13.0",
        answers: {
          next_action: {
            type: "choice",
            choice: "practice",
            confidence: 0.9,
          },
        },
        usage: { input_tokens: 10, output_tokens: 1 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { callJevSystemOne, defaultJevQuestions } = await loadWithEnv({});
    const r = await callJevSystemOne({
      state: {
        student: {
          exam_days_remaining: 1,
          session_minutes_remaining: 5,
          fatigue_signal: 0,
        },
        objective: {
          topic_id: "t",
          mastery: 0.3,
          mastery_confidence: 0.3,
          recent_accuracy: 0.3,
          attempt_count: 1,
        },
        evidence: {
          last_answer_correct: false,
          hint_count: 0,
          repeated_misconception: false,
        },
        plan: { today_target: "a", behind_schedule: false },
        allowed_actions: ["practice", "reteach"],
      },
      questions: defaultJevQuestions(["practice", "reteach"]),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_response");
  });
});
