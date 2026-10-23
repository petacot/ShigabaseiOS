// 管理者が決め直す仮のパスワードを作る。読み違えやすい字（0とO、1とlとI）を除き、4字ずつ「-」で区切って伝えやすくする。
// 本番のパスワードの条件（小文字・大文字・数字・記号）をどれにしていても通るよう、小文字・大文字・数字を必ず1字ずつ入れる
// （「-」が記号の代わりになる）。アプリのテスト（lib/__tests__/temporary-password.test.ts）からも読むので、Deno専用の機能は使わない
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const ALPHABET = LOWER + UPPER + DIGITS;
const LENGTH = 12;

type RandomBytes = (size: number) => Uint8Array;
const cryptoRandom: RandomBytes = (size) => crypto.getRandomValues(new Uint8Array(size));

export function generateTemporaryPassword(randomBytes: RandomBytes = cryptoRandom): string {
  // 0〜255の乱数を字の数で割った余りをそのまま使うと前の方の字が出やすくなるので、割り切れる範囲を超えた値は捨てる
  const limit = 256 - (256 % ALPHABET.length);
  for (let attempt = 0; attempt < 100; attempt++) {
    const chars: string[] = [];
    while (chars.length < LENGTH) {
      for (const byte of randomBytes(LENGTH * 2)) {
        if (byte < limit && chars.length < LENGTH) chars.push(ALPHABET[byte % ALPHABET.length]);
      }
    }
    const value = chars.join("");
    if (/[a-z]/.test(value) && /[A-Z]/.test(value) && /[2-9]/.test(value)) {
      return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
    }
  }
  throw new Error("仮のパスワードを作れませんでした");
}
