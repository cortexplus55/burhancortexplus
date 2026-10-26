import { describe, expect, it } from "vitest";
import { freshJob, JOB_BUDGET_MS, JOB_LEASE_MS, openJob, pumpJob } from "@/lib/learning/generation-job";
import { modelForAttempt, modelLadder } from "@/lib/learning/model-ladder";

describe("generation job", () => {
  it("charges once while the job is open", () => {
    let charges = 0;
    const opened = openJob(freshJob<string>(20), {
      now: 1000,
      charge: () => {
        charges += 1;
        return "res-1";
      },
    });
    const again = openJob(opened, {
      now: 2000,
      charge: () => {
        charges += 1;
        return "res-2";
      },
    });
    expect(opened.charges).toBe(1);
    expect(again.chargeReservationId).toBe("res-1");
    expect(charges).toBe(1);
  });

  it("resumes after a timeout and refunds the reservation once", async () => {
    let job = openJob(freshJob<string>(3), { now: 1000, charge: () => "res-1" });
    job = await pumpJob(job, {
      now: 1000,
      generate: async () => {
        throw new Error("timeout");
      },
      refund: () => {
        throw new Error("refunded too early");
      },
    });
    expect(job.state).toBe("running");
    expect(job.items).toEqual([]);
    expect(job.ready).toBe(0);
    expect(job.refunded).toBe(false);
    expect(job.leaseUntil).toBe(1000 + JOB_LEASE_MS);

    const blocked = await pumpJob(job, {
      now: 2000,
      generate: async () => {
        throw new Error("lease still held");
      },
      refund: () => undefined,
    });
    expect(blocked.attempts).toBe(job.attempts);

    job = await pumpJob(job, {
      now: (job.leaseUntil ?? 0) + 1,
      generate: async (items) => ({ items: [...items, "a"], done: false }),
      refund: () => undefined,
    });
    expect(job.state).toBe("running");
    expect(job.items).toEqual(["a"]);
    expect(job.ready).toBe(1);

    const ready = job.ready;
    job = await pumpJob(
      { ...job, leaseUntil: null },
      {
        now: job.startedAt + 20,
        generate: async (items) => ({ items, done: false }),
        refund: () => undefined,
      },
    );
    expect(job.ready).toBeGreaterThanOrEqual(ready);
    expect(job.items).toEqual(["a"]);
    expect(job.state).toBe("running");

    const refunds: string[] = [];
    job = await pumpJob(
      { ...job, leaseUntil: null },
      {
        now: job.startedAt + JOB_BUDGET_MS,
        generate: async () => {
          throw new Error("still down");
        },
        refund: (id) => refunds.push(id),
      },
    );
    expect(job.state).toBe("failed");
    expect(job.refunded).toBe(true);
    expect(refunds).toEqual(["res-1"]);
    expect(job.items).toEqual(["a"]);

    const again: string[] = [];
    const stuck = await pumpJob(job, {
      now: job.startedAt + JOB_BUDGET_MS + 1,
      generate: async () => {
        throw new Error("no");
      },
      refund: (id) => again.push(id),
    });
    expect(stuck.state).toBe("failed");
    expect(again).toEqual([]);
    expect(openJob(stuck, { now: 9_999_999, charge: () => "res-3" }).charges).toBe(1);
  });

  it("is done only after the chunk says the result was stored", async () => {
    let job = openJob(freshJob<string>(2), { now: 1000, charge: () => "res" });
    job = await pumpJob(job, {
      now: 1000,
      generate: async () => ({ items: ["a", "b"], done: false }),
      refund: () => undefined,
    });
    expect(job.state).toBe("running");
    expect(job.ready).toBe(2);
    expect(job.resultRef).toBeNull();
    job = await pumpJob(
      { ...job, leaseUntil: null },
      {
        now: 2000,
        generate: async (items) => ({ items, done: true, resultRef: "exam-1" }),
        refund: () => undefined,
      },
    );
    expect(job.state).toBe("done");
    expect(job.resultRef).toBe("exam-1");
    expect(job.leaseUntil).toBeNull();
    expect(job.ready).toBe(2);
  });

  it("keeps ready from moving backwards", async () => {
    let job = openJob(freshJob<string>(4), { now: 1000, charge: () => "res" });
    job = await pumpJob(job, {
      now: 1000,
      generate: async () => ({ items: ["a", "b"], done: false }),
      refund: () => undefined,
    });
    job = await pumpJob(
      { ...job, leaseUntil: null },
      {
        now: 2000,
        generate: async () => ({ items: ["a"], done: false }),
        refund: () => undefined,
      },
    );
    expect(job.ready).toBe(2);
  });

  it("walks the model ladder and clamps", () => {
    const ladder = modelLadder();
    expect(ladder.length).toBeGreaterThanOrEqual(3);
    expect(modelForAttempt(0)).toBe(ladder[0]);
    expect(modelForAttempt(1)).toBe(ladder[1]);
    expect(modelForAttempt(99)).toBe(ladder[ladder.length - 1]);
  });
});
