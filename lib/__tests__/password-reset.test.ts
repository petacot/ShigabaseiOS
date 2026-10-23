import { describe, expect, it } from "vitest";
import {
  cannotReceiveMail,
  currentPasswordErrorMessage,
  hasTemporaryPassword,
  isCodeFormat,
  isDefaultPlayerPassword,
  normalizeCode,
  sendErrorMessage,
  updateErrorMessage,
  verifyErrorMessage,
} from "../password-reset";

describe("isDefaultPlayerPassword", () => {
  it("一括登録のアドレスで shiga＋同じ背番号なら初期パスワード", () => expect(isDefaultPlayerPassword("player12@shiga-baseball.internal", "shiga12")).toBe(true));
  it("アドレスの大文字や空白は気にしない", () => expect(isDefaultPlayerPassword(" Player7@Shiga-Baseball.internal", "shiga7")).toBe(true));
  it("背番号が違えば初期パスワードではない", () => expect(isDefaultPlayerPassword("player12@shiga-baseball.internal", "shiga13")).toBe(false));
  it("自分で変えたパスワードは対象外", () => expect(isDefaultPlayerPassword("player12@shiga-baseball.internal", "myownpass")).toBe(false));
  it("ふつうのアドレスは対象外", () => expect(isDefaultPlayerPassword("taro@example.com", "shiga12")).toBe(false));
});

describe("hasTemporaryPassword", () => {
  it("管理者が付けた印があれば仮のパスワード", () => expect(hasTemporaryPassword({ must_change_password: true, display_name: "山田" })).toBe(true));
  it("本人が変えたあと（false）は対象外", () => expect(hasTemporaryPassword({ must_change_password: false })).toBe(false));
  it("印がない・情報がない", () => {
    expect(hasTemporaryPassword({ display_name: "山田" })).toBe(false);
    expect(hasTemporaryPassword(undefined)).toBe(false);
  });
});

describe("currentPasswordErrorMessage", () => {
  it("今のパスワードが違う", () => expect(currentPasswordErrorMessage({ code: "invalid_credentials", status: 400 })).toBe("今のパスワードが違います。"));
  it("試しすぎ", () => expect(currentPasswordErrorMessage({ code: "over_request_rate_limit", status: 429 })).toContain("数分待って"));
});

describe("cannotReceiveMail", () => {
  it("一括登録のアドレスは届かない", () => expect(cannotReceiveMail("player12@shiga-baseball.internal")).toBe(true));
  it("大文字や前後の空白があっても見分ける", () => expect(cannotReceiveMail("  Player12@Shiga-Baseball.Internal ")).toBe(true));
  it("ふつうのアドレスは届く", () => expect(cannotReceiveMail("taro@example.com")).toBe(false));
});

describe("normalizeCode", () => {
  it("空白やハイフンを除く", () => expect(normalizeCode(" 123 456 ")).toBe("123456"));
  it("全角数字を半角にする", () => expect(normalizeCode("１２３４５６")).toBe("123456"));
});

describe("isCodeFormat", () => {
  it("6桁は受け付ける", () => expect(isCodeFormat("123456")).toBe(true));
  it("本番の桁数が違っても10桁までは受け付ける", () => expect(isCodeFormat("12345678")).toBe(true));
  it("5桁は足りない", () => expect(isCodeFormat("12345")).toBe(false));
});

describe("エラーの言い方", () => {
  it("電波がないとき", () => expect(sendErrorMessage({ name: "AuthRetryableFetchError", status: 0 })).toContain("通信できませんでした"));
  it("メールの送信回数の上限", () => expect(sendErrorMessage({ code: "over_email_send_rate_limit", status: 429 })).toContain("回数の上限"));
  it("標準のメール送信で送れないアドレス", () => expect(sendErrorMessage({ code: "email_address_not_authorized", status: 400 })).toContain("管理者に知らせて"));
  it("違うコード・期限切れのコード", () => expect(verifyErrorMessage({ code: "otp_expired", status: 403 })).toContain("有効期限"));
  it("試しすぎ", () => expect(verifyErrorMessage({ code: "over_request_rate_limit", status: 429 })).toContain("数分待って"));
  it("弱いパスワード", () => expect(updateErrorMessage({ code: "weak_password", status: 422 })).toContain("使えません"));
  it("ログインが切れた", () => expect(updateErrorMessage({ name: "AuthSessionMissingError", status: 400 })).toContain("最初からやり直して"));
  it("知らないエラー", () => expect(updateErrorMessage({ code: "unexpected_failure", status: 500 })).toBe("パスワードを変更できませんでした。もう一度お試しください。"));
});
