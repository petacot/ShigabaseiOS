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
import { Redirect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { scale, moderateScale } from "@/lib/scale";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import {
  TEMPORARY_PASSWORD_FLAG,
  currentPasswordErrorMessage,
  isDefaultPlayerPassword,
  updateErrorMessage,
} from "@/lib/password-reset";

const REASON_MESSAGES = {
  temporary: "管理者が決め直した仮のパスワードでログインしました。自分で決めたパスワードに変えてください。",
  default:
    "初期のパスワード（shiga＋背番号）のままです。背番号を知っている人ならログインできてしまうので、自分で決めたパスワードに変えてください。",
} as const;

// ログイン中にパスワードを変える。メニューから開いたときは、今のパスワードを確かめてから変える。
// 仮のパスワードや初期パスワードでログインした直後は、ログインの時に確かめ済みなので今のパスワードは聞かない
// （どちらで開いたかはURLではなくログインの処理が持つ印で決め、リンクから開いて確認を飛ばせないようにしている）
export default function ChangePasswordScreen() {
  const { user, passwordChangeReason, clearPasswordChangeReason } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  if (!user) return <Redirect href="/login" />;

  const justLoggedIn = passwordChangeReason !== null;

  const leave = () => {
    clearPasswordChangeReason();
    if (justLoggedIn || !router.canGoBack()) router.replace("/(tabs)");
    else router.back();
  };

  const handleSubmit = async () => {
    // 確認欄の改行でも呼ばれるので、送信中の二重押しを防ぐ
    if (isLoading) return;
    setError("");
    if (!justLoggedIn && !currentPassword) {
      setError("今のパスワードを入力してください");
      return;
    }
    if (newPassword.length < 8) {
      setError("新しいパスワードは8文字以上で入力してください");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("新しいパスワードが一致しません");
      return;
    }
    if ((!justLoggedIn && newPassword === currentPassword) || isDefaultPlayerPassword(user.email ?? "", newPassword)) {
      setError("今のパスワードや初期のパスワードとは違うものにしてください");
      return;
    }
    setIsLoading(true);
    try {
      if (!justLoggedIn) {
        // 今のパスワードでログインし直して確かめる。本番が「変更には最近のログインが要る」設定でも、これで通る
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user.email ?? "",
          password: currentPassword,
        });
        if (signInError) {
          setError(currentPasswordErrorMessage(signInError));
          return;
        }
      }
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        data: { [TEMPORARY_PASSWORD_FLAG]: false },
      });
      if (updateError) {
        setError(
          updateError.code === "same_password"
            ? "今のパスワードや初期のパスワードとは違うものにしてください"
            : updateErrorMessage(updateError)
        );
        return;
      }
      leave();
      Alert.alert("パスワードを変更しました", "次からは新しいパスワードでログインしてください。");
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
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
          {passwordChangeReason ? (
            <View style={[styles.noticeBox, { backgroundColor: "#f59e0b18", borderColor: "#f59e0b60" }]}>
              <Ionicons name="key-outline" size={18} color="#b45309" />
              <Text style={[styles.noticeText, { color: colors.text }]}>{REASON_MESSAGES[passwordChangeReason]}</Text>
            </View>
          ) : null}

          <Text style={[styles.account, { color: colors.icon }]}>{user.email}</Text>

          {!justLoggedIn && (
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>今のパスワード</Text>
              <TextInput
                style={inputStyle}
                placeholder="今のパスワード"
                placeholderTextColor={colors.icon}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                autoComplete="password"
                textContentType="password"
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>新しいパスワード（8文字以上）</Text>
            <TextInput
              style={inputStyle}
              placeholder="新しいパスワード"
              placeholderTextColor={colors.icon}
              value={newPassword}
              onChangeText={setNewPassword}
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

          {justLoggedIn ? (
            <TouchableOpacity style={styles.subLink} onPress={leave}>
              <Text style={[styles.subLinkText, { color: colors.icon }]}>あとで変える</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.hint, { color: colors.icon }]}>
              今のパスワードが分からないときは、ログアウトしてログイン画面の「パスワードをお忘れですか？」から決め直してください。
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: scale(20) },
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
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(8),
    borderWidth: 1,
    borderRadius: scale(8),
    padding: scale(10),
    marginBottom: scale(12),
  },
  noticeText: { flex: 1, fontSize: moderateScale(13), lineHeight: 19 },
  account: { fontSize: moderateScale(13), marginBottom: scale(12) },
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
  subLink: { marginTop: scale(14), alignItems: "center" },
  subLinkText: { fontSize: moderateScale(14) },
  hint: { marginTop: scale(12), fontSize: moderateScale(12), textAlign: "center", lineHeight: 17 },
});
