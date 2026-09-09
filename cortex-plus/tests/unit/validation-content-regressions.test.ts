import { describe, it, expect } from "vitest";
import { runIndependentValidation, checkSimpleMathClaims, checkImpossiblePercentClaims } from "@/lib/learning/validation-pipeline";
const validate = (parsed: unknown) => runIndependentValidation({parsed, draft:JSON.stringify(parsed)});
describe("activity-aware validation", () => {
  it("accepts podcast dialogue and lesson sections but rejects empty bodies", () => {
    expect(validate({chapters:[{title:"Radyan",lines:[{speaker:"ada",text:"Bir tam tur 360 derecedir."}]}]}).ok).toBe(true);
    expect(validate({sections:[{heading:"Radyan",body:"Bir tam tur 360 derecedir."}]}).ok).toBe(true);
    expect(validate({chapters:[{title:"Radyan",lines:[]}]}).ok).toBe(false);
    expect(validate({sections:[{heading:"Radyan",body:""}]}).ok).toBe(false);
  });
  it.each(["-2+3=1", "−2+3=1", "1.5+2.5=4", "2-3=-1"])("accepts valid signed and decimal arithmetic: %s", text => {
    expect(checkSimpleMathClaims(text)).toEqual([]);
  });
  it("keeps catching incorrect asserted arithmetic", () => {
    expect(checkSimpleMathClaims("-2+3=5")).toHaveLength(1);
    expect(checkSimpleMathClaims("2+2=5")).toHaveLength(1);
  });
  it("distinguishes a false statement from a wrong correction", () => {
    expect(validate({items:[{text:"2+2=5 doğrudur.",correct:false,correctedStatement:"2+2=4 doğrudur."}]}).ok).toBe(true);
    expect(validate({items:[{text:"2+2=5 doğrudur.",correct:true}]}).ok).toBe(false);
    expect(validate({items:[{text:"2+2=5 doğrudur.",correct:false,correctedStatement:"2+2=6 doğrudur."}]}).ok).toBe(false);
  });
  it("does not treat distractors and misconceptions as endorsed facts", () => {
    expect(validate({questions:[{text:"Hangi işlem doğru?",options:["2+2=5","2+2=4"],correct:"2+2=4",explanation:"Toplam dörttür."}]}).ok).toBe(true);
    expect(validate({commonMistake:{claim:"2+2=5",correction:"2+2=4"}}).ok).toBe(true);
  });
  it("allows growth above 100 percent but checks impossible success rates", () => {
    expect(checkImpossiblePercentClaims("Fiyat yüzde 150 arttı.")).toEqual([]);
    expect(checkImpossiblePercentClaims("Başarı oranı %150.")).toHaveLength(1);
  });
});
