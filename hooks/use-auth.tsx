import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import { Alert } from "react-native";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { withTimeout } from "@/lib/scoring/net";
import { hasTemporaryPassword, isDefaultPlayerPassword } from "@/lib/password-reset";

type AppRole = "player" | "analyst" | "admin" | "ob";
// 仮のパスワード（管理者が決め直したもの）か、一括登録の初期パスワードでログインした直後の印
export type PasswordChangeReason = "temporary" | "default";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  isLoading: boolean;
  passwordChangeReason: PasswordChangeReason | null;
  clearPasswordChangeReason: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (code: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
}

// ログインした直後の行き先。ログイン画面の自動の移動とログインの処理が同じ行き先になるよう、ここで決める
export function homeAfterLogin(user: User | null, reason: PasswordChangeReason | null): "/change-password" | "/(tabs)" {
  return reason || hasTemporaryPassword(user?.user_metadata) ? "/change-password" : "/(tabs)";
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [passwordChangeReason, setPasswordChangeReason] = useState<PasswordChangeReason | null>(null);
  // サインアップ中は onAuthStateChange からのロール取得を抑制するフラグ
  const signingUp = useRef(false);

  const fetchUserRoles = async (userId: string): Promise<AppRole[]> => {
    // 球場など電波がない所で開き直しても試合記録に入れるよう、前回のロールを端末に控えておく
    // （画面の出し分けにだけ使う。データの読み書きはデータベース側の権限で守られている）
    const key = `shigabase_roles_${userId}`;
    // ログイン情報と同じ保存場所（アプリに組み込み済み）を使う
    const store = { get: () => Platform.OS === "web" ? Promise.resolve(null) : SecureStore.getItemAsync(key), set: (v: string) => Platform.OS === "web" ? Promise.resolve() : SecureStore.setItemAsync(key, v) };
    try {
      const { data, error } = await withTimeout(supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId));
      if (error || !data) throw error ?? new Error("ロールを取得できませんでした");
      const fresh = data.map((r: { role: string }) => r.role as AppRole);
      await store.set(JSON.stringify(fresh)).catch(() => {});
      return fresh;
    } catch (e) {
      console.warn("ロールの取得に失敗しました。端末の控えを使います:", e);
      try { return JSON.parse((await store.get()) ?? "[]") as AppRole[]; } catch { return []; }
    }
  };

  useEffect(() => {
    // 期限切れのログインを更新する問い合わせは、電波がないと終わらず起動画面で止まる。
    // 数秒で打ち切り、端末に残っているログイン情報で先に進む（つながれば裏で更新される）
    const storedSession = async (): Promise<Session | null> => {
      try {
        const key = (supabase.auth as any).storageKey as string;
        const raw = Platform.OS === "web" ? null : await SecureStore.getItemAsync(key);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed?.user ? (parsed as Session) : null;
      } catch { return null; }
    };
    Promise.race([
      supabase.auth.getSession(),
      new Promise<{ data: { session: Session | null } }>(resolve => setTimeout(async () => resolve({ data: { session: await storedSession() } }), 6000)),
    ]).then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (session?.user) {
        fetchUserRoles(session.user.id).then(setRoles);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // サインアップ中は complete-signup 完了後に明示的にロールを設定するためスキップ
          if (!signingUp.current) {
            fetchUserRoles(session.user.id).then(setRoles);
          }
        } else {
          setRoles([]);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    // 初期パスワードかどうかは入力した値でしか分からないので、ログインの結果が届く前に印を付けておく
    // （ログイン画面はログインできた時点で自動で移動するため、印が後から付くと行き先がずれる）
    const usingDefault = isDefaultPlayerPassword(email, password);
    setPasswordChangeReason(usingDefault ? "default" : null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setPasswordChangeReason(null);
      Alert.alert("ログインエラー", "メールアドレスまたはパスワードが間違っています");
      throw error;
    }
    const reason: PasswordChangeReason | null = hasTemporaryPassword(data.user?.user_metadata)
      ? "temporary"
      : usingDefault
      ? "default"
      : null;
    setPasswordChangeReason(reason);
    router.replace(homeAfterLogin(data.user, reason));
  };

  const signUp = async (code: string, email: string, password: string) => {
    // 1. 招待コードを事前検証
    const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
      "verify-invite-code",
      { body: { code } }
    );
    if (verifyError || !verifyData?.valid) {
      throw new Error(verifyData?.error ?? "招待コードが無効です");
    }

    // onAuthStateChange が auth.signUp() 直後に発火しても user_roles がまだ存在しないため
    // complete-signup 完了まで onAuthStateChange からのロール取得を抑制する
    signingUp.current = true;
    try {
      // 2. Supabase Auth でアカウント作成
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: verifyData.playerName },
        },
      });
      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error("アカウントの作成に失敗しました");

      // 3. 後処理（ロール設定・players 紐付け・コード使用済みマーク）
      // signUp 直後は JWT が未確定のため、userId をボディで渡してサービスロールで処理
      const { data: completeData, error: completeError } = await supabase.functions.invoke(
        "complete-signup",
        { body: { code, userId: signUpData.user.id } }
      );
      if (completeError || !completeData?.ok) {
        throw new Error(completeData?.error ?? "登録の完了に失敗しました");
      }

      // 4. complete-signup 完了後にロールを取得（この時点で user_roles は確実に存在する）
      const freshRoles = await fetchUserRoles(signUpData.user.id);
      setRoles(freshRoles);

      router.replace("/(tabs)");
    } finally {
      signingUp.current = false;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert("エラー", error.message);
      return;
    }
    setPasswordChangeReason(null);
    router.replace("/login");
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const clearPasswordChangeReason = () => setPasswordChangeReason(null);

  return (
    <AuthContext.Provider
      value={{ user, session, roles, isLoading, passwordChangeReason, clearPasswordChangeReason, signIn, signUp, signOut, hasRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
