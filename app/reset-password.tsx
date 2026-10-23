import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { scale, verticalScale, moderateScale } from "@/lib/scale";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import {
  NO_MAIL_MESSAGE,
  RESET_CODE_LENGTH,
  cannotReceiveMail,
  isCodeFormat,
  normalizeCode,
  sendErrorMessage,
  updateErrorMessage,
  verifyErrorMessage,
} from "@/lib/password-reset";

// メールに届いたコードを確かめてから、新しいパスワードを保存する。
// コードを確かめた時点でログイン状態になり、ログイン画面はホームへ移ってしまうため、別の画面にしている
export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string; sent?: string }>();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  const [email, setEmail] = useState(params.email ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // コードは一度しか使えないので、確かめたあとに保存だけ失敗したときは保存だけやり直す
  const [verified, setVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    params.sent && params.email ? `${params.email} にコードを送りました。` : ""
  );

  const handleResend = async () => {
    setError("");
    setNotice("");
    const target = email.trim();
    if (!target) {
      setError("メールアドレスを入力してください");
      return;
    }
    if (cannotReceiveMail(target)) {
      setError(NO_MAIL_MESSAGE);
      return;
    }
    setResending(true);
    const { error: sendError } = await supabase.auth.resetPasswordForEmail(target);
    setResending(false);
    if (sendError) {
      setError(sendErrorMessage(sendError));
      return;
    }
    setCode("");
    setNotice(`${target} に新しいコードを送りました。前のメールのコードは使えなくなります。`);
  };

  const handleSubmit = async () => {
    // 確認欄の改行でも呼ばれるので、送信中の二重押しを防ぐ
    if (isLoading) return;
    setError("");
    setNotice("");
    const target = email.trim();
    const digits = normalizeCode(code);
    if (!verified) {
      if (!target) {
        setError("メールアドレスを入力してください");
        return;
      }
      if (cannotReceiveMail(target)) {
        setError(NO_MAIL_MESSAGE);
        return;
      }
      if (!isCodeFormat(digits)) {
        setError(`メールに届いた${RESET_CODE_LENGTH}桁のコードを入力してください`);
        return;
      }
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください");
      return;
    }
    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }
    setIsLoading(true);
    try {
      if (!verified) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: target,
          token: digits,
          type: "recovery",
        });
        if (verifyError) {
          setError(verifyErrorMessage(verifyError));
          return;
        }
        setVerified(true);
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      // 忘れたと思っていた今のパスワードを入れた場合も、そのパスワードで使えるので完了にする
      if (updateError && updateError.code !== "same_password") {
        setError(updateErrorMessage(updateError));
        return;
      }
      router.replace("/(tabs)");
      if (updateError) {
        Alert.alert("ログインしました", "入力したパスワードは今のものと同じでした。このパスワードでそのまま使えます。");
      } else {
        Alert.alert("パスワードを変更しました", "新しいパスワードでログインしました。次からはこのパスワードでログインしてください。");
      }
    } catch {
      setError("通信できませんでした。電波のよい場所で、もう一度お試しください。");
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle = [styles.input, { color: colors.text, borderColor: colors.icon, backgroundColor: colors.background }];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false} keyboardShouldPersistTaps="handled">
        {/* ヘッダー */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace("/login")} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.tint} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>パスワードの再設定</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.stepTitle, { color: colors.text }]}>新しいパスワードを決める</Text>
          <Text style={[styles.stepDesc, { color: colors.icon }]}>
            メールに届いた{RESET_CODE_LENGTH}桁のコードと、新しいパスワードを入力してください。コードは1時間使えます。
          </Text>

          {notice ? (
            <View style={[styles.noticeBox, { backgroundColor: colors.tint + "15", borderColor: colors.tint + "40" }]}>
              <Ionicons name="mail-outline" size={16} color={colors.tint} />
              <Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>メールアドレス</Text>
            <TextInput
              style={[inputStyle, verified && styles.inputDone]}
              placeholder="example@email.com"
              placeholderTextColor={colors.icon}
              value={email}
              onChangeText={setEmail}
              editable={!verified}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              autoCorrect={false}
              spellCheck={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>メールに届いたコード（{RESET_CODE_LENGTH}桁）</Text>
            {verified ? (
              <View style={styles.verifiedRow}>
                <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                <Text style={styles.verifiedText}>コードを確認しました</Text>
              </View>
            ) : (
              <TextInput
                style={[styles.codeInput, { color: colors.text, borderColor: colors.icon, backgroundColor: colors.background }]}
                placeholder={"0".repeat(RESET_CODE_LENGTH)}
                placeholderTextColor={colors.icon + "80"}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={12}
              />
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>新しいパスワード（8文字以上）</Text>
            <TextInput
              style={inputStyle}
              placeholder="新しいパスワード"
              placeholderTextColor={colors.icon}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="off"
              textContentType="oneTimeCode"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>新しいパスワード（確認）</Text>
            <TextInput
              style={inputStyle}
              placeholder="新しいパスワードを再入力"
              placeholderTextColor={colors.icon}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="off"
              textContentType="oneTimeCode"
              // キーボードでボタンが隠れるので、確認欄の改行でも変更できるようにする
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.tint }]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>パスワードを変更する</Text>
            )}
          </TouchableOpacity>

          {!verified && (
            <TouchableOpacity style={styles.subLink} onPress={handleResend} disabled={resending}>
              {resending ? (
                <ActivityIndicator color={colors.tint} />
              ) : (
                <Text style={[styles.subLinkText, { color: colors.tint }]}>コードが届かないときは送り直す</Text>
              )}
            </TouchableOpacity>
          )}
          {/* 登録されていないアドレスでも送信は成功として返る（登録の有無を外から分からなくするため）ので、打ち間違いにも気づけるようにする */}
          <Text style={[styles.hint, { color: colors.icon }]}>
            メールが届かないときは、迷惑メールのフォルダと、アドレスが登録したものと同じかを確かめてください。
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: scale(20), paddingTop: verticalScale(60) },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: scale(24),
  },
  headerTitle: { fontSize: moderateScale(18), fontWeight: "600" },
  card: {
    // iPadやブラウザで横に伸びすぎないようにする
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    padding: scale(24),
    borderRadius: scale(16),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    gap: 4,
  },
  stepTitle: { fontSize: moderateScale(18), fontWeight: "700", marginBottom: 4 },
  stepDesc: { fontSize: moderateScale(13), marginBottom: scale(16), lineHeight: 18 },
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(8),
    borderWidth: 1,
    borderRadius: scale(8),
    padding: scale(10),
    marginBottom: scale(14),
  },
  noticeText: { flex: 1, fontSize: moderateScale(13), lineHeight: 18 },
  inputGroup: { marginBottom: scale(14) },
  label: { fontSize: moderateScale(14), fontWeight: "600", marginBottom: scale(6) },
  input: {
    borderWidth: 1,
    borderRadius: scale(8),
    padding: scale(12),
    fontSize: moderateScale(16),
    // 字の間隔を付けた入力欄（新規登録の招待コード欄など）が使い回されると間隔だけが残ることがあるので、0と明示する
    letterSpacing: 0,
  },
  inputDone: { opacity: 0.6 },
  // 字の間隔（letterSpacing）は付けない。閉じた画面の入力欄がほかの画面で使い回されるとき、
  // 間隔だけが残ってログイン画面などの薄い字まで「パ ス ワ ー ド」と広がるため
  codeInput: {
    borderWidth: 1,
    borderRadius: scale(8),
    padding: scale(14),
    fontSize: moderateScale(26),
    fontWeight: "700",
    textAlign: "center",
  },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: scale(6), paddingVertical: scale(6) },
  verifiedText: { color: "#16a34a", fontSize: moderateScale(14), fontWeight: "600" },
  errorText: {
    color: "#ef4444",
    fontSize: moderateScale(13),
    marginBottom: scale(8),
    textAlign: "center",
    lineHeight: 18,
  },
  button: {
    padding: scale(14),
    borderRadius: scale(8),
    alignItems: "center",
    marginTop: scale(8),
  },
  buttonText: { color: "#fff", fontSize: moderateScale(16), fontWeight: "600" },
  subLink: { marginTop: scale(14), alignItems: "center", minHeight: scale(20) },
  subLinkText: { fontSize: moderateScale(14) },
  hint: { marginTop: scale(10), fontSize: moderateScale(12), textAlign: "center", lineHeight: 17 },
});
