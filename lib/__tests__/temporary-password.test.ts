import { describe, expect, it } from "vitest";
import { generateTemporaryPassword } from "../../supabase/functions/_shared/temporary-password";

const FORMAT = /^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/;

// 決まった並びの乱数を返す（足りなくなったら最後の並びを繰り返す）
const fixedBytes = (...batches: number[][]) => {
  let i = 0;
  return (size: number) => {
    const batch = batches[Math.min(i++, batches.length - 1)];
    return Uint8Array.from({ length: size }, (_, k) => batch[k % batch.length]);
  };
};

describe("generateTemporaryPassword", () => {
  it("4字ずつ3つに区切る", () => expect(generateTemporaryPassword()).toMatch(FORMAT));
  it("小文字・大文字・数字が必ず入る", () => {
    for (let n = 0; n < 200; n++) {
      const p = generateTemporaryPassword();
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[2-9]/);
    }
  });
  it("読み違えやすい字（0 O o 1 l I i）は使わない", () => {
    for (let n = 0; n < 200; n++) expect(generateTemporaryPassword()).not.toMatch(/[0Oo1lIi]/);
  });
  it("毎回ちがう", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateTemporaryPassword()));
    expect(seen.size).toBe(500);
  });
  it("小文字だけになったときは作り直す", () => {
    // 1回目は全部 a（大文字・数字なし）、2回目は a A 2 b B 3 … の並び
    const p = generateTemporaryPassword(fixedBytes([0], [0, 23, 47, 1, 24, 48]));
    expect(p).toBe("aA2b-B3aA-2bB3");
  });
  it("偏りの出る大きい乱数は捨てる", () => {
    // 220以上は捨てるので、230 と 255 は使われず a A 2 だけが並ぶ
    const p = generateTemporaryPassword(fixedBytes([230, 0, 255, 23, 47]));
    expect(p).toBe("aA2a-A2aA-2aA2");
  });
});
