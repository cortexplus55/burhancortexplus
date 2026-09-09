import { describe, it, expect } from "vitest";
import { createSerialTaskQueue } from "@/lib/learning/serial-task-queue";
describe("answer save queue", () => {
  it("waits for a slow write before reading the next version", async () => {
    const queue = createSerialTaskQueue();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let version = 1;
    const seen: number[] = [];
    const a = queue.run(async () => { seen.push(version); await gate; version++; });
    const b = queue.run(async () => { seen.push(version); version++; });
    await Promise.resolve();
    expect(seen).toEqual([1]);
    release(); await Promise.all([a,b]);
    expect(seen).toEqual([1,2]);
  });
  it("reports a failed write and allows an explicit retry", async () => {
    const queue = createSerialTaskQueue();
    await expect(queue.run(async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    await expect(queue.run(async () => "saved")).resolves.toBe("saved");
  });
});
