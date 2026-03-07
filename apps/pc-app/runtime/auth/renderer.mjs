const loginForm = document.getElementById("auth-login-form");
const registerForm = document.getElementById("auth-register-form");
const switchAuthBtn = document.getElementById("btn-switch-auth");

const loginAccountInput = document.getElementById("login-account");
const loginPasswordInput = document.getElementById("login-password");
const loginRememberInput = document.getElementById("login-remember");

const registerUsernameInput = document.getElementById("register-username");
const registerAccountInput = document.getElementById("register-account");
const registerPasswordInput = document.getElementById("register-password");
const registerConfirmInput = document.getElementById("register-confirm");

const loginBtn = document.getElementById("btn-login");
const registerBtn = document.getElementById("btn-register");
const statusElement = document.getElementById("status");

let mode = "login";
let pending = false;
const LOGIN_REMEMBER_STORAGE_KEY = "lingjing_auth_remember_v1";

function loadRememberedLogin() {
  try {
    const raw = localStorage.getItem(LOGIN_REMEMBER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const account = typeof parsed?.account === "string" ? parsed.account : "";
    const password = typeof parsed?.password === "string" ? parsed.password : "";
    if (!account || !password) return null;
    return {
      account,
      password,
      remember: true
    };
  } catch {
    return null;
  }
}

function saveRememberedLogin(account, password) {
  try {
    localStorage.setItem(
      LOGIN_REMEMBER_STORAGE_KEY,
      JSON.stringify({
        account: String(account || ""),
        password: String(password || "")
      })
    );
  } catch {
    // Best effort persistence.
  }
}

function clearRememberedLogin() {
  try {
    localStorage.removeItem(LOGIN_REMEMBER_STORAGE_KEY);
  } catch {
    // Best effort clear.
  }
}

function unwrapErrorMessage(raw) {
  const text = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  if (!text) return "";

  const tryParseMessage = (candidate) => {
    try {
      const parsed = JSON.parse(candidate);
      const payloadMessage =
        parsed?.error?.message || parsed?.message || parsed?.data?.error?.message || null;
      return typeof payloadMessage === "string" ? payloadMessage.trim() : "";
    } catch {
      return "";
    }
  };

  const direct = tryParseMessage(text);
  if (direct) return direct;

  const jsonStart = text.indexOf("{");
  if (jsonStart >= 0) {
    const nested = tryParseMessage(text.slice(jsonStart));
    if (nested) return nested;
  }
  return text;
}

function localizeAuthErrorMessage(message) {
  const raw = unwrapErrorMessage(message);
  if (!raw) return "未知错误";
  const lower = raw.toLowerCase();

  const mappings = [
    ["session invalidated", "账号已在其他设备登录，请重新登录"],
    ["session token is required", "登录态已失效，请重新登录"],
    ["invalid session token", "登录态已失效，请重新登录"],
    ["login required", "请先登录"],
    ["account is required", "账号不能为空"],
    ["account already exists", "账号已存在"],
    ["account length must be 3-32", "账号长度需在 3-32 之间"],
    ["account cannot contain spaces", "账号不能包含空格"],
    ["account not found", "账号不存在"],
    ["password is required", "密码不能为空"],
    ["password length must be 6-64", "密码长度需在 6-64 之间"],
    ["invalid password", "密码错误"],
    ["username is required", "用户名不能为空"],
    ["username length must be 2-24", "用户名长度需在 2-24 之间"],
    ["old password is required", "请输入旧密码"],
    ["invalid old password", "旧密码错误"],
    ["invalid username", "用户名格式不合法"],
    ["invalid new password", "新密码格式不合法"],
    ["target account not found", "目标账号不存在"],
    ["cannot challenge yourself", "不能挑战自己"],
    ["pending duel request already exists", "已存在待处理的对战申请"],
    ["resend too frequent", "补发太频繁，请稍后再试"],
    ["request id is required", "请求编号不能为空"],
    ["decision is required", "请选择处理动作"],
    ["invalid duel request decision", "申请处理动作不合法"],
    ["duel request not found", "对战申请不存在"],
    ["request is not inbound", "只能处理收到的申请"],
    ["request is not outbound", "只能取消自己发出的申请"],
    ["duel request already resolved", "该申请已处理"],
    ["user id is required", "用户标识不能为空"],
    ["roomcode is required", "联机房间号不能为空"],
    ["roomid or roomcode is required", "缺少房间标识，请重新进入联机"],
    ["roomid, userid, roundno and valid action are required", "回合参数不完整，请重试"],
    ["roomid and userid are required", "房间参数不完整，请重试"],
    ["room is waiting for second player", "房间还在等待对手加入"],
    ["room is waiting for opponent", "房间还在等待对手加入"],
    ["room already finished", "对局已结束"],
    ["room not found", "房间不存在或已失效"],
    ["room is not joinable", "房间当前不可加入"],
    ["room is full", "房间已满"],
    ["room side not available", "房间席位异常，请重新加入"],
    ["round mismatch", "回合同步失败，请等待房间刷新后重试"],
    ["round resolution timeout", "回合结算超时，请重试"],
    ["invalid action", "回合动作无效"],
    ["invalid round payload", "回合数据异常，请重试"],
    ["user is not room participant", "你不在该房间对局中"],
    ["failed to query account", "账号查询失败，请稍后重试"],
    ["failed to create account", "账号创建失败，请稍后重试"],
    ["failed to update login timestamp", "登录状态更新失败，请稍后重试"],
    ["failed to update account", "账号更新失败，请稍后重试"],
    ["failed to query pending requests", "申请列表加载失败，请稍后重试"],
    ["failed to load inbound requests", "收到申请加载失败，请稍后重试"],
    ["failed to load outbound requests", "发出申请加载失败，请稍后重试"],
    ["failed to send duel request", "发起申请失败，请稍后重试"],
    ["failed to respond duel request", "处理申请失败，请稍后重试"],
    ["failed to cancel duel request", "取消申请失败，请稍后重试"],
    ["failed to query duel request", "申请查询失败，请稍后重试"],
    ["failed to query room", "房间查询失败，请稍后重试"],
    ["failed to query rounds", "回合数据查询失败，请稍后重试"],
    ["failed to query round", "回合数据查询失败，请稍后重试"],
    ["failed to query actions", "动作数据查询失败，请稍后重试"],
    ["failed to create room code", "创建房间号失败，请稍后重试"],
    ["failed to create room", "创建房间失败，请稍后重试"],
    ["failed to join room", "加入房间失败，请稍后重试"],
    ["failed to leave room", "离开房间失败，请稍后重试"],
    ["failed to submit action", "提交动作失败，请稍后重试"],
    ["failed to persist resolved round", "回合写入失败，请稍后重试"],
    ["failed to update room", "房间状态更新失败，请稍后重试"],
    ["supabase_url and supabase_anon_key are required", "联机服务未配置，请联系管理员"],
    ["supabase_url and supabase_service_role_key are required", "服务端联机配置缺失，请联系管理员"],
    ["supabase client not initialized", "联机客户端初始化失败，请重启后再试"],
    ["@supabase/supabase-js is not installed", "联机依赖缺失，请重新安装客户端"],
    ["edge function returned a non-2xx status code", "服务端请求失败，请稍后重试"],
    ["fetch failed", "网络请求失败，请检查网络后重试"],
    ["network request failed", "网络请求失败，请检查网络后重试"],
    ["failed to fetch", "网络请求失败，请检查网络后重试"],
    ["payload.op is required", "请求参数不完整，请重试"],
    ["unsupported op", "请求动作不受支持，请升级客户端"],
    ["invalid current user", "当前登录态异常，请重新登录"],
    ["login failed", "登录失败"],
    ["register failed", "注册失败"]
  ];

  for (const [keyword, translated] of mappings) {
    if (lower.includes(keyword)) return translated;
  }
  return raw;
}

function setStatus(text, type = "normal") {
  if (!statusElement) return;
  statusElement.textContent = text;
  statusElement.classList.remove("error", "success");
  if (type === "error") statusElement.classList.add("error");
  if (type === "success") statusElement.classList.add("success");
}

function setPending(nextPending) {
  pending = Boolean(nextPending);
  if (loginBtn) loginBtn.disabled = pending;
  if (registerBtn) registerBtn.disabled = pending;
  if (switchAuthBtn) switchAuthBtn.disabled = pending;
  if (loginRememberInput) loginRememberInput.disabled = pending;
}

function setMode(nextMode) {
  mode = nextMode === "register" ? "register" : "login";
  const isLogin = mode === "login";
  loginForm?.classList.toggle("hidden", !isLogin);
  registerForm?.classList.toggle("hidden", isLogin);
  if (switchAuthBtn) {
    switchAuthBtn.textContent = isLogin ? "没有账号？去注册" : "已有账号？去登录";
  }
  setStatus(isLogin ? "请先登录" : "注册即可");
}

async function loginAndEnter() {
  const account = loginAccountInput?.value?.trim() || "";
  const password = loginPasswordInput?.value?.trim() || "";
  const remember = Boolean(loginRememberInput?.checked);
  if (!account || !password) {
    setStatus("请填写账号和密码。", "error");
    return;
  }

  setPending(true);
  setStatus("登录中...");
  try {
    const result = await window.petApi.authLogin(account, password);
    if (!result?.ok) {
      setStatus(`登录失败：${localizeAuthErrorMessage(result?.error || "未知错误")}`, "error");
      return;
    }
    setStatus(
      `登录成功，欢迎 ${result.currentUser?.username || result.currentUser?.account || account}。`,
      "success"
    );
    if (remember) {
      saveRememberedLogin(account, password);
    } else {
      clearRememberedLogin();
    }
    window.close();
  } catch (error) {
    setStatus(
      `登录失败：${localizeAuthErrorMessage(error instanceof Error ? error.message : "未知错误")}`,
      "error"
    );
  } finally {
    setPending(false);
  }
}

async function registerAndEnter() {
  const username = registerUsernameInput?.value?.trim() || "";
  const account = registerAccountInput?.value?.trim() || "";
  const password = registerPasswordInput?.value?.trim() || "";
  const confirm = registerConfirmInput?.value?.trim() || "";

  if (!username || !account || !password || !confirm) {
    setStatus("请填写完整注册信息。", "error");
    return;
  }
  if (password !== confirm) {
    setStatus("两次输入的密码不一致。", "error");
    return;
  }

  setPending(true);
  setStatus("注册中...");
  try {
    const result = await window.petApi.authRegister(account, password, username);
    if (!result?.ok) {
      setStatus(`注册失败：${localizeAuthErrorMessage(result?.error || "未知错误")}`, "error");
      return;
    }
    setStatus(
      `注册成功，欢迎 ${result.currentUser?.username || username}（${result.currentUser?.account || account}）。`,
      "success"
    );
    window.close();
  } catch (error) {
    setStatus(
      `注册失败：${localizeAuthErrorMessage(error instanceof Error ? error.message : "未知错误")}`,
      "error"
    );
  } finally {
    setPending(false);
  }
}

function bindEvents() {
  switchAuthBtn?.addEventListener("click", () => {
    if (pending) return;
    setMode(mode === "login" ? "register" : "login");
  });

  loginForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void loginAndEnter();
  });

  registerForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void registerAndEnter();
  });

  window.petApi.onAuthState((session) => {
    if (session?.ok && session.currentUser?.account) {
      window.close();
    }
  });
}

async function bootstrap() {
  try {
    const session = await window.petApi.getAuthSession();
    if (session?.ok && session.currentUser?.account) {
      setStatus(`已登录：${session.currentUser.account}，正在进入...`, "success");
      window.close();
      return;
    }
  } catch {
    // Ignore and stay on auth page.
  }

  bindEvents();
  const remembered = loadRememberedLogin();
  if (remembered) {
    if (loginAccountInput) loginAccountInput.value = remembered.account;
    if (loginPasswordInput) loginPasswordInput.value = remembered.password;
    if (loginRememberInput) loginRememberInput.checked = true;
  }
  setMode("login");
}

bootstrap();
