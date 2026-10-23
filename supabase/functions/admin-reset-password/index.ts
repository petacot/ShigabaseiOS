import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { generateTemporaryPassword } from "../_shared/temporary-password.ts";

// 管理者が部員のパスワードを仮のものに決め直す。
// 一括登録のアカウント（player[背番号]@shiga-baseball.internal）はメールが届かず、本人では再設定できないため。
// 仮のパスワードには印（must_change_password）を付け、本人がログインするとアプリが自分のパスワードへの変更を勧める

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "認証エラー" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabaseUser.auth.getUser();
    const caller = userData?.user;
    if (!caller) return json({ error: "認証エラー" }, 401);

    // 管理者かどうかは画面の出し分けに頼らず、ここでデータベースを見て確かめる
    const { data: adminRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw roleError;
    if (!adminRole) return json({ error: "管理者だけが使えます" }, 403);

    const { userId } = (await req.json()) as { userId?: string };
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return json({ error: "部員が選ばれていません" }, 400);
    }
    // 自分のパスワードは、今のパスワードを確かめるメニューの画面で変える
    if (userId === caller.id) {
      return json({ error: "自分のパスワードは、メニューの「パスワードを変更する」から変えてください" }, 400);
    }

    const temporaryPassword = generateTemporaryPassword();
    // user_metadata は送った項目だけが書き換わり、表示名などはそのまま残る
    const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: temporaryPassword,
      user_metadata: { must_change_password: true },
    });
    if (updateError) {
      if (updateError.status === 404) return json({ error: "その部員のアカウントが見つかりません" }, 404);
      throw updateError;
    }

    return json({ email: updated.user?.email ?? null, temporaryPassword });
  } catch (e) {
    console.error("admin-reset-password:", e);
    return json({ error: "パスワードを決め直せませんでした" }, 500);
  }
});
