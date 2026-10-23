// パスワードの再設定（メールに届くコードを入れて、新しいパスワードを決める）と変更まわりの判定と、
// Supabase のエラーを部員向けの言葉に直す処理。画面から切り離してテストできるようにしている

// 管理画面の一括登録で作ったアカウントは実在しないアドレス（player[背番号]@shiga-baseball.internal）なので、
// 再設定のメールを送っても届かない
const NO_MAIL_DOMAIN = "@shiga-baseball.internal";

// 管理者が決め直した仮のパスワードのままかどうかの印。supabase/functions/admin-reset-password が付け、
// 本人がパスワードを変えると外す
export const TEMPORARY_PASSWORD_FLAG = "must_change_password";

export function hasTemporaryPassword(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.[TEMPORARY_PASSWORD_FLAG] === true;
}

// 一括登録の初期パスワード（shiga＋背番号）のままログインしたか。ログインの時に入力されたものと比べるだけで、どこにも残さない
export function isDefaultPlayerPassword(email: string, password: string): boolean {
  const match = /^player(\d+)@shiga-baseball\.internal$/i.exec(email.trim());
  if (!match) return false;
  return password === `shiga${match[1]}` || password === `shiga${Number(match[1])}`;
}

export const NO_MAIL_MESSAGE =
  "このアカウントのメールアドレスにはメールが届きません。パスワードが分からないときは、管理者に聞いてください。";

// メールの文面とアプリの案内に出す桁数。supabase/config.toml の otp_length と本番の Email OTP Length に合わせる
export const RESET_CODE_LENGTH = 6;

type AuthErrorLike = { code?: string; status?: number; name?: string } | null | undefined;

export function cannotReceiveMail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(NO_MAIL_DOMAIN);
}

// メールからコピーしたときの空白や、日本語入力の全角数字が混じっても数字だけにする
export function normalizeCode(input: string): string {
  return input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, "");
}

// 桁数の設定が本番とずれていても止まらないよう、6〜10桁なら受け付ける（判定はサーバーがする）
export function isCodeFormat(code: string): boolean {
  return /^\d{6,10}$/.test(code);
}

// 電波がないときと回数の上限に当たったときは、どの段階でも同じ言い方にする
function commonMessage(error: AuthErrorLike): string | null {
  if (!error) return null;
  if (error.name === "AuthRetryableFetchError" || error.status === 0) {
    return "通信できませんでした。電波のよい場所で、もう一度お試しください。";
  }
  if (error.code === "over_email_send_rate_limit") {
    return "メールを送れる回数の上限に達しました。しばらく時間をおいてから、もう一度お試しください。";
  }
  if (error.code === "over_request_rate_limit" || error.status === 429) {
    return "短い時間に何度も試したため、いったん止まっています。数分待ってから、もう一度お試しください。";
  }
  return null;
}

export function sendErrorMessage(error: AuthErrorLike): string {
  const common = commonMessage(error);
  if (common) return common;
  switch (error?.code) {
    // 本番のメール送信が Supabase 標準のままだと、組織のメンバー以外のアドレスには送れない
    case "email_address_not_authorized":
      return "今はこのアドレスに再設定のメールを送れない設定になっています。管理者に知らせてください。";
    case "email_address_invalid":
    case "validation_failed":
      return "メールアドレスの形が正しくありません。";
    default:
      return "メールを送れませんでした。時間をおいて、もう一度お試しください。";
  }
}

export function verifyErrorMessage(error: AuthErrorLike): string {
  const common = commonMessage(error);
  if (common) return common;
  // 違うコードも期限切れのコードも、サーバーは同じ otp_expired で返す
  if (error?.code === "otp_expired") {
    return "コードが違うか、有効期限（1時間）が切れています。いちばん新しいメールのコードを入れるか、コードを送り直してください。";
  }
  return "コードを確認できませんでした。もう一度お試しください。";
}

// パスワードを変える前に、今のパスワードでログインし直して確かめたときの言い方
export function currentPasswordErrorMessage(error: AuthErrorLike): string {
  const common = commonMessage(error);
  if (common) return common;
  if (error?.code === "invalid_credentials") {
    return "今のパスワードが違います。";
  }
  return "今のパスワードを確かめられませんでした。もう一度お試しください。";
}

export function updateErrorMessage(error: AuthErrorLike): string {
  const common = commonMessage(error);
  if (common) return common;
  if (error?.code === "weak_password") {
    return "このパスワードは使えません。もっと長いものか、推測されにくいものにしてください。";
  }
  if (error?.name === "AuthSessionMissingError" || error?.code === "session_not_found" || error?.code === "session_expired") {
    return "確認の有効期限が切れました。コードを送り直して、最初からやり直してください。";
  }
  return "パスワードを変更できませんでした。もう一度お試しください。";
}
